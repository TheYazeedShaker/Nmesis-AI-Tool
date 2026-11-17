import {StudioError,type RequestContext} from '../studio-server';
import {FEATURE_LABELS,featureOn,type FeatureKey} from '../accounts/plan';
import {keyFile,keysPrefix,KEYS_IGNORED_NOTE,type KeyProvider} from '../org-keys';
import {billingFor,storeOf} from './charge';
import {creditPrices,PROVIDERS,type CostKey,type CreditMeter,type CreditProvider} from './pricing';
import type {Billing,UsageRow} from './store';
// What the pages may know about credits. Credits only: no provider, no provider
// cost, no price book ever leaves the server.
type Ctx=Pick<RequestContext,'DB'|'BUCKET'|'org'|'userId'|'role'|'entitlements'|'account'>;
// Which provider keys the company has saved (orgs/<org>/keys/credentials/): one
// listing, not a request per provider, and never longer than KEYS_WAIT_MS. Only
// for the two answers that need it (a plan with its own keys, or an owner who may
// be told a saved key is ignored); everyone else's credits make no storage call.
// A listing that fails or is late reads as "no saved key" for this answer: the
// labels then say credits, the note is left out, and nothing is charged by it
// (the routes that call a provider read the key themselves).
export const KEYS_WAIT_MS=1500;
type KeyBucket={head(key:string):Promise<unknown>;list?(o:{prefix?:string;limit?:number}):Promise<{objects:{key:string}[]}>};
export async function keyPresence(ctx:Pick<Ctx,'org'>&{BUCKET?:KeyBucket},wait=KEYS_WAIT_MS):Promise<Record<CreditProvider,boolean>>{
 const none=Object.fromEntries(PROVIDERS.map(p=>[p,false])) as Record<CreditProvider,boolean>;
 const bucket=ctx.BUCKET;if(!bucket)return none;
 const prefix=keysPrefix(ctx),files=PROVIDERS.map(p=>prefix+keyFile(p as KeyProvider));
 const read=async():Promise<boolean[]>=>{
  if(bucket.list){
   try{const listed=new Set((await bucket.list({prefix:prefix+'credentials/',limit:50})).objects.map(o=>o.key));return files.map(k=>listed.has(k))}
   catch(e){console.warn('Saved provider keys could not be listed; checking each',e instanceof Error?e.name:'UnknownError')}
  }
  return Promise.all(files.map(k=>bucket.head(k).then(Boolean)));
 };
 let timer:ReturnType<typeof setTimeout>|undefined;
 const late=new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),wait)});
 try{
  const found=await Promise.race([read(),late]);
  if(!found){console.warn('Saved provider keys took too long to read; this answer shows credits',JSON.stringify({org:ctx.org}));return none}
  return Object.fromEntries(PROVIDERS.map((p,i)=>[p,found[i]])) as Record<CreditProvider,boolean>;
 }catch(e){console.warn('Saved provider keys could not be read; this answer shows credits',e instanceof Error?e.name:'UnknownError');return none}
 finally{clearTimeout(timer)}
}
// Which providers this company pays with credits, with its own key, or not at all
// (Nmesis's own workspace).
export async function providerBilling(ctx:Ctx,stored?:Record<CreditProvider,boolean>):Promise<Record<CreditProvider,Billing>>{
 const own=featureOn(ctx.entitlements,'studio.own_keys')&&!!ctx.BUCKET;
 const have=own?stored??await keyPresence(ctx):null;
 return Object.fromEntries(PROVIDERS.map(p=>[p,billingFor(ctx,!!have?.[p])])) as Record<CreditProvider,Billing>;
}
// usage: whether this person may open the Usage page (owners, and staff with
// support access), so the meter and banner link there only for them (F-033).
export type CreditOverview={unlimited:boolean;meter:CreditMeter|null;prices:Record<CostKey,number>;billing:Record<CreditProvider,Billing>;ignoredKeys:string|null;usage:boolean};
// The meter in the top bar, the banner, and every "N credits" label. Everything
// it reads starts at once: the price book (cached), the meter (one round trip
// once the period is known, lib/credits/store.ts) and, only when needed, the
// saved keys. Computed once per request context (a route that asks twice reads
// once); never shared between requests, people or companies.
const overviews=new WeakMap<object,Promise<CreditOverview>>();
export function creditOverview(ctx:Ctx):Promise<CreditOverview>{
 let found=overviews.get(ctx);
 if(!found){found=readOverview(ctx);overviews.set(ctx,found);found.catch(()=>overviews.delete(ctx))}
 return found;
}
async function readOverview(ctx:Ctx):Promise<CreditOverview>{
 const store=storeOf(ctx),internal=ctx.account.org.kind==='internal';
 const own=featureOn(ctx.entitlements,'studio.own_keys');
 // A key saved while the plan had the feature, now ignored: told to the company's owners (S3).
 const mayBeIgnored=!own&&ctx.role==='owner'&&!ctx.account.viewingAs;
 const [book,stored,meter]=await Promise.all([store.priceBook(),own||mayBeIgnored?keyPresence(ctx):Promise.resolve(null),internal?Promise.resolve(null):store.meter(ctx.org)]);
 const billing=await providerBilling(ctx,stored??undefined);
 const ignored=mayBeIgnored&&!!ctx.BUCKET&&!!stored&&PROVIDERS.some(p=>stored[p]);
 return {unlimited:internal,meter,prices:creditPrices(book),billing,ignoredKeys:ignored?KEYS_IGNORED_NOTE:null,usage:canSeeUsage(ctx)};
}
export const canSeeUsage=(ctx:Pick<Ctx,'role'|'account'>)=>ctx.role==='owner'||!!ctx.account.viewingAs;
const toolLabel=(tool:string)=>tool in FEATURE_LABELS?FEATURE_LABELS[tool as FeatureKey]:tool.replace(/^studio\./,'');
export type UsagePage={company:string;unlimited:boolean;meter:CreditMeter|null;byPerson:{who:string;credits:number;actions:number}[];byTool:{tool:string;credits:number;actions:number}[];recent:{at:string;who:string;tool:string;action:string;credits:number;ownKey:boolean}[];packs:{credits:number;left:number;boughtOn:string|null;expiresOn:string|null;expired:boolean}[]};
// The Usage page: for the company's owners, and Nmesis staff with support access.
export async function usagePage(ctx:Ctx,now=Date.now()):Promise<UsagePage>{
 if(!canSeeUsage(ctx))throw new StudioError('Usage is shown to your company’s owners. Ask one of them.',403);
 const store=storeOf(ctx),internal=ctx.account.org.kind==='internal';
 const meter=internal?null:await store.meter(ctx.org,now);
 const since=meter?.periodFrom?meter.periodFrom+'T00:00:00Z':new Date(now-30*86_400_000).toISOString();
 const [period,recent,packs,people]=await Promise.all([store.since(ctx.org,since),store.recent(ctx.org,50),store.packs(ctx.org),store.people(ctx.org)]);
 const names=new Map(people.map(p=>[p.userId,p.email]));
 const who=(id:string)=>names.get(id)||'A former member';
 // One action may be split over the allowance and packs: rows that share a ref are one action.
 const actions=(rows:UsageRow[])=>{const by=new Map<string,UsageRow>();for(const r of rows){const seen=by.get(r.ref);by.set(r.ref,seen?{...seen,credits:seen.credits+r.credits}:r)}return [...by.values()]};
 const sum=(rows:UsageRow[],key:(r:UsageRow)=>string)=>{const m=new Map<string,{credits:number;actions:number}>();for(const r of rows){const k=key(r),v=m.get(k)||{credits:0,actions:0};v.credits+=r.credits;v.actions++;m.set(k,v)}return [...m.entries()].sort((a,b)=>b[1].credits-a[1].credits)};
 const inPeriod=actions(period);
 return {
  company:ctx.account.org.name,unlimited:internal,meter,
  byPerson:sum(inPeriod,r=>who(r.actor)).map(([w,v])=>({who:w,...v})),
  byTool:sum(inPeriod,r=>toolLabel(r.tool)).map(([t,v])=>({tool:t,...v})),
  recent:actions(recent).slice(0,50).map(r=>({at:r.at,who:who(r.actor),tool:toolLabel(r.tool),action:r.action||toolLabel(r.tool),credits:r.credits,ownKey:r.ownKey})),
  packs:packs.map(p=>({credits:p.credits,left:p.left,boughtOn:p.boughtOn,expiresOn:p.expiresOn,expired:!!p.expiresOn&&p.expiresOn<new Date(now).toISOString().slice(0,10)})),
 };
}
