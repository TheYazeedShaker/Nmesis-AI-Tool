import {PROVIDER_LABELS,type CreditMeter,type CreditProvider} from './pricing';
// Credit warnings to a company's owners, and "a provider account of Nmesis has no
// credit" to Nmesis. Email goes through one JSON HTTP email API configured on the
// server (EMAIL_API_URL, EMAIL_API_KEY, EMAIL_FROM; NMESIS_ALERT_EMAIL for Nmesis).
// Without them nothing is sent and the reason is logged: a warning email is never
// worth failing the action that triggered it.
export type Mail={to:string[];subject:string;text:string};
export type Mailer=(mail:Mail)=>Promise<void>;
let override:Mailer|null=null;
// Tests replace the transport; production uses the configured HTTP API.
export function setMailer(mailer:Mailer|null){override=mailer}
function httpMailer():Mailer|null{
 const url=process.env.EMAIL_API_URL,key=process.env.EMAIL_API_KEY,from=process.env.EMAIL_FROM;
 if(!url||!key||!from)return null;
 let endpoint:URL;try{endpoint=new URL(url)}catch{return null}
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password)return null;
 return async mail=>{
  const r=await fetch(endpoint.href,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({from,to:mail.to,subject:mail.subject,text:mail.text}),signal:AbortSignal.timeout(10_000),redirect:'manual'});
  if(!r.ok)throw new Error('The email service answered HTTP '+r.status);
 };
}
export async function sendMail(mail:Mail,purpose:string):Promise<boolean>{
 const to=mail.to.filter(a=>/^[^\s@]{1,64}@[^\s@]{1,255}$/.test(a)).slice(0,20);
 if(!to.length){console.warn('Credit email not sent: no recipient',JSON.stringify({purpose}));return false}
 const send=override??httpMailer();
 if(!send){console.warn('Credit email not sent: email is not configured on this Studio (EMAIL_API_URL, EMAIL_API_KEY, EMAIL_FROM)',JSON.stringify({purpose}));return false}
 try{await send({...mail,to});return true}catch(e){console.error('Credit email failed',JSON.stringify({purpose,reason:e instanceof Error?e.message.slice(0,120):'unknown'}));return false}
}
export function warningMail(company:string,level:80|100,meter:CreditMeter,owners:string[]):Mail{
 const resets=meter.resetsOn?` Your allowance resets on ${meter.resetsOn}.`:'';
 return level===100
  ?{to:owners,subject:'Your Nmesis Studio credits for this month are used',text:`${company} has used all of its Nmesis Studio credits for this month (${meter.used} credits), so new paid actions are paused.${resets} Ask Nmesis to add a pack if you need more before then.\n\nUsage: open the Studio and choose Usage.`}
  :{to:owners,subject:'Your Nmesis Studio credits: 80% used',text:`${company} has used ${meter.used} of its ${meter.used+meter.left} Nmesis Studio credits this month (${meter.percent}%). ${meter.left} are left.${resets} Ask Nmesis to add a pack if you expect to need more.\n\nUsage: open the Studio and choose Usage.`};
}
// One Nmesis alert per provider per 30 minutes per server instance.
const lastAlert=new Map<CreditProvider,number>();
export async function alertNmesis(provider:CreditProvider,now=Date.now()){
 console.error('Nmesis provider account refused for billing',JSON.stringify({provider}));
 const last=lastAlert.get(provider);if(last&&now-last<30*60_000)return false;
 lastAlert.set(provider,now);
 const to=(process.env.NMESIS_ALERT_EMAIL||'').split(',').map(s=>s.trim()).filter(Boolean);
 return sendMail({to,subject:`Studio: the ${PROVIDER_LABELS[provider]} account has no credit`,text:`The Studio's ${PROVIDER_LABELS[provider]} account refused a request for billing (no credit, quota or billing). Client actions using it fail at once and nothing is charged to them. Add credit or raise the billing limit at ${PROVIDER_LABELS[provider]}.`},'nmesis-provider-'+provider);
}
export const resetAlertsForTests=()=>lastAlert.clear();
