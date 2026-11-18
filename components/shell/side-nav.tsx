'use client';
import * as React from 'react';
import Link from 'next/link';
import {Aperture,BarChart3,ChevronsUpDown,CircleHelp,CloudUpload,FolderOpen,Home,Images,LogOut,Menu as MenuIcon,Monitor,Moon,PanelLeftClose,PanelLeftOpen,Palette,Settings,Sun,UserRound} from 'lucide-react';
import {Dialog} from '@/components/ds/dialog';
import {useRememberedOpen} from '@/components/ds/layout';
import {useAccount} from '@/components/studio-account';
import {useCredits,useCreditsAnswered} from '@/components/credits';
import {BrandMark,Meter,MeterSkeleton,PlaceList,sectionsOf,brandsOnly,useSwitch,type StudioPage} from '@/components/studio-topbar';
import {workName} from '@/lib/accounts/names';
import type {AccountSummary} from '@/lib/accounts/summary';
import {THEME_CHOICES,setTheme,useTheme,type ThemeChoice} from '@/lib/theme';
import {HowItWorks} from './how-it-works';
import {togglePanel,useShell,type ShellPanel} from './shell-state';

// The left navigation (like Canva's): icon and label, collapsible (remembered),
// Home, Projects, References, Brand and Uploads, with the account at the
// bottom. References and Uploads open a panel beside it, so a photo can be
// added while working; the others are pages. Below 768px it lives in a drawer
// opened from a slim bar at the top.

type Place={key:string;label:string;icon:React.ReactNode}&({href:string;pages:StudioPage[]}|{panel:ShellPanel});
export const NAV:Place[]=[
 {key:'home',label:'Home',icon:<Home/>,href:'/',pages:['home']},
 {key:'projects',label:'Projects',icon:<FolderOpen/>,href:'/library',pages:['library','projects']},
 {key:'references',label:'References',icon:<Images/>,panel:'references'},
 {key:'brand',label:'Brand',icon:<Palette/>,href:'/brand',pages:['brand']},
 {key:'uploads',label:'Uploads',icon:<CloudUpload/>,panel:'uploads'},
];
const hide=(icon:React.ReactNode)=>React.isValidElement(icon)?React.cloneElement(icon as React.ReactElement<{'aria-hidden'?:boolean}>,{'aria-hidden':true}):icon;

function NavItems({current,onGo}:{current?:StudioPage;onGo?:()=>void}){
 const {panel}=useShell();
 return <ul className="studio-side-list">
  {NAV.map(p=><li key={p.key}>{'href' in p
   ?<Link className="studio-side-item" href={p.href} aria-current={current&&p.pages.includes(current)?'page':undefined} onClick={onGo}>{hide(p.icon)}<span className="studio-side-word">{p.label}</span></Link>
   :<button type="button" className="studio-side-item" aria-pressed={panel===p.panel} aria-controls="studio-panel" onClick={()=>{onGo?.();togglePanel(p.panel)}}>{hide(p.icon)}<span className="studio-side-word">{p.label}</span></button>}</li>)}
 </ul>;
}

const initialsOf=(a:AccountSummary)=>{const from=(a.user.name||a.user.email.split('@')[0]).replace(/[^\p{L}\p{N} ._-]/gu,' ').trim();const parts=from.split(/[\s._-]+/).filter(Boolean);return ((parts[0]?.[0]||'?')+(parts.length>1?parts[parts.length-1][0]:'')).toUpperCase()};
export function Avatar({account}:{account:AccountSummary}){return <span className="ds-avatar studio-avatar" aria-hidden="true">{initialsOf(account)}</span>}

/** How many people are in the company: read when the menu opens (every member may read the team). */
function useMemberCount(open:boolean,org:string|undefined){
 const [count,setCount]=React.useState<{org:string;n:number}|null>(null);
 React.useEffect(()=>{
  if(!open||!org||count?.org===org)return;let live=true;
  fetch('/api/company/team',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10_000)})
   .then(async r=>{if(!r.ok)throw new Error('team answered '+r.status);return await r.json() as {seats?:{taken?:number}}})
   .then(d=>{if(live&&typeof d.seats?.taken==='number')setCount({org,n:d.seats.taken})})
   // The count is a detail of the menu: without it, the company's name shows alone.
   .catch((e:unknown)=>console.warn('[account menu] member count unavailable',e instanceof Error?e.message:e));
  return()=>{live=false};
 },[open,org,count?.org]);
 return count&&count.org===org?count.n:null;
}

const THEME_ICON:Record<ThemeChoice,React.ReactNode>={light:<Sun/>,dark:<Moon/>,system:<Monitor/>};
function ThemeChoices(){
 const theme=useTheme();
 return <div className="ds-segmented studio-theme" role="group" aria-label="Theme">
  {THEME_CHOICES.map(t=><button key={t.id} type="button" aria-pressed={theme===t.id} onClick={()=>setTheme(t.id)}>{hide(THEME_ICON[t.id])}{t.label}</button>)}
 </div>;
}

/** The account menu: who is signed in, the company (and a switch), then the
 *  account's pages, the theme, help, plans and credits, and Log out. */
function AccountMenuBody({account,onClose,onHelp}:{account:AccountSummary;onClose:()=>void;onHelp:()=>void}){
 const credits=useCredits(),members=useMemberCount(true,account.org.id),{busy,problem,choose}=useSwitch();
 const [switching,setSwitching]=React.useState(false);
 const many=sectionsOf(account).reduce((n,s)=>n+s.places.length,0)>1,noun=brandsOnly(account)?'brand':'company';
 const meter=credits&&!credits.unlimited?credits.meter:null;
 return <div className="studio-account-body">
  <div className="studio-account-who"><Avatar account={account}/><span className="studio-account-names">{account.user.name&&<b className="ds-truncate" title={account.user.name}>{account.user.name}</b>}<span className="ds-truncate ds-muted" title={account.user.email}>{account.user.email}</span></span></div>
  <div className="studio-account-company">
   <BrandMark brand={account.brand} blank/>
   <span className="studio-account-names"><b className="ds-truncate" title={workName(account)}>{workName(account)}</b><span className="ds-muted">{members===null?' ':members===1?'1 member':`${members} members`}</span></span>
   {many&&<button type="button" className="ds-btn sm" disabled={busy} onClick={()=>setSwitching(true)}><ChevronsUpDown aria-hidden="true"/>Switch</button>}
  </div>
  {problem&&<p className="ds-error" role="alert">{problem}</p>}
  <nav aria-label="Account" className="studio-account-links">
   <Link className="studio-account-row" href="/account" onClick={onClose}><UserRound aria-hidden="true"/>Your account</Link>
   <Link className="studio-account-row" href="/company" onClick={onClose}><Settings aria-hidden="true"/>Settings</Link>
   <div className="studio-account-row studio-account-theme"><span className="ds-label">Theme</span><ThemeChoices/></div>
   <button type="button" className="studio-account-row" onClick={()=>{onClose();onHelp()}}><CircleHelp aria-hidden="true"/>Help</button>
   {credits?.usage
    ?<Link className="studio-account-row" href="/usage" onClick={onClose}><BarChart3 aria-hidden="true"/><span className="studio-account-grow">Plans and credits</span>{meter&&<span className="ds-muted">{meter.left.toLocaleString('en-US')} left</span>}</Link>
    :<span className="studio-account-row"><BarChart3 aria-hidden="true"/><span className="studio-account-grow">{account.plan.name?`${account.plan.name} plan`:'Plans and credits'}</span>{meter&&<span className="ds-muted">{meter.left.toLocaleString('en-US')} credits left</span>}</span>}
   <form method="post" action="/auth/signout"><button type="submit" className="studio-account-row"><LogOut aria-hidden="true"/>Log out</button></form>
  </nav>
  <Dialog open={switching} onClose={()=>setSwitching(false)} title={'Switch '+noun} className="studio-menu"><PlaceList account={account} busy={busy} onChoose={p=>{setSwitching(false);void choose(account,p)}}/></Dialog>
 </div>;
}

function AccountButton({account,compact,onHelp}:{account:AccountSummary;compact:boolean;onHelp:()=>void}){
 const [open,setOpen]=React.useState(false);
 const root=React.useRef<HTMLDivElement>(null),button=React.useRef<HTMLButtonElement>(null);
 const id=React.useId().replace(/[^a-zA-Z0-9]/g,'');
 const close=React.useCallback((refocus=true)=>{setOpen(false);if(refocus)button.current?.focus()},[]);
 React.useEffect(()=>{if(!open)return;const away=(e:PointerEvent)=>{if(root.current&&!root.current.contains(e.target as Node))close(false)};document.addEventListener('pointerdown',away);return()=>document.removeEventListener('pointerdown',away)},[open,close]);
 return <div ref={root} className="studio-account" onKeyDown={e=>{if(e.key==='Escape'&&open){e.stopPropagation();close()}}}>
  {open&&<div id={`${id}-account`} role="dialog" aria-label="Account" className="studio-account-pop"><AccountMenuBody account={account} onClose={()=>close(false)} onHelp={onHelp}/></div>}
  <button ref={button} type="button" className="studio-side-item studio-account-button" aria-expanded={open} aria-controls={open?`${id}-account`:undefined} aria-label={`Account: ${account.user.name||account.user.email}`} onClick={()=>setOpen(o=>!o)}>
   <Avatar account={account}/>{!compact&&<span className="studio-side-word studio-account-label"><b className="ds-truncate">{account.user.name||account.user.email}</b><span className="ds-truncate ds-muted">{workName(account)}</span></span>}
  </button>
 </div>;
}

export function HelpDialog({open,onClose}:{open:boolean;onClose:()=>void}){
 return <Dialog open={open} onClose={onClose} title="Help">
  <div className="ds-stack">
   <HowItWorks/>
   <p className="ds-help">Nothing is charged until you press Generate; the cost shows on the button first. Questions about your plan, credits or cars: ask your Nmesis contact, or use Ask Nmesis in Settings.</p>
  </div>
 </Dialog>;
}

function Credits(){
 const credits=useCredits(),answered=useCreditsAnswered(),account=useAccount();
 if(!account?.workspace.open)return null;
 return <div className="studio-side-credits">{answered?<Meter credits={credits}/>:!account.internal&&<MeterSkeleton/>}</div>;
}

/** The navigation column (wide screens) and its drawer (phones). */
export function SideNav({current}:{current?:StudioPage}){
 const account=useAccount();
 const [expanded,setExpanded]=useRememberedOpen('studio-nav',true);
 const [drawer,setDrawer]=React.useState(false),[help,setHelp]=React.useState(false);
 return <>
  <nav className="studio-side" aria-label="Main" data-expanded={expanded||undefined}>
   <div className="studio-side-head">
    <Link className="studio-side-brand" href="/" aria-label="Nmesis Studio, Home"><span className="ds-brand-mark" aria-hidden="true"><Aperture/></span>{expanded&&<span className="studio-side-word" aria-hidden="true">NMESIS <span className="ds-brand-sub">STUDIO</span></span>}</Link>
    <button type="button" className="ds-btn icon sm studio-side-toggle" aria-label={expanded?'Collapse navigation':'Expand navigation'} aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?<PanelLeftClose aria-hidden="true"/>:<PanelLeftOpen aria-hidden="true"/>}</button>
   </div>
   <NavItems current={current}/>
   <span className="ds-spacer"/>
   {expanded&&<Credits/>}
   {account&&<AccountButton account={account} compact={!expanded} onHelp={()=>setHelp(true)}/>}
  </nav>
  <header className="studio-phonebar">
   <Link className="studio-side-brand" href="/" aria-label="Nmesis Studio, Home"><span className="ds-brand-mark" aria-hidden="true"><Aperture/></span><span aria-hidden="true">NMESIS</span></Link>
   <span className="ds-spacer"/>
   <Credits/>
   <button type="button" className="ds-btn icon" aria-haspopup="dialog" aria-label="Menu" onClick={()=>setDrawer(true)}><MenuIcon aria-hidden="true"/></button>
  </header>
  <Dialog open={drawer} onClose={()=>setDrawer(false)} title="Menu" variant="drawer" className="studio-menu studio-side-drawer">
   <nav aria-label="Main (menu)"><NavItems current={current} onGo={()=>setDrawer(false)}/></nav>
   {account&&<AccountMenuBody account={account} onClose={()=>setDrawer(false)} onHelp={()=>setHelp(true)}/>}
  </Dialog>
  <HelpDialog open={help} onClose={()=>setHelp(false)}/>
 </>;
}
