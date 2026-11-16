'use client';
import {useEffect,useState} from 'react';
import {staffLabel,workName} from '@/lib/accounts/names';
import Link from 'next/link';
import {Eye,Lock,Info} from 'lucide-react';
import {CreditBanner,loadCredits} from '@/components/credits';
import {StudioTopBar} from '@/components/studio-topbar';
import {Banner} from '@/components/ds/shell';
import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover';
import {FEATURE_LABELS,type FeatureKey} from '@/lib/accounts/plan';
import type {AccountSummary} from '@/lib/accounts/summary';
// The signed-in person's company and plan, loaded once per page from /api/me.
// It only decides what to show: every API route checks the same things again.
let pending:Promise<AccountSummary|null>|undefined;
// The last answer: a part that appears after it arrived draws at once.
let last:AccountSummary|null|undefined;
export function loadAccount(){
 return pending??=fetch('/api/me?page='+encodeURIComponent(location.pathname),{credentials:'same-origin',cache:'no-store'}).then(async r=>{
  if(r.status===401&&(await r.clone().json().catch(()=>null))?.problem==='mfa_required'){location.assign(new URL('/auth/code?next='+encodeURIComponent(location.pathname+location.search),location.origin).href);return null}
  if(r.status===401){location.assign(new URL('/signin?next='+encodeURIComponent(location.pathname+location.search),location.origin).href);return null}
  const d=await r.json().catch(()=>null);
  if(r.status===403&&d?.problem==='no_company'){location.assign(new URL('/auth/no-company',location.origin).href);return null}
  return last=r.ok?d as AccountSummary:null;
 }).catch(()=>{pending=undefined;return null});
}
export function useAccount(){
 const [account,setAccount]=useState<AccountSummary|null>(()=>last??null);
 useEffect(()=>{let live=true;void loadAccount().then(a=>{if(live)setAccount(a)});return()=>{live=false}},[]);
 return account;
}
// Until the account arrives a tool stays visible; the server refuses it anyway.
// Whether this person may read provider and model names (F-050): Nmesis staff,
// and companies whose plan includes their own keys. Everyone else reads plain words.
export const providerNames=(account:AccountSummary|null)=>!!account&&(account.staff||account.features['studio.own_keys']===true);
export const hasFeature=(account:AccountSummary|null,key:FeatureKey)=>!account||account.features[key]!==false;
// The top bar itself (navigation, credits, company switcher, account) is
// components/studio-topbar.tsx.
// Under the top bar: staff "Viewing as" (with support access), a refused company
// link, no plan or a paused subscription, and the 80% / 100% credit banner.
// Until the account and the credits are known (both decide which notices show),
// a marker holds the rest of the page hidden (app/studio-shell.css), so the page
// appears once, with its notices, instead of jumping down when they arrive
// (CLS, F-036). Never longer than NOTICES_WAIT_MS, and never on a failed load.
const NOTICES_WAIT_MS=3000;
function useNoticesSettled(){
 const [settled,setSettled]=useState(false);
 useEffect(()=>{let live=true;const done=()=>{if(live)setSettled(true)};void Promise.allSettled([loadAccount(),loadCredits()]).then(done);const timer=setTimeout(done,NOTICES_WAIT_MS);return()=>{live=false;clearTimeout(timer)}},[]);
 return settled;
}
function Note({ds,kind,icon,children}:{ds:boolean;kind:'info'|'warn';icon:React.ReactNode;children:React.ReactNode}){
 return ds?<Banner kind={kind} icon={icon}>{children}</Banner>
  :<div className={kind==='warn'?'workspace-closed':'viewing-as'} role="status">{icon}<span>{children}</span></div>;
}
// variant 'ds' (the rebuilt screens): the same notices as design-system banners.
export function AccountNotices({variant}:{variant?:'ds'}={}){
 const account=useAccount(),settled=useNoticesSettled();
 // A deep link (/?org=…) the server refused, or could not open, lands here once.
 const [opened]=useState(()=>typeof window==='undefined'?null:new URLSearchParams(window.location.search).get('opened'));
 if(!settled)return <div className="notices-pending" aria-hidden="true"/>;
 if(!account)return null;
 const w=account.workspace,ds=variant==='ds';
 return <>
  {opened==='refused'&&<Note ds={ds} kind="info" icon={<Info size={16}/>}>That company link isn’t open to you, so you are in <b>{workName(account)}</b>.</Note>}
  {opened==='support'&&<Note ds={ds} kind="info" icon={<Info size={16}/>}>Support access not granted for that company, so you are in <b>{workName(account)}</b>. Its owner can allow it in Company settings.</Note>}
  {opened==='failed'&&<Note ds={ds} kind="info" icon={<Info size={16}/>}>That company link could not be opened. Try it again, or choose the company here.</Note>}
  {account.viewingAs&&<Note ds={ds} kind="info" icon={<Eye size={16}/>}>Viewing as <b>{staffLabel(account.brand,account.org)}</b> with support access{account.supportUntil?` until ${new Date(account.supportUntil).toLocaleString()}`:''}. Read-only; every opening is logged and the company’s owner can see it.</Note>}
  {!w.open&&w.noPlan&&<Note ds={ds} kind="warn" icon={<Lock size={16}/>}>Your Studio isn’t part of your plan yet. Ask Nmesis.</Note>}
  {w.open&&<CreditBanner variant={variant}/>}
  {!w.open&&!w.noPlan&&<Note ds={ds} kind="warn" icon={<Lock size={16}/>}>{w.libraryOpen?'Your company’s Studio subscription is not active, so new work is paused.'+(w.libraryUntil?` Your library stays viewable until ${w.libraryUntil}.`:' Your library stays viewable.'):'Your company’s Studio subscription has ended and its library is no longer available here.'} Ask Nmesis to reopen it.</Note>}
  {w.open&&account.role==='viewer'&&!account.viewingAs&&<Note ds={ds} kind="info" icon={<Info size={16}/>}>You can look at your company’s work. Ask your company’s owner for creator access to make new work.</Note>}
 </>;
}
// A company whose subscription has ended (not one that never had a plan): its
// tools are off because the plan ended, not because the plan lacks them (F-051).
export const planEnded=(account:AccountSummary|null)=>!!account&&!account.workspace.open&&!account.workspace.noPlan;
export const PLAN_ENDED_CHIP='Plan ended';
export function AskNmesis({feature,ended}:{feature:FeatureKey;ended?:boolean}){
 return <Popover><PopoverTrigger asChild><button type="button" className="text-button ask-nmesis">Ask Nmesis</button></PopoverTrigger><PopoverContent className="ask-nmesis-popover">{ended?'Your company’s Studio plan has ended, so new work is paused. Ask your Nmesis contact to renew it.':`${FEATURE_LABELS[feature]} isn’t on your company’s plan yet. Ask your Nmesis contact to add it, or to move you to the plan that includes it.`}</PopoverContent></Popover>;
}
export function UpsellChip({feature,account}:{feature:FeatureKey;account:AccountSummary|null}){
 if(!account)return null;
 if(planEnded(account))return <span className="upsell"><span className="plan-chip">{PLAN_ENDED_CHIP}</span><AskNmesis feature={feature} ended/></span>;
 return <span className="upsell"><span className="plan-chip">Available on {account.upsell[feature]}</span><AskNmesis feature={feature}/></span>;
}
// A navigation link to a tool: the link when the plan has it, otherwise its name with the chip.
export function FeatureLink({feature,href,children,current,className}:{feature:FeatureKey;href:string;children:React.ReactNode;current?:boolean;className?:string}){
 const account=useAccount();
 if(hasFeature(account,feature))return <a className={className} href={href} aria-current={current?'page':undefined}>{children}</a>;
 return <span className={'feature-off'+(className?' '+className:'')}>{children}<span className="plan-chip">{planEnded(account)?PLAN_ENDED_CHIP:account!.upsell[feature]}</span></span>;
}
// A whole page for one tool: shown when the plan has it, otherwise a plain notice.
export function PlanGate({feature,children}:{feature:FeatureKey;children:React.ReactNode}){
 const account=useAccount();
 if(hasFeature(account,feature))return <>{children}</>;
 const ended=planEnded(account);
 return <><StudioTopBar/><AccountNotices/><main className="plan-gate"><section><p className="eyebrow">YOUR PLAN</p>{ended?<><h1>Your Studio plan has ended</h1><p className="helper">New work, including {FEATURE_LABELS[feature].toLowerCase()}, is paused. Ask Nmesis to renew your company’s plan.</p><div className="upsell"><span className="plan-chip">{PLAN_ENDED_CHIP}</span><AskNmesis feature={feature} ended/></div></>:<><h1>{FEATURE_LABELS[feature]} is available on {account!.upsell[feature]}</h1><p className="helper">Your company’s plan doesn’t include {FEATURE_LABELS[feature].toLowerCase()} yet. Ask Nmesis to add it.</p><div className="upsell"><span className="plan-chip">Available on {account!.upsell[feature]}</span><AskNmesis feature={feature}/></div></>}<Link className="secondary" href="/">Back to Home</Link></section></main></>;
}
