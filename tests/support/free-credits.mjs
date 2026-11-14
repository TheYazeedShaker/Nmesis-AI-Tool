// A stand-in for lib/credits/charge.ts in the unit tests that are not about
// credits: every action is "internal" (0 credits, never limited), and every call
// is recorded so a test can still check that a failure released its hold and that
// nothing was settled twice. A provider job's reservation still moves the job from
// quoted to submitting in the test's own database, as the real one does.
// tests/credits.test.mjs and tests/credits-access.test.mjs use the real module.
export function freeCredits(){
 const calls=[];let n=0;
 class CreditsRefused extends Error{constructor(needed,left,message='Not enough credits.'){super(message);this.status=402;this.needed=needed;this.left=left}}
 const hold=spend=>({id:'hold-test-'+(++n),credits:0,billing:'internal',provider:spend.provider,costMicros:0,tool:spend.tool,action:spend.action});
 const api={
  JOB_TTL:7*86_400_000,CreditsRefused,
  billingFor:()=>'internal',
  nmesisProviderDown:p=>p+' is unavailable for the Studio right now. Nmesis has been told and is on it. Nothing was charged.',
  storeOf:()=>{throw new Error('No credit store in this test.')},
  warnIfNeeded:async()=>null,
  // Credits as the default price book makes them (USD 0.04 a credit), so approvals
  // carry a real number; set refuse to answer as a company with no credits left.
  refuse:false,
  quoteCredits:async(ctx,micros)=>Math.ceil(micros/40000),tableCredits:async()=>8,tableMicros:async()=>300000,
  async reserveCredits(ctx,spend){
   if(api.refuse)throw new CreditsRefused(1,0,'Your credits for this month are used. Ask Nmesis to add a pack.');
   const h=hold(spend);calls.push(['reserve',h.id,spend.tool]);
   if(spend.job){
    const {table,id,owner,lockUntil}=spend.job,now=Date.now();
    const r=await ctx.DB.prepare(`UPDATE ${table} SET status='submitting',hold_id=?,updated_at=?${lockUntil!==undefined?',lock_until=?':''} WHERE id=? AND owner=? AND status='quoted'`).bind(h.id,now,...(lockUntil!==undefined?[lockUntil]:[]),id,owner).run();
    if(!r.meta.changes){calls.push(['refused',h.id]);const e=new Error('This request has already changed. Refresh it before retrying.');e.status=409;throw e}
   }
   return h;
  },
  async settleCredits(ctx,h){calls.push(['settle',h.id]);return h.credits||0},
  async releaseCredits(ctx,h,e){calls.push(['release',h.id]);return e},
  async charged(ctx,spend,run){const h=await api.reserveCredits(ctx,spend);let value;try{value=await run(h)}catch(e){throw await api.releaseCredits(ctx,h,e)}return {value,credits:await api.settleCredits(ctx,h)}},
  jobHold:(ctx,row,spend)=>row.hold_id?{id:row.hold_id,credits:Number(row.credits)||0,billing:'internal',provider:spend.provider,costMicros:Number(row.estimate)||0,tool:spend.tool,action:spend.action}:null,
 };
 return {api,calls};
}
export const CHARGE_EXPORTS=['JOB_TTL','CreditsRefused','billingFor','nmesisProviderDown','storeOf','warnIfNeeded','quoteCredits','tableCredits','tableMicros','reserveCredits','settleCredits','releaseCredits','charged','jobHold'];
