import {StudioError,type RequestContext} from '../studio-server';
import {NO_CREDIT_STATUS} from '../provider-credit';
import {creditStore,type Billing,type CreditStore,type HoldInput} from './store';
import {creditsFor,notEnoughCredits,PROVIDER_LABELS,isCostKey,type CostKey,type CreditProvider,type PriceBook} from './pricing';
import {alertNmesis,sendMail,warningMail} from './alerts';
import {alertRecipients} from './recipients';
import type {FeatureKey} from '../accounts/plan';
// Every paid action, in six steps: (1) its provider cost is quoted or taken from
// the cost table, (2) converted to credits, (3) reserved atomically against the
// company's balance (a hold), (4) the provider is called, (5) the actual cost is
// settled into accounts.usage_ledger, (6) or, on failure, the hold is released.
// The company's own provider key (studio.own_keys) and Nmesis's own workspace
// are recorded with 0 credits and never limited.
export type Spend={
 tool:FeatureKey;action:string;provider:CreditProvider;
 // true when the company's own key makes the call (lib/org-keys.ts).
 own:boolean;
 // A cost-table key (fixed price) or a provider quote in USD micros.
 cost:CostKey|{micros:number};
 // The credits already shown and approved (a quoted job); otherwise from the cost.
 credits?:number;
 // How long the hold may stay unsettled (sync actions: 15 minutes).
 ttlMs?:number;
 job?:HoldInput['job'];
};
type Ctx=Pick<RequestContext,'DB'|'org'|'userId'|'account'>;
const SYNC_TTL=15*60_000;
// Plain fields: tests load studio sources under Node's strip-only TypeScript mode.
export class CreditsRefused extends StudioError{left:number;needed:number;constructor(needed:number,left:number){super(notEnoughCredits(needed,left),402);this.needed=needed;this.left=left}}
export const nmesisProviderDown=(provider:CreditProvider)=>`${PROVIDER_LABELS[provider]} is unavailable for the Studio right now. Nmesis has been told and is on it. Nothing was charged.`;
export function billingFor(ctx:Pick<Ctx,'account'>,own:boolean):Billing{return ctx.account.org.kind==='internal'?'internal':own?'own key':'credits'}
export function storeOf(ctx:Pick<Ctx,'DB'>):CreditStore{if(!ctx.DB)throw new StudioError('Credits are not connected on this Studio yet. Nothing was charged.',503);return creditStore(ctx.DB)}
export type Hold={id:string;credits:number;billing:Billing;provider:CreditProvider;costMicros:number;tool:FeatureKey;action:string;book?:PriceBook};
// Steps 1–3. Throws CreditsRefused (402) with a plain sentence when the balance
// does not cover the action; nothing is reserved then.
export async function reserveCredits(ctx:Ctx,spend:Spend,now=Date.now()):Promise<Hold>{
 const store=storeOf(ctx),book=await store.priceBook();
 const costMicros=isCostKey(spend.cost)?book.costs[spend.cost]:Math.max(0,Math.ceil(spend.cost.micros));
 const billing=billingFor(ctx,spend.own),credits=spend.credits!==undefined&&Number.isInteger(spend.credits)&&spend.credits>=0?spend.credits:creditsFor(costMicros,book);
 const hold:Hold={id:'hold-'+crypto.randomUUID(),credits:billing==='credits'?credits:0,billing,provider:spend.provider,costMicros,tool:spend.tool,action:spend.action,book};
 const input={id:hold.id,org:ctx.org,actor:ctx.userId,tool:spend.tool,action:spend.action,provider:spend.provider,billing,credits:hold.credits,costMicros,expiresAt:now+(spend.ttlMs??SYNC_TTL),job:spend.job};
 if(await store.reserve(input,now))return hold;
 if(spend.job&&billing!=='credits')throw new StudioError('This request has already changed. Refresh it before retrying.',409);
 const left=(await store.meter(ctx.org).catch(()=>null))?.left??0;
 if(left>=hold.credits){
  // Credits were freed in between (another action released or settled for less):
  // one more try; a job that is no longer quoted was changed by someone else.
  if(await store.reserve(input))return hold;
  throw new StudioError(spend.job?'This request has already changed. Refresh it before retrying.':'Other actions are using your company’s credits right now. Try again in a moment.',409);
 }
 throw new CreditsRefused(hold.credits,left);
}
// Step 5. `actualMicros`: the provider's actual cost when it differs from the
// reservation. Returns the credits charged. A settlement that cannot be written
// is logged loudly and the hold stays held until it expires; the person's work
// is not thrown away for it.
export async function settleCredits(ctx:Ctx,hold:Pick<Hold,'id'|'billing'|'provider'|'costMicros'|'tool'|'action'|'credits'|'book'>,actualMicros?:number):Promise<number>{
 const store=storeOf(ctx),micros=actualMicros!==undefined&&Number.isFinite(actualMicros)&&actualMicros>=0?Math.ceil(actualMicros):hold.costMicros;
 const credits=hold.billing==='credits'?(actualMicros!==undefined?creditsFor(micros,hold.book??await store.priceBook()):hold.credits):0;
 const entry={holdId:hold.id,org:ctx.org,actor:ctx.userId,tool:hold.tool,credits,provider:hold.billing==='own key'?'own key':hold.provider,costUsd:hold.billing==='own key'?null:micros/1_000_000,action:hold.action};
 let charged=credits;
 for(let attempt=0;;attempt++){
  try{charged=await store.settle(entry);break}
  catch(e){if(attempt>=1){console.error('Credit settlement failed',JSON.stringify({org:ctx.org,hold:hold.id,credits,reason:e instanceof Error?e.message.slice(0,160):'unknown'}));return credits}}
 }
 if(hold.billing==='credits')await warnIfNeeded(ctx,store).catch(e=>console.error('Credit warning check failed',e instanceof Error?e.name:'UnknownError'));
 return charged;
}
// Step 6. A provider's own "no credit / quota / billing" refusal on Nmesis's key
// becomes a plain sentence for the client and an alert for Nmesis.
export async function releaseCredits(ctx:Ctx,hold:Pick<Hold,'id'|'billing'|'provider'>,error?:unknown):Promise<unknown>{
 try{await storeOf(ctx).release(hold.id,ctx.org)}catch(e){console.error('Credit hold release failed',JSON.stringify({org:ctx.org,hold:hold.id,reason:e instanceof Error?e.name:'unknown'}))}
 if(error instanceof StudioError&&error.status===NO_CREDIT_STATUS&&!(error instanceof CreditsRefused)&&hold.billing!=='own key'){
  await alertNmesis(hold.provider).catch(()=>false);
  return new StudioError(nmesisProviderDown(hold.provider),503);
 }
 return error;
}
// The usual shape for a synchronous action: reserve, run, settle or release.
export async function charged<T>(ctx:Ctx,spend:Spend,run:(hold:Hold)=>Promise<T>,actualMicros?:(value:T)=>number|undefined):Promise<{value:T;credits:number}>{
 const hold=await reserveCredits(ctx,spend);
 let value:T;
 try{value=await run(hold)}catch(e){throw await releaseCredits(ctx,hold,e)}
 const credits=await settleCredits(ctx,hold,actualMicros?.(value));
 return {value,credits};
}
// The 80% and 100% warnings: a banner (from the meter) and one email per level
// per billing period to the people the owners chose in Company settings, or to
// the company's owners when they chose nobody (lib/credits/recipients.ts).
export async function warnIfNeeded(ctx:Ctx,store:CreditStore=storeOf(ctx)){
 const meter=await store.meter(ctx.org);
 if(!meter.level||!meter.periodFrom)return null;
 if(!await store.markAlert(ctx.org,meter.periodFrom,meter.level))return null;
 const people=await store.people(ctx.org).catch(e=>{console.error('Credit warning: the company’s people could not be read',e instanceof Error?e.name:'UnknownError');return []});
 const to=await alertRecipients(ctx.DB,ctx.org,people);
 await sendMail(warningMail(ctx.account.org.name,meter.level,meter,to),'credits-'+meter.level);
 return meter.level;
}

// Provider jobs (Higgsfield films, swaps and images; Topaz upscales) are quoted,
// reserved, submitted and later refreshed across several requests. The job row
// keeps the hold's id (hold_id) and its credits; these rebuild the hold from it.
export const JOB_TTL=7*86_400_000;
// The credits a provider quote converts to, for this company (0 on its own key
// or in Nmesis's own workspace).
export async function quoteCredits(ctx:Ctx,micros:number,own:boolean):Promise<number>{
 if(billingFor(ctx,own)!=='credits')return 0;
 return creditsFor(micros,await storeOf(ctx).priceBook());
}
export function jobHold(ctx:Pick<Ctx,'account'>,row:{hold_id?:string|null;credits?:number|null;estimate?:number|null},spend:{own:boolean;provider:CreditProvider;tool:FeatureKey;action:string}):Hold|null{
 if(!row.hold_id)return null;
 return {id:row.hold_id,credits:Math.max(0,Number(row.credits)||0),billing:billingFor(ctx,spend.own),provider:spend.provider,costMicros:Math.max(0,Number(row.estimate)||0),tool:spend.tool,action:spend.action};
}
// The credits of a fixed-price action (a cost-table key), for this company.
export async function tableCredits(ctx:Ctx,key:CostKey,own:boolean):Promise<number>{
 if(billingFor(ctx,own)!=='credits')return 0;
 const book=await storeOf(ctx).priceBook();return creditsFor(book.costs[key],book);
}
export const tableMicros=async(ctx:Ctx,key:CostKey)=>(await storeOf(ctx).priceBook()).costs[key];
