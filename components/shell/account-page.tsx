'use client';
import * as React from 'react';
import Link from 'next/link';
import {LogOut,Pencil} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {Field,Input} from '@/components/ds/field';
import {PageHeader,Section} from '@/components/ds/layout';
import {useToast} from '@/components/ds/toast';
import {useCredits,useCreditsAnswered} from '@/components/credits';
import {AccountNotices,planEnded,reloadAccount,useAccount} from '@/components/studio-account';
import {WorkspaceFrame} from '@/components/workspace/frame';
import {workName} from '@/lib/accounts/names';
import type {AccountSummary} from '@/lib/accounts/summary';
import {dayDate} from '@/lib/ds/words';
import {THEME_CHOICES,setTheme,useTheme} from '@/lib/theme';
import {Avatar} from './side-nav';

// Your account, as cards: who you are (and your name, which you may change),
// your company and role, the theme, your password and signing out, and your
// company's plan and credits. Everything here is the person's own; the name is
// saved by app/api/account/profile, which checks the same rules again.
const ROLE={owner:'Owner',creator:'Creator',viewer:'Viewer'} as const;
const NAME_MAX=80;
const SAVE_TIMEOUT_MS=20_000;

// Why the name is read-only here, or null when it may change. The server
// refuses the same people: staff viewing a company, viewers, and a company
// whose Studio is paused (lib/accounts/plan.ts checkRoute).
function nameLock(a:AccountSummary):string|null{
 if(a.viewingAs)return 'You are viewing this company as Nmesis staff, so your name is read-only here.';
 if(a.role==='viewer')return 'Your role is viewer, so your name is read-only here.';
 if(!a.workspace.open)return 'Your company’s Studio is paused, so your name can’t be changed right now.';
 return null;
}
// The same rule as the server, so the common mistakes are said without a round trip.
function nameProblem(name:string){
 if(!name)return 'Enter your name.';
 if(name.length>NAME_MAX)return `Keep your name to ${NAME_MAX} characters or fewer.`;
 return '';
}
const tidy=(v:string)=>v.replace(/\s+/g,' ').trim();

function Loading({width}:{width?:'short'}){
 return <><span className={width==='short'?'ds-skel ds-skel-line account-skel short':'ds-skel ds-skel-line account-skel'} aria-hidden="true"/><span className="ds-sr-only">Loading</span></>;
}
function Fact({label,children}:{label:string;children:React.ReactNode}){
 return <div className="account-fact"><dt>{label}</dt><dd>{children}</dd></div>;
}

function ProfileCard({account}:{account:AccountSummary}){
 const {toast}=useToast();
 const [editing,setEditing]=React.useState(false),[draft,setDraft]=React.useState(''),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
 const input=React.useRef<HTMLInputElement>(null),edit=React.useRef<HTMLButtonElement>(null),opened=React.useRef(false);
 const lock=nameLock(account),name=account.user.name;
 // Focus follows the editor: into the box when it opens, back to Edit when it closes.
 React.useEffect(()=>{if(editing){opened.current=true;input.current?.focus()}else if(opened.current)edit.current?.focus()},[editing]);
 const start=()=>{setDraft(name||'');setError('');setEditing(true)};
 const cancel=()=>{if(!busy){setEditing(false);setError('')}};
 async function save(e:React.FormEvent){
  e.preventDefault();if(busy)return;
  const next=tidy(draft),problem=nameProblem(next);
  if(problem){setError(problem);input.current?.focus();return}
  if(next===name){setEditing(false);return}
  setBusy(true);setError('');
  try{
   const r=await fetch('/api/account/profile',{method:'PATCH',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:next}),signal:AbortSignal.timeout(SAVE_TIMEOUT_MS)});
   const d=await r.json().catch(()=>null) as {name?:unknown;error?:unknown}|null;
   if(!r.ok||typeof d?.name!=='string'){setError(typeof d?.error==='string'?d.error:'Your name could not be saved. Try again.');input.current?.focus();return}
   void reloadAccount({name:d.name});
   setEditing(false);
   toast({message:'Your name is saved.',kind:'ok'});
  }catch(err){
   setError(err instanceof DOMException&&err.name==='TimeoutError'?'Saving took too long. Try again.':'Your name could not be saved. Check your connection and try again.');
   input.current?.focus();
  }finally{setBusy(false)}
 }
 return <Section title="Profile" className="account-card">
  <div className="account-who">
   <Avatar account={account}/>
   <span className="account-names">
    {name?<b className="account-name ds-truncate" title={name}>{name}</b>:<span className="account-name ds-muted">No name yet</span>}
    <span className="ds-truncate ds-muted" title={account.user.email}>{account.user.email}</span>
   </span>
   {!lock&&!editing&&<Button ref={edit} size="sm" icon={<Pencil aria-hidden="true"/>} aria-label="Edit your name" onClick={start}>Edit</Button>}
  </div>
  {editing&&<form className="account-name-form" noValidate onSubmit={save} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();cancel()}}}>
   <Field label="Your name" error={error||undefined} help={error?undefined:'Shown in your account menu.'} count={{value:tidy(draft).length,max:NAME_MAX}}>
    <Input ref={input} value={draft} autoComplete="name" spellCheck={false} onChange={e=>{setDraft(e.target.value);if(error)setError('')}}/>
   </Field>
   <div className="account-actions">
    <Button kind="primary" type="submit" busy={busy}>Save</Button>
    <Button disabled={busy} onClick={cancel}>Cancel</Button>
   </div>
  </form>}
  {lock&&<p className="ds-help">{lock}</p>}
 </Section>;
}

/** How many people are in the company (every member may read the team). null while it loads; 'unknown' when it could not be read. */
function useMemberCount(org:string,skip:boolean){
 const [count,setCount]=React.useState<{org:string;n:number|null}|null>(null);
 React.useEffect(()=>{
  if(skip)return;let live=true;
  fetch('/api/company/team',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10_000)})
   .then(async r=>{if(!r.ok)throw new Error('team answered '+r.status);return await r.json() as {seats?:{taken?:unknown}}})
   .then(d=>{if(live)setCount({org,n:typeof d.seats?.taken==='number'?d.seats.taken:null})})
   // A detail of the card: without it, the card says so and the rest still works.
   .catch((e:unknown)=>{console.warn('[account] member count unavailable',e instanceof Error?e.message:e);if(live)setCount({org,n:null})});
  return()=>{live=false};
 },[org,skip]);
 return count&&count.org===org?count.n??'unknown':null;
}

function CompanyCard({account}:{account:AccountSummary}){
 // Nmesis's own workspace has no Team section in Settings, so no count or link.
 const team=!account.internal,members=useMemberCount(account.org.id,!team);
 return <Section title="Company" className="account-card">
  <dl className="account-facts">
   <Fact label="Company">{workName(account)}</Fact>
   <Fact label="Your role">{account.viewingAs?'Staff (read-only)':ROLE[account.role]}</Fact>
   {team&&<Fact label="Members">{members===null?<Loading width="short"/>:members==='unknown'?<span className="ds-muted">Not available right now</span>:members===1?'1 member':`${members.toLocaleString('en-US')} members`}</Fact>}
  </dl>
  {team&&<div className="account-foot"><Link className="ds-link" href="/company">Members</Link></div>}
 </Section>;
}

function ThemeCard(){
 const theme=useTheme();
 return <Section title="Theme" className="account-card">
  <div className="ds-segmented studio-theme" role="group" aria-label="Theme">{THEME_CHOICES.map(t=><button key={t.id} type="button" aria-pressed={theme===t.id} onClick={()=>setTheme(t.id)}>{t.label}</button>)}</div>
  <p className="ds-help">System follows your computer’s light or dark setting. Kept in this browser.</p>
 </Section>;
}

function SecurityCard({account}:{account:AccountSummary}){
 return <Section title="Password and security" className="account-card">
  <dl className="account-facts">
   <Fact label="Password">To change it, we email a link to <span className="account-email">{account.user.email}</span> that takes you to choose a new one.</Fact>
  </dl>
  <div className="account-foot account-actions">
   <Link className="ds-link" href="/signin/forgot">Send a password link</Link>
   <span className="ds-spacer"/>
   <form method="post" action="/auth/signout"><Button type="submit" icon={<LogOut aria-hidden="true"/>}>Log out</Button></form>
  </div>
 </Section>;
}

function PlanCard({account}:{account:AccountSummary}){
 const credits=useCredits(),answered=useCreditsAnswered(),p=account.plan;
 const plan=p.none?'No plan yet':p.name||(account.internal?'Nmesis’s own workspace':'Your plan');
 const meter=credits&&!credits.unlimited?credits.meter:null;
 return <Section title="Plan and credits" className="account-card">
  <dl className="account-facts">
   <Fact label="Plan">{plan}{planEnded(account)?' (ended)':''}</Fact>
   <Fact label="Credits left">{credits?.unlimited?'Not counted in this workspace'
    :meter?<>{meter.left.toLocaleString('en-US')} this month{meter.resetsOn&&<span className="ds-help account-sub">They reset on {dayDate(meter.resetsOn)||meter.resetsOn}.</span>}</>
    :answered?<span className="ds-muted">Not available right now</span>:<Loading/>}</Fact>
  </dl>
  {credits?.usage&&<div className="account-foot"><Link className="ds-link" href="/usage">Plans and credits</Link></div>}
 </Section>;
}

export function AccountPage(){
 const account=useAccount();
 return <WorkspaceFrame current="account" notices={<AccountNotices variant="ds"/>}>
  <div className="account-page">
   <PageHeader title="Your account" lede="Who you are signed in as, your company, and how the Studio looks for you."/>
   {account?<div className="account-cards">
    <ProfileCard account={account}/>
    <CompanyCard account={account}/>
    <ThemeCard/>
    <SecurityCard account={account}/>
    <PlanCard account={account}/>
   </div>:<div className="account-cards" aria-busy="true">
    <p className="ds-sr-only" role="status">Loading your account…</p>
    <div className="ds-skel-panel" aria-hidden="true"><span className="ds-skel ds-skel-line short"/><span className="ds-skel ds-skel-line mid"/></div>
    <div className="ds-skel-panel" aria-hidden="true"><span className="ds-skel ds-skel-line short"/><span className="ds-skel ds-skel-line mid"/></div>
   </div>}
  </div>
 </WorkspaceFrame>;
}
