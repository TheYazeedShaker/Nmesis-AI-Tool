'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Coins,Info} from 'lucide-react';
import {Banner} from '@/components/ds/shell';
import {creditsLabel,CREDITS_USED} from '@/lib/credits/words';
import type {CreditOverview} from '@/lib/credits/usage';
import type {CostKey,CreditProvider} from '@/lib/credits/pricing';
// The company's credits as the workspace shows them: the top-bar meter, the
// 80% / 100% banner, "N credits" before an action and "Used N credits" after it.
// Loaded once per page from /api/credits and refreshed after each paid action.
// It loads on its own: nothing on a page waits for it except the notices
// (components/studio-account.tsx), and the meter holds its place with a
// skeleton of its own size until it arrives (components/studio-topbar.tsx).
// The server decides every charge; these only show it.
let pending:Promise<CreditOverview|null>|undefined;
const listeners=new Set<(o:CreditOverview|null)=>void>();
// The last answer, so a part that appears after it arrived (the credit banner,
// once the notices know what to show) draws at once instead of a moment later.
let last:CreditOverview|null|undefined;
export function loadCredits(){
 return pending??=fetch('/api/credits',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(CREDITS_TIMEOUT_MS)}).then(async r=>r.ok?await r.json() as CreditOverview:null).then(o=>{last=o;return o}).catch(()=>{pending=undefined;answered=true;return null});
}
// A request that never answers ends here: the meter is then left out, not a skeleton forever.
const CREDITS_TIMEOUT_MS=20_000;
// Answered at least once on this page (even with a failure).
let answered=false;
/** Whether the credits have been answered on this page. */
export const creditsKnown=()=>answered||last!==undefined;
/** True once the credits have been answered (or failed): until then the meter shows its skeleton. */
export function useCreditsAnswered(){
 const [done,setDone]=useState(creditsKnown);
 useEffect(()=>{if(done)return;let live=true;void loadCredits().then(()=>{if(live)setDone(true)});return()=>{live=false}},[done]);
 return done;
}
// Call after a paid action finishes (or fails): the meter and banner catch up.
export function refreshCredits(){pending=undefined;void loadCredits().then(o=>{for(const l of listeners)l(o)})}
// While a page is open and visible the meter also catches up every 30 seconds and
// when the tab comes back, so work finished elsewhere (another tab, a teammate)
// shows without a reload.
let timer:ReturnType<typeof setInterval>|undefined;
function watch(){
 if(timer||typeof window==='undefined')return;
 timer=setInterval(()=>{if(document.visibilityState==='visible'&&listeners.size)refreshCredits()},30_000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&listeners.size)refreshCredits()});
}
export function useCredits(){
 const [overview,setOverview]=useState<CreditOverview|null>(()=>last??null);
 useEffect(()=>{let live=true;const on=(o:CreditOverview|null)=>{if(live)setOverview(o)};listeners.add(on);watch();void loadCredits().then(on);return()=>{live=false;listeners.delete(on)}},[]);
 return overview;
}
// "8 credits", "Your own key · 0 credits" or, in Nmesis's own workspace, "Not counted".
export function costLabel(o:CreditOverview|null,cost:CostKey|number|null|undefined,provider:CreditProvider){
 if(!o||cost===null||cost===undefined)return '';
 const billing=o.billing[provider];
 if(billing==='own key')return 'Your own key · 0 credits';
 const n=typeof cost==='number'?cost:o.prices[cost];
 if(typeof n!=='number')return '';
 return billing==='internal'?`${creditsLabel(n)} · not counted here`:creditsLabel(n);
}
export function CreditCost({cost,provider,className}:{cost:CostKey|number|null|undefined;provider:CreditProvider;className?:string}){
 const o=useCredits(),label=costLabel(o,cost,provider);
 if(!label)return null;
 return <span className={'credit-cost'+(className?' '+className:'')} title="What this costs before it starts"><Coins size={13} aria-hidden="true"/>{label}</span>;
}
export function CreditsUsed({credits}:{credits:number|null|undefined}){
 if(typeof credits!=='number')return null;
 return <span className="credit-used"><Coins size={12} aria-hidden="true"/>Used {creditsLabel(credits)}</span>;
}
// Top bar: used / left this period, coloured at 80% and 100%; one click to Usage
// for those who may open it (owners, staff with access). For everyone else it is
// a statement, not a link to a page that would refuse them (F-033).
export function CreditMeter(){
 const o=useCredits();
 if(!o||o.unlimited||!o.meter)return null;
 const m=o.meter,className='credit-meter'+(m.level===100?' credit-out':m.level===80?' credit-low':''),words=`${creditsLabel(m.used)} used and ${creditsLabel(m.left)} left this month.`;
 const inner=<><Coins size={14} aria-hidden="true"/><span className="credit-numbers"><b>{m.used.toLocaleString('en-US')}</b> used · <b>{m.left.toLocaleString('en-US')}</b> left</span>
  <span className="credit-bar" aria-hidden="true"><span style={{width:Math.min(100,m.percent)+'%'}}/></span></>;
 return o.usage
  ?<Link href="/usage" className={className} title={words+' Open Usage.'} aria-label={`Credits: ${m.used} used, ${m.left} left this month. Open Usage.`}>{inner}</Link>
  :<span className={className} title={words} role="img" aria-label={`Credits: ${m.used} used, ${m.left} left this month.`}>{inner}</span>;
}
// Under the top bar at 80% and 100%.
export function CreditBanner({variant}:{variant?:'ds'}={}){
 const o=useCredits();
 if(!o||o.unlimited||!o.meter||!o.meter.level)return null;
 const m=o.meter,resets=m.resetsOn?` They reset on ${m.resetsOn}.`:'';
 const words=<>{m.level===100?CREDITS_USED+resets:`Your company has used ${m.percent}% of this month’s credits: ${creditsLabel(m.left)} left.${resets} Ask Nmesis to add a pack if you need more.`}{o.usage?<> <Link className={variant==='ds'?'ds-link':undefined} href="/usage">Usage</Link></>:null}</>;
 if(variant==='ds')return <Banner kind={m.level===100?'bad':'warn'} icon={<Info/>}>{words}</Banner>;
 return <div className={'credit-banner'+(m.level===100?' credit-out':'')} role="status"><Info size={16}/><span>{words}</span></div>;
}
// For companies without their own keys: no key fields, just who provides the AI.
export function NmesisProvides({provider}:{provider:CreditProvider}){
 const o=useCredits();
 const left=o?.meter?.left;
 return <div className="nmesis-provides"><Coins size={18} aria-hidden="true"/><span><b>Nmesis provides the AI for your plan.</b><small>{o?.unlimited?'This is Nmesis’s own workspace: actions here are recorded and not counted against a client.':typeof left==='number'?`Your company has ${creditsLabel(left)} left this month. `:''}{o&&!o.unlimited&&o.usage&&<Link href="/usage">Usage</Link>}</small>{o?.ignoredKeys&&provider&&<small className="keys-ignored">{o.ignoredKeys}</small>}</span></div>;
}
