'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {Aperture,BarChart3,Building2,Check,ChevronsUpDown,Clapperboard,Eye,Film,ImageIcon,Layers,Lock,LogOut,Menu,Replace,Settings} from 'lucide-react';
import {Dialog} from '@/components/ds/dialog';
import {loadCredits,useCredits} from '@/components/credits';
import {hasFeature,loadAccount,planEnded,PLAN_ENDED_CHIP,useAccount} from '@/components/studio-account';
import {creditsLabel} from '@/lib/credits/words';
import type {FeatureKey} from '@/lib/accounts/plan';
import type {AccountSummary} from '@/lib/accounts/summary';

// The Studio's one top bar (Phase 2b): the brand, one shared navigation, the
// credit meter, the company switcher and the account; below 768px the
// navigation and the account move into one menu, every control 44px tall.
// Built from the design system (.ds- classes, tokens), dark like the screens
// until Phase 3 moves the screens themselves onto the tokens.
//
// No layout shift: the bar's height is fixed, and everything that waits for
// /api/me and /api/credits appears at once, at the right-hand end, where it
// pushes nothing.

export type StudioPage='visuals'|'lineup'|'storyboard'|'films'|'swap'|'usage'|'company'|'lab';
type Tool={key:StudioPage;href:string;label:string;icon:React.ReactNode;feature?:FeatureKey};
export const STUDIO_NAV:Tool[]=[
 {key:'visuals',href:'/',label:'Key visuals',icon:<ImageIcon/>},
 {key:'lineup',href:'/lineup',label:'Car lineup',icon:<Layers/>,feature:'studio.lineups'},
 {key:'storyboard',href:'/storyboard',label:'Story studio',icon:<Clapperboard/>,feature:'studio.storyboards'},
 {key:'films',href:'/films',label:'Films',icon:<Film/>,feature:'studio.film'},
 {key:'swap',href:'/swap',label:'Replace car',icon:<Replace/>,feature:'studio.swap'},
];
// A screen's own control in the bar (Films: Video connection): words while they
// fit, its icon (with its name) when the bar is tight, a row in the phone menu.
export type BarAction={label:string;icon:React.ReactNode;onClick:()=>void};
const ROLE_LABEL={owner:'Owner',creator:'Creator',viewer:'Viewer'} as const;
const offChip=(account:AccountSummary|null,feature:FeatureKey)=>planEnded(account)?PLAN_ENDED_CHIP:`On ${account?.upsell[feature]}`;

// The account and the credits, together: the bar's end appears once, complete.
function useShellData(){
 const account=useAccount(),credits=useCredits();
 const [ready,setReady]=useState(false);
 useEffect(()=>{let live=true;void Promise.allSettled([loadAccount(),loadCredits()]).then(()=>{if(live)setReady(true)});return()=>{live=false}},[]);
 return {account,credits,ready:ready&&!!account};
}

async function switchCompany(orgId:string){
 const r=await fetch('/api/auth/org',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({orgId})});
 if(r.ok){location.reload();return ''}
 const d=await r.json().catch(()=>({}));return (d as {error?:string}).error||'The company could not be changed.';
}
function useSwitch(){
 const [busy,setBusy]=useState(false),[problem,setProblem]=useState('');
 const choose=async(account:AccountSummary,orgId:string)=>{if(orgId===account.org.id)return;setBusy(true);setProblem('');try{const p=await switchCompany(orgId);if(p)setProblem(p)}catch{setProblem('The connection was interrupted. Try again.')}setBusy(false)};
 return {busy,problem,choose};
}
const sectionsOf=(account:AccountSummary)=>account.switcher?[{label:'Nmesis',orgs:account.switcher.nmesis},{label:'Clients',orgs:account.switcher.clients}].filter(s=>s.orgs.length):[{label:'',orgs:account.orgs}];
const initials=(name:string)=>name.split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase();

function NavLink({tool,account,current}:{tool:Tool;account:AccountSummary|null;current?:StudioPage}){
 const on=!tool.feature||hasFeature(account,tool.feature);
 if(!on)return <span className="ds-nav-link studio-nav-off" aria-disabled="true" title={`${tool.label}: ${offChip(account,tool.feature!)}`}><Lock aria-hidden="true"/><span className="ds-nav-word" aria-hidden="true">{tool.label}</span><span className="ds-sr-only">{`${tool.label}, ${offChip(account,tool.feature!)}`}</span></span>;
 return <Link className="ds-nav-link" href={tool.href} aria-current={current===tool.key?'page':undefined} aria-label={tool.label}><span aria-hidden="true">{tool.icon}</span><span className="ds-nav-word">{tool.label}</span></Link>;
}

function Meter({credits}:{credits:ReturnType<typeof useCredits>}){
 if(!credits||credits.unlimited||!credits.meter)return null;
 const m=credits.meter,level=m.level===100?'out':m.level===80?'warn':'ok';
 // The name starts with the visible words ("300 left"), so voice control and screen readers agree (2.5.3, F-024).
 const words=`${m.left.toLocaleString('en-US')} left. Credits: ${creditsLabel(m.used)} used and ${creditsLabel(m.left)} left this month.`;
 const inner=<><span className="ds-meter-track" aria-hidden="true"><span className="ds-meter-fill" style={{transform:`scaleX(${Math.min(100,m.percent)/100})`}}/></span><span aria-hidden="true"><b>{m.left.toLocaleString('en-US')}</b> <span className="ds-meter-word ds-meter-left">left</span></span></>;
 return credits.usage
  ?<Link className="ds-meter studio-meter" href="/usage" data-level={level} aria-label={words+' Open Usage.'} title={words}>{inner}</Link>
  :<span className="ds-meter studio-meter" data-level={level} role="img" aria-label={words} title={words}>{inner}</span>;
}

// The companies, as rows: staff see Nmesis and Clients (read-only); a search
// from nine. The same list in the desktop switcher and the phone menu.
function CompanyList({account,busy,onChoose}:{account:AccountSummary;busy:boolean;onChoose:(id:string)=>void}){
 const [query,setQuery]=useState('');
 const sections=sectionsOf(account),total=sections.reduce((n,s)=>n+s.orgs.length,0),q=query.trim().toLowerCase();
 const shown=sections.map(s=>({...s,orgs:s.orgs.filter(o=>!q||o.name.toLowerCase().includes(q))})).filter(s=>s.orgs.length);
 return <>
  {total>=9&&<div className="ds-field"><label className="ds-label" htmlFor="studio-company-search">Search companies</label><input id="studio-company-search" className="ds-input" type="search" value={query} onChange={e=>setQuery(e.target.value)} autoComplete="off"/></div>}
  {shown.length===0&&<p className="ds-muted">No company with that name.</p>}
  {shown.map(s=><div key={s.label||'companies'} className="studio-menu-group" role="group" aria-label={s.label||'Companies'}>{s.label&&<p className="ds-muted">{s.label}</p>}{s.orgs.map(o=><button key={o.id} type="button" className="studio-menu-row" disabled={busy} aria-current={o.id===account.org.id||undefined} onClick={()=>onChoose(o.id)}><Building2 aria-hidden="true"/><span className="ds-truncate">{o.name}</span>{o.id===account.org.id?<Check aria-label="Current"/>:s.label==='Clients'?<Eye aria-label="Read-only"/>:null}</button>)}</div>)}
 </>;
}

// The switcher: a modal, so focus stays in it and nothing on the page sits
// under it while it is open.
function Switcher({account,busy,onChoose}:{account:AccountSummary;busy:boolean;onChoose:(id:string)=>void}){
 const [open,setOpen]=useState(false);
 const face=<><span className="ds-avatar" aria-hidden="true">{initials(account.org.name)}</span><span className="ds-switcher-name ds-truncate">{account.org.name}</span></>;
 if(account.orgs.length<=1&&!account.switcher)return <span className="ds-switcher studio-switcher" title={account.org.name}>{face}<span className="ds-sr-only">{'Company: '+account.org.name}</span></span>;
 return <>
  <button type="button" className="ds-switcher studio-switcher" aria-haspopup="dialog" aria-label={`Company: ${account.org.name}. Switch company.`} title={account.org.name} disabled={busy} onClick={()=>setOpen(true)}>{face}<ChevronsUpDown aria-hidden="true"/></button>
  <Dialog open={open} onClose={()=>setOpen(false)} title="Switch company" className="studio-menu"><CompanyList account={account} busy={busy} onChoose={id=>{setOpen(false);onChoose(id)}}/></Dialog>
 </>;
}

function SignOut({account,withWord}:{account:AccountSummary;withWord?:boolean}){
 return <form method="post" action="/auth/signout" className="studio-signout"><button type="submit" className={withWord?'ds-btn studio-menu-row':'ds-btn icon'} aria-label={withWord?undefined:'Sign out'} title={'Signed in as '+account.user.email}><LogOut aria-hidden="true"/>{withWord&&'Sign out'}</button></form>;
}

// Below 768px: the tools, the page's own actions, the company and the account.
function PhoneMenu({account,current,actions,busy,onChoose}:{account:AccountSummary;current?:StudioPage;actions?:BarAction[];busy:boolean;onChoose:(id:string)=>void}){
 const [open,setOpen]=useState(false);
 const many=sectionsOf(account).reduce((n,s)=>n+s.orgs.length,0)>1;
 const settings=account.role==='owner'&&!account.internal||account.viewingAs;
 return <>
  <button type="button" className="ds-btn icon studio-menu-button" aria-haspopup="dialog" aria-label="Menu" onClick={()=>setOpen(true)}><Menu aria-hidden="true"/></button>
  <Dialog open={open} onClose={()=>setOpen(false)} title="Menu" variant="drawer" className="studio-menu">
   <nav aria-label="Tools" className="studio-menu-group">
    <p className="ds-label-caps">Tools</p>
    {STUDIO_NAV.map(t=>!t.feature||hasFeature(account,t.feature)
     ?<Link key={t.key} className="studio-menu-row" href={t.href} aria-current={current===t.key?'page':undefined} onClick={()=>setOpen(false)}><span aria-hidden="true">{t.icon}</span>{t.label}</Link>
     :<span key={t.key} className="studio-menu-row studio-nav-off" aria-disabled="true"><Lock aria-hidden="true"/>{t.label}<span className="ds-badge">{offChip(account,t.feature)}</span></span>)}
   </nav>
   {!!actions?.length&&<div className="studio-menu-group">{actions.map(a=><button key={a.label} type="button" className="studio-menu-row" onClick={()=>{setOpen(false);a.onClick()}}><span aria-hidden="true">{a.icon}</span>{a.label}</button>)}</div>}
   <div className="studio-menu-group">
    <p className="ds-label-caps">Company</p>
    {many?<CompanyList account={account} busy={busy} onChoose={id=>{setOpen(false);onChoose(id)}}/>
     :<span className="studio-menu-row"><Building2 aria-hidden="true"/><span className="ds-truncate">{account.org.name}</span></span>}
    <span className="studio-menu-row ds-muted">{account.viewingAs?'Staff':ROLE_LABEL[account.role]}</span>
   </div>
   <div className="studio-menu-group">
    <p className="ds-label-caps">Account</p>
    <Link className="studio-menu-row" href="/usage" aria-current={current==='usage'?'page':undefined} onClick={()=>setOpen(false)}><BarChart3 aria-hidden="true"/>Usage</Link>
    {settings&&<Link className="studio-menu-row" href="/company" aria-current={current==='company'?'page':undefined} onClick={()=>setOpen(false)}><Settings aria-hidden="true"/>Company settings</Link>}
    <SignOut account={account} withWord/>
   </div>
  </Dialog>
 </>;
}

// Words in the navigation while they fit; icons (each with its name) when the
// bar is full: a link is never covered by the bar's own end (check:ui overlap).
function useFit(bar:React.RefObject<HTMLElement|null>){
 useLayoutEffect(()=>{
  const el=bar.current,nav=el?.querySelector<HTMLElement>('.studio-nav'),end=el?.querySelector<HTMLElement>('.studio-topbar-end');
  if(!el||!nav||!end||typeof ResizeObserver==='undefined')return;
  // First the navigation's words go, then the actions' words.
  const full=()=>nav.scrollWidth>nav.clientWidth+1;
  const fit=()=>{el.removeAttribute('data-compact');el.removeAttribute('data-tight');if(full()){el.setAttribute('data-compact','');if(full())el.setAttribute('data-tight','')}};
  fit();const watch=new ResizeObserver(fit);watch.observe(el);watch.observe(end);return()=>watch.disconnect();
 },[bar]);
}

export function StudioTopBar({current,actions}:{current?:StudioPage;/** The page's own controls (a connection button); in the menu on phones. */actions?:BarAction[]}){
 const {account,credits,ready}=useShellData();
 const bar=useRef<HTMLElement>(null);useFit(bar);
 const {busy,problem,choose}=useSwitch();
 const settings=!!account&&(account.role==='owner'&&!account.internal||account.viewingAs);
 return <header ref={bar} className="ds-topbar studio-topbar" data-theme="dark">
  <Link className="ds-brand" href="/" aria-label="Nmesis Studio, Key visuals">
   <span className="ds-brand-mark" aria-hidden="true"><Aperture/></span>
   <span aria-hidden="true">NMESIS <span className="ds-brand-sub">STUDIO</span></span>
  </Link>
  <nav className="ds-nav studio-nav" aria-label="Main">{STUDIO_NAV.map(t=><NavLink key={t.key} tool={t} account={account} current={current}/>)}</nav>
  <div className="ds-topbar-end studio-topbar-end">
   {!!actions?.length&&<div className="studio-topbar-actions">{actions.map(a=><button key={a.label} type="button" className="ds-btn sm" aria-label={a.label} title={a.label} onClick={a.onClick}><span aria-hidden="true">{a.icon}</span><span className="studio-action-word" aria-hidden="true">{a.label}</span></button>)}</div>}
   {ready&&account&&<>
    {problem&&<span className="studio-topbar-problem" role="alert">{problem}</span>}
    {account.workspace.open&&<Meter credits={credits}/>}
    <span className="studio-wide"><Switcher account={account} busy={busy} onChoose={id=>void choose(account,id)}/></span>
    <span className="studio-wide studio-role">{account.viewingAs?'Staff':ROLE_LABEL[account.role]}</span>
    {settings&&<Link className="ds-btn icon studio-wide" href="/company" aria-label="Company settings" title="Company settings" aria-current={current==='company'?'page':undefined}><Settings aria-hidden="true"/></Link>}
    <span className="studio-wide"><SignOut account={account}/></span>
    <span className="studio-narrow"><PhoneMenu account={account} current={current} actions={actions} busy={busy} onChoose={id=>void choose(account,id)}/></span>
   </>}
  </div>
 </header>;
}
