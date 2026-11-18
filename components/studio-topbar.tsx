'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {Aperture,BarChart3,Building2,Check,ChevronDown,ChevronsUpDown,Clapperboard,Eye,Film,FolderOpen,Home,ImageIcon,LayoutGrid,Layers,Lock,LogOut,Menu,Replace,Settings,Shapes} from 'lucide-react';
import {Dialog} from '@/components/ds/dialog';
import {useCredits,useCreditsAnswered} from '@/components/credits';
import {hasFeature,planEnded,PLAN_ENDED_CHIP,useAccount} from '@/components/studio-account';
import {creditsLabel} from '@/lib/credits/words';
import type {FeatureKey} from '@/lib/accounts/plan';
import type {AccountSummary} from '@/lib/accounts/summary';
import {staffLabel,workName} from '@/lib/accounts/names';
import {logoMissing,logoSrc,logoView} from '@/lib/brand-logo';
import type {CreditOverview} from '@/lib/credits/usage';

// The Studio's one top bar (Phase 2b): the brand, one shared navigation, the
// credit meter, the company switcher and the account; below 768px the
// navigation and the account move into one menu, every control 44px tall.
// Built from the design system (.ds- classes, tokens). Phase 3: the places
// (Home, Library, Projects) and a Tools menu; light and dark on the new
// screens, dark on the tool screens until they are rebuilt (group 2).
//
// No layout shift: the bar's height is fixed, and what waits for /api/me
// appears at the right-hand end, where it pushes nothing. The credit meter
// loads on its own (speed, finish pass): the account's end of the bar appears
// as soon as the account is known, with a skeleton of the meter's own size in
// the meter's place until the credits arrive.

export type StudioPage='home'|'library'|'projects'|'brand'|'account'|'visuals'|'lineup'|'storyboard'|'films'|'swap'|'usage'|'company'|'lab';
type Tool={key:StudioPage;href:string;label:string;icon:React.ReactNode;feature?:FeatureKey};
// The places: the same for everybody.
export const STUDIO_PLACES:Tool[]=[
 {key:'home',href:'/',label:'Home',icon:<Home/>},
 {key:'library',href:'/library',label:'Library',icon:<LayoutGrid/>},
 {key:'projects',href:'/projects',label:'Projects',icon:<FolderOpen/>},
];
export const KEY_VISUAL_HREF='/key-visual';
// The tools, in the Tools menu; a tool the plan lacks shows its plan.
export const STUDIO_NAV:Tool[]=[
 {key:'visuals',href:KEY_VISUAL_HREF,label:'Key visual',icon:<ImageIcon/>},
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

// The account, and the credits on their own. A preview (the design-system
// proposals) passes synthetic ones instead.
export type ShellPreview={account:AccountSummary;credits:CreditOverview|null};
function useShellData(preview?:ShellPreview){
 const account=useAccount(),credits=useCredits(),answered=useCreditsAnswered();
 if(preview)return {account:preview.account,credits:preview.credits,creditsAnswered:true};
 return {account,credits,creditsAnswered:answered};
}

async function switchTo(place:Place){
 const r=await fetch('/api/auth/org',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({orgId:place.orgId,brandId:place.brandId})});
 if(r.ok){location.reload();return ''}
 const d=await r.json().catch(()=>({}));return (d as {error?:string}).error||'That could not be opened.';
}
export function useSwitch(){
 const [busy,setBusy]=useState(false),[problem,setProblem]=useState('');
 const choose=async(account:AccountSummary,place:Place)=>{if(isHere(account,place))return;setBusy(true);setProblem('');try{const p=await switchTo(place);if(p)setProblem(p)}catch{setProblem('The connection was interrupted. Try again.')}setBusy(false)};
 return {busy,problem,choose};
}
// Where a person can work: a company's brand (clients work as their brand), or
// a company with no brand (Nmesis's own workspace). Clients see the brand's
// name only; staff see "Brand · Company" so they know whose workspace it is.
export type Place={key:string;orgId:string;brandId?:string;label:string;brand:{id:string;name:string}|null};
type Org={id:string;name:string;brands?:{id:string;name:string}[]};
const placesOf=(orgs:Org[],staff:boolean):Place[]=>orgs.flatMap((o):Place[]=>o.brands?.length
 ?o.brands.map(b=>({key:o.id+'/'+b.id,orgId:o.id,brandId:b.id,label:staff?staffLabel(b,o):b.name,brand:b}))
 :[{key:o.id,orgId:o.id,label:o.name,brand:null}]);
const isHere=(account:AccountSummary,p:Place)=>p.orgId===account.org.id&&(p.brandId??null)===(account.brand?.id??null);
export const sectionsOf=(account:AccountSummary)=>account.switcher
 ?[{label:'Nmesis',places:placesOf(account.switcher.nmesis,true)},{label:'Clients',places:placesOf(account.switcher.clients,true)}].filter(s=>s.places.length)
 :[{label:'',places:placesOf(account.orgs,false)}];
export const brandsOnly=(account:AccountSummary)=>!account.switcher&&account.orgs.every(o=>o.brands?.length);

/** A brand's logo (from its configurator, cached by the Studio) on its plate.
 * With no logo (the route answers 204) the name beside it stands alone: nothing
 * is drawn, or, with `blank`, an empty space of the mark's size so a list keeps
 * its names in line. Never initials next to the same name (lib/brand-logo.ts). */
export function BrandMark({brand,blank}:{brand:{id:string;name:string}|null|undefined;blank?:boolean}){
 const [failed,setFailed]=useState(false);
 if(!brand||logoView(brand,failed)==='name')return blank?<span className="ds-avatar studio-brand-blank" aria-hidden="true"/>:null;
 return <span className="ds-avatar studio-brand-mark" aria-hidden="true">
  {/* eslint-disable-next-line @next/next/no-img-element -- a private logo on a signed link, sized by the avatar */}
  <img src={logoSrc(brand.id)} alt="" onError={()=>{logoMissing(brand.id);setFailed(true)}}/>
 </span>;
}

function NavLink({tool,account,current}:{tool:Tool;account:AccountSummary|null;current?:StudioPage}){
 const on=!tool.feature||hasFeature(account,tool.feature);
 if(!on)return <span className="ds-nav-link studio-nav-off" aria-disabled="true" title={`${tool.label}: ${offChip(account,tool.feature!)}`}><Lock aria-hidden="true"/><span className="ds-nav-word" aria-hidden="true">{tool.label}</span><span className="ds-sr-only">{`${tool.label}, ${offChip(account,tool.feature!)}`}</span></span>;
 return <Link className="ds-nav-link" href={tool.href} aria-current={current===tool.key?'page':undefined} aria-label={tool.label}><span aria-hidden="true">{tool.icon}</span><span className="ds-nav-word">{tool.label}</span></Link>;
}

function ToolsMenu({account,current}:{account:AccountSummary|null;current?:StudioPage}){
 const [open,setOpen]=useState(false);const root=useRef<HTMLDivElement>(null);
 const here=STUDIO_NAV.some(t=>t.key===current);
 useEffect(()=>{if(!open)return;const away=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false)};document.addEventListener('pointerdown',away);return()=>document.removeEventListener('pointerdown',away)},[open]);
 return <div ref={root} className="studio-tools" onKeyDown={e=>{if(e.key==='Escape'&&open){e.stopPropagation();setOpen(false);root.current?.querySelector<HTMLButtonElement>('button')?.focus()}}} onBlur={e=>{if(!root.current?.contains(e.relatedTarget as Node))setOpen(false)}}>
  <button type="button" className="ds-nav-link" aria-expanded={open} aria-controls="studio-tools-list" data-current={here||undefined} aria-label="Tools" onClick={()=>setOpen(o=>!o)}><span aria-hidden="true"><Shapes/></span><span className="ds-nav-word">Tools</span><ChevronDown aria-hidden="true" className="studio-tools-caret"/></button>
  {open&&<ul id="studio-tools-list" className="studio-tools-list" aria-label="Tools">{STUDIO_NAV.map(t=><li key={t.key}>{!t.feature||hasFeature(account,t.feature)
   ?<Link className="studio-menu-row" href={t.href} aria-current={current===t.key?'page':undefined} onClick={()=>setOpen(false)}><span aria-hidden="true">{t.icon}</span>{t.label}</Link>
   :<span className="studio-menu-row studio-nav-off" aria-disabled="true"><Lock aria-hidden="true"/>{t.label}<span className="ds-badge">{offChip(account,t.feature)}</span></span>}</li>)}</ul>}
 </div>;
}

// While the credits load: the meter's own shape and size, so nothing moves when they arrive.
export function MeterSkeleton(){
 return <span className="ds-meter studio-meter studio-meter-loading" aria-hidden="true"><span className="ds-meter-track"/><span className="ds-skel ds-skel-line studio-meter-skel"/></span>;
}
export function Meter({credits}:{credits:ReturnType<typeof useCredits>}){
 if(!credits||credits.unlimited||!credits.meter)return null;
 const m=credits.meter,level=m.level===100?'out':m.level===80?'warn':'ok';
 // The name starts with the visible words ("300 left"), so voice control and screen readers agree (2.5.3, F-024).
 const words=`${m.left.toLocaleString('en-US')} left. Credits: ${creditsLabel(m.used)} used and ${creditsLabel(m.left)} left this month.`;
 const inner=<><span className="ds-meter-track" aria-hidden="true"><span className="ds-meter-fill" style={{transform:`scaleX(${Math.min(100,m.percent)/100})`}}/></span><span aria-hidden="true"><b>{m.left.toLocaleString('en-US')}</b> <span className="ds-meter-word ds-meter-left">left</span></span></>;
 return credits.usage
  ?<Link className="ds-meter studio-meter" href="/usage" data-level={level} aria-label={words+' Open Usage.'} title={words}>{inner}</Link>
  :<span className="ds-meter studio-meter" data-level={level} role="img" aria-label={words} title={words}>{inner}</span>;
}

// The places, as rows: staff see Nmesis and Clients (read-only); a search from
// nine. The same list in the desktop switcher and the phone menu.
export function PlaceList({account,busy,onChoose}:{account:AccountSummary;busy:boolean;onChoose:(p:Place)=>void}){
 const [query,setQuery]=useState('');
 const sections=sectionsOf(account),total=sections.reduce((n,s)=>n+s.places.length,0),q=query.trim().toLowerCase();
 const shown=sections.map(s=>({...s,places:s.places.filter(p=>!q||p.label.toLowerCase().includes(q))})).filter(s=>s.places.length);
 const noun=brandsOnly(account)?'brand':'company';
 return <>
  {total>=9&&<div className="ds-field"><label className="ds-label" htmlFor="studio-company-search">{brandsOnly(account)?'Search brands':'Search'}</label><input id="studio-company-search" className="ds-input" type="search" value={query} onChange={e=>setQuery(e.target.value)} autoComplete="off"/></div>}
  {shown.length===0&&<p className="ds-muted">{'No '+noun+' with that name.'}</p>}
  {shown.map(s=><div key={s.label||'places'} className="studio-menu-group" role="group" aria-label={s.label||(brandsOnly(account)?'Brands':'Companies')}>{s.label&&<p className="ds-muted">{s.label}</p>}{s.places.map(p=><button key={p.key} type="button" className="studio-menu-row" disabled={busy} aria-current={isHere(account,p)||undefined} onClick={()=>onChoose(p)}>{p.brand?<BrandMark brand={p.brand} blank/>:<Building2 aria-hidden="true"/>}<span className="ds-truncate">{p.label}</span>{isHere(account,p)?<Check aria-label="Current"/>:s.label==='Clients'?<Eye aria-label="Read-only"/>:null}</button>)}</div>)}
 </>;
}

// The switcher: a modal, so focus stays in it and nothing on the page sits
// under it while it is open. Its face is the brand people work as.
function Switcher({account,busy,onChoose}:{account:AccountSummary;busy:boolean;onChoose:(p:Place)=>void}){
 const [open,setOpen]=useState(false);
 const name=workName(account),noun=brandsOnly(account)?'brand':'company';
 const face=<><BrandMark brand={account.brand}/><span className="ds-switcher-name ds-truncate">{name}</span></>;
 if(sectionsOf(account).reduce((n,s)=>n+s.places.length,0)<=1)return <span className="ds-switcher studio-switcher" title={name}>{face}<span className="ds-sr-only">{(account.brand?'Brand: ':'Company: ')+name}</span></span>;
 return <>
  <button type="button" className="ds-switcher studio-switcher" aria-haspopup="dialog" title={name} disabled={busy} onClick={()=>setOpen(true)}>{face}<span className="ds-sr-only">{', switch '+noun}</span><ChevronsUpDown aria-hidden="true"/></button>
  <Dialog open={open} onClose={()=>setOpen(false)} title={'Switch '+noun} className="studio-menu"><PlaceList account={account} busy={busy} onChoose={p=>{setOpen(false);onChoose(p)}}/></Dialog>
 </>;
}

export function SignOut({account,withWord}:{account:AccountSummary;withWord?:boolean}){
 return <form method="post" action="/auth/signout" className="studio-signout"><button type="submit" className={withWord?'ds-btn studio-menu-row':'ds-btn icon'} aria-label={withWord?undefined:'Sign out'} title={'Signed in as '+account.user.email}><LogOut aria-hidden="true"/>{withWord&&'Sign out'}</button></form>;
}

// Below 768px: the tools, the page's own actions, the company and the account.
function PhoneMenu({account,current,actions,busy,onChoose}:{account:AccountSummary;current?:StudioPage;actions?:BarAction[];busy:boolean;onChoose:(p:Place)=>void}){
 const [open,setOpen]=useState(false);
 const many=sectionsOf(account).reduce((n,s)=>n+s.places.length,0)>1;
 const settings=account.role==='owner'&&!account.internal||account.viewingAs;
 return <>
  <button type="button" className="ds-btn icon studio-menu-button" aria-haspopup="dialog" aria-label="Menu" onClick={()=>setOpen(true)}><Menu aria-hidden="true"/></button>
  <Dialog open={open} onClose={()=>setOpen(false)} title="Menu" variant="drawer" className="studio-menu">
   <nav aria-label="Places" className="studio-menu-group">
    {STUDIO_PLACES.map(t=><Link key={t.key} className="studio-menu-row" href={t.href} aria-current={current===t.key?'page':undefined} onClick={()=>setOpen(false)}><span aria-hidden="true">{t.icon}</span>{t.label}</Link>)}
   </nav>
   <nav aria-label="Tools" className="studio-menu-group">
    <p className="ds-label-caps">Tools</p>
    {STUDIO_NAV.map(t=>!t.feature||hasFeature(account,t.feature)
     ?<Link key={t.key} className="studio-menu-row" href={t.href} aria-current={current===t.key?'page':undefined} onClick={()=>setOpen(false)}><span aria-hidden="true">{t.icon}</span>{t.label}</Link>
     :<span key={t.key} className="studio-menu-row studio-nav-off" aria-disabled="true"><Lock aria-hidden="true"/>{t.label}<span className="ds-badge">{offChip(account,t.feature)}</span></span>)}
   </nav>
   {!!actions?.length&&<div className="studio-menu-group">{actions.map(a=><button key={a.label} type="button" className="studio-menu-row" onClick={()=>{setOpen(false);a.onClick()}}><span aria-hidden="true">{a.icon}</span>{a.label}</button>)}</div>}
   <div className="studio-menu-group">
    <p className="ds-label-caps">{account.brand&&!account.switcher?'Brand':'Company'}</p>
    {many?<PlaceList account={account} busy={busy} onChoose={p=>{setOpen(false);onChoose(p)}}/>
     :<span className="studio-menu-row"><BrandMark brand={account.brand}/><span className="ds-truncate">{workName(account)}</span></span>}
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

export function StudioTopBar({current,actions,theme='dark',preview}:{current?:StudioPage;/** The page's own controls (a connection button); in the menu on phones. */actions?:BarAction[];/** 'system' on the rebuilt screens (light and dark); 'dark' on the tool screens until group 2. */theme?:'system'|'dark';preview?:ShellPreview}){
 const {account,credits,creditsAnswered}=useShellData(preview);
 const bar=useRef<HTMLElement>(null);useFit(bar);
 const {busy,problem,choose}=useSwitch();
 const settings=!!account&&(account.role==='owner'&&!account.internal||account.viewingAs);
 return <header ref={bar} className="ds-topbar studio-topbar" data-theme={theme==='dark'?'dark':undefined}>
  <Link className="ds-brand" href="/" aria-label="Nmesis Studio, Home">
   <span className="ds-brand-mark" aria-hidden="true"><Aperture/></span>
   <span aria-hidden="true">NMESIS <span className="ds-brand-sub">STUDIO</span></span>
  </Link>
  <nav className="ds-nav studio-nav" aria-label="Main">{STUDIO_PLACES.map(t=><NavLink key={t.key} tool={t} account={account} current={current}/>)}<ToolsMenu account={account} current={current}/></nav>
  <div className="ds-topbar-end studio-topbar-end">
   {!!actions?.length&&<div className="studio-topbar-actions">{actions.map(a=><button key={a.label} type="button" className="ds-btn sm" aria-label={a.label} title={a.label} onClick={a.onClick}><span aria-hidden="true">{a.icon}</span><span className="studio-action-word" aria-hidden="true">{a.label}</span></button>)}</div>}
   {account&&<>
    {problem&&<span className="studio-topbar-problem" role="alert">{problem}</span>}
    {account.workspace.open&&(creditsAnswered?<Meter credits={credits}/>:!account.internal&&<MeterSkeleton/>)}
    <span className="studio-wide"><Switcher account={account} busy={busy} onChoose={p=>void choose(account,p)}/></span>
    <span className="studio-wide studio-role">{account.viewingAs?'Staff':ROLE_LABEL[account.role]}</span>
    {settings&&<Link className="ds-btn icon studio-wide" href="/company" aria-label="Company settings" title="Company settings" aria-current={current==='company'?'page':undefined}><Settings aria-hidden="true"/></Link>}
    <span className="studio-wide"><SignOut account={account}/></span>
    <span className="studio-narrow"><PhoneMenu account={account} current={current} actions={actions} busy={busy} onChoose={p=>void choose(account,p)}/></span>
   </>}
  </div>
 </header>;
}
