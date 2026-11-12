'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Aperture,Building2,Eye,LogOut,Lock,Info} from 'lucide-react';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover';
import {FEATURE_LABELS,type FeatureKey} from '@/lib/accounts/plan';
import type {AccountSummary} from '@/lib/accounts/summary';
// The signed-in person's company and plan, loaded once per page from /api/me.
// It only decides what to show: every API route checks the same things again.
let pending:Promise<AccountSummary|null>|undefined;
export function loadAccount(){
 return pending??=fetch('/api/me?page='+encodeURIComponent(location.pathname),{credentials:'same-origin',cache:'no-store'}).then(async r=>{
  if(r.status===401){location.assign(new URL('/signin?next='+encodeURIComponent(location.pathname+location.search),location.origin).href);return null}
  const d=await r.json().catch(()=>null);
  if(r.status===403&&d?.problem==='no_company'){location.assign(new URL('/auth/no-company',location.origin).href);return null}
  return r.ok?d as AccountSummary:null;
 }).catch(()=>{pending=undefined;return null});
}
export function useAccount(){
 const [account,setAccount]=useState<AccountSummary|null>(null);
 useEffect(()=>{let live=true;void loadAccount().then(a=>{if(live)setAccount(a)});return()=>{live=false}},[]);
 return account;
}
// Until the account arrives a tool stays visible; the server refuses it anyway.
export const hasFeature=(account:AccountSummary|null,key:FeatureKey)=>!account||account.features[key]!==false;
const ROLE_LABEL={owner:'Owner',creator:'Creator',viewer:'Viewer'} as const;
export function AccountBar(){
 const account=useAccount();const [busy,setBusy]=useState(false),[problem,setProblem]=useState('');
 async function choose(orgId:string){if(!account||orgId===account.org.id)return;setBusy(true);setProblem('');try{const r=await fetch('/api/auth/org',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({orgId})});if(r.ok){location.reload();return}const d=await r.json().catch(()=>({}));setProblem(d.error||'The company could not be changed.')}catch{setProblem('The connection was interrupted. Try again.')}setBusy(false)}
 if(!account)return null;
 return <div className="account-bar">
  {account.orgs.length>1?<Select value={account.org.id} onValueChange={v=>void choose(v)} disabled={busy}><SelectTrigger className="account-switch" aria-label="Company"><Building2 size={14}/><SelectValue/></SelectTrigger><SelectContent>{account.orgs.map(o=><SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent></Select>
   :<span className="account-org"><Building2 size={14}/>{account.org.name}</span>}
  <span className="account-role">{account.viewingAs?'Staff':ROLE_LABEL[account.role]}</span>
  {problem&&<span className="account-problem" role="alert">{problem}</span>}
  <form method="post" action="/auth/signout"><button className="secondary" type="submit" title={'Signed in as '+account.user.email}><LogOut size={14}/>Sign out</button></form>
 </div>;
}
// Under the top bar: staff "Viewing as", and a paused subscription.
export function AccountNotices(){
 const account=useAccount();if(!account)return null;
 const w=account.workspace;
 return <>
  {account.viewingAs&&<div className="viewing-as" role="status"><Eye size={16}/><span>Viewing as <b>{account.org.name}</b>. Read-only; this visit is logged.</span></div>}
  {!w.open&&<div className="workspace-closed" role="status"><Lock size={16}/><span>{w.libraryOpen?'Your company’s Studio subscription is not active, so new work is paused.'+(w.libraryUntil?` Your library stays viewable until ${w.libraryUntil}.`:' Your library stays viewable.'):'Your company’s Studio subscription has ended and its library is no longer available here.'} Ask Nmesis to reopen it.</span></div>}
  {w.open&&account.role==='viewer'&&!account.viewingAs&&<div className="viewing-as" role="status"><Info size={16}/><span>You can look at your company’s work. Ask your company’s owner for creator access to make new work.</span></div>}
 </>;
}
export function AskNmesis({feature}:{feature:FeatureKey}){
 return <Popover><PopoverTrigger asChild><button type="button" className="text-button ask-nmesis">Ask Nmesis</button></PopoverTrigger><PopoverContent className="ask-nmesis-popover">{FEATURE_LABELS[feature]} isn’t on your company’s plan yet. Ask your Nmesis contact to add it, or to move you to the plan that includes it.</PopoverContent></Popover>;
}
export function UpsellChip({feature,account}:{feature:FeatureKey;account:AccountSummary|null}){
 if(!account)return null;
 return <span className="upsell"><span className="plan-chip">Available on {account.upsell[feature]}</span><AskNmesis feature={feature}/></span>;
}
// A navigation link to a tool: the link when the plan has it, otherwise its name with the chip.
export function FeatureLink({feature,href,children,current,className}:{feature:FeatureKey;href:string;children:React.ReactNode;current?:boolean;className?:string}){
 const account=useAccount();
 if(hasFeature(account,feature))return <a className={className} href={href} aria-current={current?'page':undefined}>{children}</a>;
 return <span className={'feature-off'+(className?' '+className:'')}>{children}<span className="plan-chip">{account!.upsell[feature]}</span></span>;
}
// A whole page for one tool: shown when the plan has it, otherwise a plain notice.
export function PlanGate({feature,children}:{feature:FeatureKey;children:React.ReactNode}){
 const account=useAccount();
 if(hasFeature(account,feature))return <>{children}</>;
 return <><header className="topbar"><Link href="/" className="brand"><Aperture/><span>NMESIS <b>STUDIO</b></span></Link><AccountBar/></header><AccountNotices/><main className="plan-gate"><section><p className="eyebrow">YOUR PLAN</p><h1>{FEATURE_LABELS[feature]} is available on {account!.upsell[feature]}</h1><p className="helper">Your company’s plan doesn’t include {FEATURE_LABELS[feature].toLowerCase()} yet. Ask Nmesis to add it.</p><div className="upsell"><span className="plan-chip">Available on {account!.upsell[feature]}</span><AskNmesis feature={feature}/></div><Link className="secondary" href="/">Back to key visuals</Link></section></main></>;
}
