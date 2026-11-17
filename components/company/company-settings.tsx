'use client';
import * as React from 'react';
import {Check,Minus} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {Loading,SkeletonPanel,State} from '@/components/ds/feedback';
import {PageHeader,Section} from '@/components/ds/layout';
import {useAccount} from '@/components/studio-account';
import {BrandMark} from '@/components/studio-topbar';
import {count,dayDate} from '@/lib/ds/words';
import type {CompanyOverview,NotificationsState} from '@/lib/company';
import type {TeamPage} from '@/lib/accounts/team';
import type {SupportState} from '@/lib/support-access';
import {AskNmesisButton} from './ask-nmesis';
import {NotificationsSection} from './notifications';
import {OwnKeysSection} from './own-keys';
import {SupportSection} from './support';
import {TeamSection} from './team';
import {api} from './api';

// Company settings (design finish pass), in the Phase 2b frame and the design
// system, light and dark. Team, plan, brand, credit emails, own keys (own-key
// plans only) and Nmesis support access. Everyone in the company reads; only
// its own owners change anything; Nmesis staff with support access read.
// The company's legal name belongs on this page.

function PlanSection({o,owner}:{o:CompanyOverview;owner:boolean}){
 const p=o.plan;
 const name=p.none?'No plan yet':p.name||(o.internal?'Nmesis’s own workspace':'Your plan');
 return <Section title="Plan">
  <dl className="plan-facts">
   <div><dt>Plan</dt><dd>{name}{p.ended?' (ended)':''}</dd></div>
   {p.periodFrom&&p.periodTo&&<div><dt>This period</dt><dd>{dayDate(p.periodFrom)} to {dayDate(p.periodTo)}</dd></div>}
   {p.ended&&p.endsOn&&<div><dt>Ended on</dt><dd>{dayDate(p.endsOn)}</dd></div>}
   {p.creditsMonthly!==null&&<div><dt>Credits each month</dt><dd>{count(p.creditsMonthly)}</dd></div>}
   <div><dt>Largest picture</dt><dd>{p.maxOutput}</dd></div>
   <div><dt>Seats</dt><dd>{p.seats!==null?count(p.seats):'No set number'}</dd></div>
  </dl>
  <h3 className="ds-label settings-sub">What’s included</h3>
  <ul className="plan-features">
   {p.features.map(f=><li key={f.key} className="plan-feature" data-on={f.on}>{f.on?<Check aria-hidden="true"/>:<Minus aria-hidden="true"/>}<span>{f.label}<span className="ds-sr-only">{f.on?': included':': not included'}</span></span></li>)}
  </ul>
  {p.none&&<p className="settings-line">Your Studio isn’t part of your plan yet.</p>}
  {owner?<AskNmesisButton topic="plan">Ask Nmesis about your plan</AskNmesisButton>:<p className="settings-line">Your company’s owners can ask Nmesis to change the plan.</p>}
 </Section>;
}

function BrandSection({o}:{o:CompanyOverview}){
 return <Section title={o.brands.length>1?'Brands':'Brand'}>
  {o.brands.length?<ul className="brand-list">{o.brands.map(b=><li key={b.id} className="brand-item"><BrandMark brand={b}/><span>{b.name}</span></li>)}</ul>
   :<p className="settings-line">No brand yet.</p>}
  <p className="settings-line">Nmesis sets up your {o.brands.length>1?'brands':'brand'} and {o.brands.length>1?'their':'its'} cars. Ask Nmesis to change them.</p>
 </Section>;
}

// One section's own loading and failure, so one slow answer never holds the page.
function useLoad<T>(url:string|null){
 const [value,setValue]=React.useState<T|null>(null),[problem,setProblem]=React.useState(''),[attempt,setAttempt]=React.useState(0);
 React.useEffect(()=>{
  if(!url)return;let live=true;
  api<T>(url).then(v=>{if(live){setValue(v);setProblem('')}}).catch(e=>{if(live)setProblem(e instanceof Error?e.message:'This could not be loaded.')});
  return()=>{live=false};
 },[url,attempt]);
 return {value,setValue,problem,retry:()=>{setProblem('');setAttempt(a=>a+1)}};
}
function Part<T>({load,title,children}:{load:{value:T|null;problem:string;retry:()=>void};title:string;children:(v:T)=>React.ReactNode}){
 if(load.value)return <>{children(load.value)}</>;
 if(load.problem)return <Section title={title}><State kind="error" title={`${title} didn’t load`} actions={<Button onClick={load.retry}>Try again</Button>}>{load.problem}</State></Section>;
 return <Loading label={`Loading ${title.toLowerCase()}`}><SkeletonPanel/></Loading>;
}

// The page's content, inside the frame app/company/page.tsx draws.
export function CompanySettingsView(){
 const account=useAccount();
 const overview=useLoad<CompanyOverview>('/api/company');
 const internal=overview.value?.internal??account?.internal??false;
 const team=useLoad<TeamPage>(internal?null:'/api/company/team');
 const notes=useLoad<NotificationsState>(internal?null:'/api/company/notifications');
 const support=useLoad<SupportState>(internal?null:'/api/company/support');
 const o=overview.value,owner=!!o?.canEdit;
 const lede=!o?'':o.internal?'Nmesis’s own workspace. Its team and plan are managed in the Nmesis admin.':o.canEdit?'Your team, your plan and who Nmesis may help. You can change them as an owner.':o.viewingAs?'Read-only: you are viewing with support access.':'You can read these settings; your company’s owners change them.';
 return <div className="settings-page">
   <PageHeader eyebrow="Company settings" title={o?.company||account?.org.name||'Your company'} lede={lede}/>
   {overview.problem&&!o?<State kind="error" title="Company settings didn’t load" actions={<Button onClick={overview.retry}>Try again</Button>}>{overview.problem}</State>
    :!o?<Loading label="Loading company settings" className="ds-stack"><SkeletonPanel/><SkeletonPanel/></Loading>
    :<>
     {!o.internal&&<Part load={team} title="Team">{t=><TeamSection team={t} owner={owner} onTeam={team.setValue}/>}</Part>}
     <PlanSection o={o} owner={owner}/>
     {!o.internal&&<BrandSection o={o}/>}
     {!o.internal&&<Part load={notes} title="Credit emails">{n=><NotificationsSection state={n} onState={notes.setValue}/>}</Part>}
     {o.ownKeys&&!o.internal&&<OwnKeysSection/>}
     {!o.internal&&<Part load={support} title="Nmesis support access">{s=><SupportSection state={s} onState={support.setValue}/>}</Part>}
    </>}
 </div>;
}
