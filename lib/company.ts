import {StudioError,type RequestContext} from './studio-server';
import {FEATURES,FEATURE_LABELS,featureOn,maxEdge,type FeatureKey} from './accounts/plan';
import {seatLimit} from './accounts/team';
import {storeOf} from './credits/charge';
import {sendMail} from './credits/alerts';
import {chosenRecipients,MAX_RECIPIENTS,recipientEmails,saveRecipients} from './credits/recipients';
// Company settings (app/company): the plan, the brands, who gets the credit
// emails, and "Ask Nmesis". Everyone in the company reads; only its own owners
// change anything (not Nmesis staff viewing with support access).
type Ctx=Pick<RequestContext,'DB'|'org'|'userId'|'role'|'account'|'entitlements'>;
export const canEditCompany=(ctx:Pick<Ctx,'role'|'account'>)=>ctx.role==='owner'&&!ctx.account.viewingAs&&ctx.account.org.kind!=='internal';
export function requireCompanyOwner(ctx:Pick<Ctx,'role'|'account'>,what='these settings'){
 if(ctx.account.viewingAs)throw new StudioError(`You are viewing with support access, so ${what} are read-only.`,403);
 if(!canEditCompany(ctx))throw new StudioError(`Only your company’s owners can change ${what}.`,403);
}
export type CompanyOverview={
 company:string;internal:boolean;role:string;viewingAs:boolean;canEdit:boolean;
 plan:{name:string|null;none:boolean;ended:boolean;endsOn:string|null;features:{key:FeatureKey;label:string;on:boolean}[];maxOutput:string;creditsMonthly:number|null;seats:number|null;periodFrom:string|null;periodTo:string|null};
 brands:{id:string;name:string}[];ownKeys:boolean;
};
const EDGE_WORDS:Record<number,string>={2048:'2K',3840:'4K',7680:'8K'};
export async function companyOverview(ctx:Ctx):Promise<CompanyOverview>{
 const e=ctx.entitlements,internal=ctx.account.org.kind==='internal';
 let periodFrom:string|null=null,periodTo:string|null=null;
 if(!internal&&ctx.DB){
  try{const b=await storeOf(ctx).balance(ctx.org);periodFrom=b.periodFrom;periodTo=b.periodTo}
  catch(err){console.warn('Company settings: the plan period could not be read',err instanceof Error?err.name:'UnknownError')}
 }
 const monthly=Number(e.features['studio.credits_monthly']);
 return {
  company:ctx.account.org.name,internal,role:ctx.role,viewingAs:ctx.account.viewingAs,canEdit:canEditCompany(ctx),
  plan:{name:e.planName,none:!!e.noPlan,ended:e.status==='ended'||e.status==='cancelled',endsOn:e.endsOn,
   features:FEATURES.map(k=>({key:k,label:FEATURE_LABELS[k],on:featureOn(e,k)})),
   maxOutput:EDGE_WORDS[maxEdge(e)]||'2K',creditsMonthly:Number.isFinite(monthly)&&e.features['studio.credits_monthly']!==undefined?monthly:null,seats:seatLimit(e),periodFrom,periodTo},
  brands:ctx.account.brands.map(b=>({id:b.id,name:b.name})),ownKeys:featureOn(e,'studio.own_keys'),
 };
}

// ── Notifications: who gets the 80% and 100% credit emails ─────────────────
export type NotificationsState={
 canEdit:boolean;
 /** Owners (and staff with support access): the company's people and whether each gets them. */
 people:{userId:string;email:string;role:string;chosen:boolean;you:boolean}[];
 /** No choice saved (or nobody chosen is left): the owners get them. */
 fallback:boolean;
 count:number;
 /** Whether the person asking gets them. */
 you:boolean;
};
function db(ctx:Pick<Ctx,'DB'>){if(!ctx.DB)throw new StudioError('Company settings are not connected on this Studio yet.',503);return ctx.DB}
export async function notificationsState(ctx:Ctx):Promise<NotificationsState>{
 const people=await storeOf(ctx).people(ctx.org),chosen=await chosenRecipients(db(ctx),ctx.org);
 const {emails,fallback}=recipientEmails(people,chosen),full=ctx.role==='owner'||ctx.account.viewingAs;
 const me=people.find(p=>p.userId===ctx.userId);
 return {
  canEdit:canEditCompany(ctx),fallback,count:emails.length,you:!!me&&emails.includes(me.email),
  people:full?people.map(p=>({userId:p.userId,email:p.email,role:p.role,chosen:emails.includes(p.email),you:p.userId===ctx.userId})):[],
 };
}
export async function saveNotifications(ctx:Ctx,body:Record<string,unknown>,now=Date.now()):Promise<NotificationsState>{
 requireCompanyOwner(ctx,'the credit emails');
 const ids=body.userIds;
 if(!Array.isArray(ids)||ids.some(v=>typeof v!=='string'))throw new StudioError('Choose who gets the credit emails.');
 const unique=[...new Set(ids as string[])];
 if(!unique.length)throw new StudioError('Choose at least one person.');
 if(unique.length>MAX_RECIPIENTS)throw new StudioError(`Choose at most ${MAX_RECIPIENTS} people.`);
 const people=await storeOf(ctx).people(ctx.org),known=new Set(people.map(p=>p.userId));
 if(unique.some(id=>!known.has(id)))throw new StudioError('Choose people who are in your company.');
 await saveRecipients(db(ctx),ctx.org,ctx.userId,unique,now);
 return notificationsState(ctx);
}

// ── "Ask Nmesis" for more seats, a credit pack or a plan change ────────────
export const ASK_TOPICS={seats:'more seats',pack:'a credit pack',plan:'a change to the plan'} as const;
export type AskTopic=keyof typeof ASK_TOPICS;
const ASK_EVERY=10*60_000;
const asked=new Map<string,number>();
// One email to Nmesis (NMESIS_ALERT_EMAIL) per company and topic per 10 minutes
// per server instance; a repeat inside that time is answered the same way.
export async function askNmesis(ctx:Ctx,body:Record<string,unknown>,now=Date.now()):Promise<{said:string}>{
 requireCompanyOwner(ctx,'the plan');
 const topic=body.topic;
 if(typeof topic!=='string'||!(topic in ASK_TOPICS))throw new StudioError('Choose what to ask Nmesis for.');
 const key=ctx.org+'|'+topic,last=asked.get(key),said=`Nmesis has been asked for ${ASK_TOPICS[topic as AskTopic]}. They reply to ${ctx.account.user.email}.`;
 if(last&&now-last<ASK_EVERY)return {said};
 const to=(process.env.NMESIS_ALERT_EMAIL||'').split(',').map(s=>s.trim()).filter(Boolean);
 const sent=await sendMail({to,subject:`Studio: ${ctx.account.org.name} asks for ${ASK_TOPICS[topic as AskTopic]}`,text:`${ctx.account.user.email}, an owner of ${ctx.account.org.name} (company ${ctx.org}), asked for ${ASK_TOPICS[topic as AskTopic]} from the Studio's Company settings. Reply to them, then change the plan or add the pack in the admin.`},'ask-nmesis-'+topic);
 if(!sent)throw new StudioError('Nmesis couldn’t be told from here. Ask your Nmesis contact directly.',503);
 asked.set(key,now);if(asked.size>1000)asked.clear();
 return {said};
}
export const resetAsksForTests=()=>asked.clear();
