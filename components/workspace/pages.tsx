'use client';
import * as React from 'react';
import {workName} from '@/lib/accounts/names';
import Link from 'next/link';
import {Clapperboard,Film,ImageIcon,Layers,Replace} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {SkeletonTile,State} from '@/components/ds/feedback';
import {AccountNotices,hasFeature,planEnded,PLAN_ENDED_CHIP,useAccount} from '@/components/studio-account';
import {useConfiguratorPresets} from '@/lib/configurator-presets';
import {KEY_VISUAL_HREF} from '@/components/studio-topbar';
import type {AccountSummary} from '@/lib/accounts/summary';
import type {FeatureKey} from '@/lib/accounts/plan';
import {WorkspaceFrame} from './frame';
import {HomeScreen,type HomeTool} from './home';
import {LibraryView,type Place} from './library';
import {FolderHeader,ProjectsHeader,ProjectsScreen,ProjectsUnavailable,folderHref} from './projects';
import {useLibraryPage} from './data';

// The rebuilt screens wired to the Studio (Phase 3): the library a page at a time.

const canChange=(a:AccountSummary|null)=>!!a&&a.workspace.open&&a.role!=='viewer'&&!a.viewingAs;
const TOOLS:(Omit<HomeTool,'locked'>&{feature:FeatureKey})[]=[
 {key:'kv',name:'Key visual',line:'One car, one scene, campaign-ready.',href:KEY_VISUAL_HREF,icon:<ImageIcon/>,feature:'studio.key_visuals'},
 {key:'lineup',name:'Car lineup',line:'Several cars together in one frame.',href:'/lineup',icon:<Layers/>,feature:'studio.lineups'},
 {key:'story',name:'Story studio',line:'Plan a film shot by shot.',href:'/storyboard',icon:<Clapperboard/>,feature:'studio.storyboards'},
 {key:'film',name:'Film',line:'A short film from your key visual.',href:'/films',icon:<Film/>,feature:'studio.film'},
 {key:'swap',name:'Replace car',line:'Put your car into an existing ad.',href:'/swap',icon:<Replace/>,feature:'studio.swap'},
];

function Loading(){
 return <div className="ds-grid" aria-busy="true" aria-label="Loading the library">{Array.from({length:8},(_,i)=><SkeletonTile key={i}/>)}</div>;
}
function Problem({text,onRetry}:{text:string;onRetry:()=>void}){
 return <State kind="error" title="The library didn’t load" actions={<Button onClick={onRetry}>Try again</Button>}>{text}</State>;
}
const query=(name:string)=>typeof window==='undefined'?null:new URLSearchParams(window.location.search).get(name);
const libraryHref=(p:Place)=>p==='all'?'/library':`/library?in=${encodeURIComponent(p)}`;

export function HomePage(){
 const account=useAccount(),lib=useLibraryPage('all',{limit:10});
 const presets=useConfiguratorPresets();
 const tools:HomeTool[]=TOOLS.map(t=>({...t,locked:hasFeature(account,t.feature)?undefined:planEnded(account)?PLAN_ENDED_CHIP:`On ${account?.upsell[t.feature]}`}));
 return <WorkspaceFrame current="home" notices={<AccountNotices variant="ds"/>}>
  {lib.problem&&!lib.ready?<Problem text={lib.problem} onRetry={()=>void lib.reload()}/>:null}
  <HomeScreen tools={tools} greeting={account?workName(account):undefined}
   recent={lib.ready?lib.items.map(i=>({...i,href:i.kind==='image'?`/library?open=${encodeURIComponent(i.id)}`:i.href})):lib.problem?[]:null}
   cars={presets.filter(c=>c.url.startsWith('https://')).map(c=>({name:c.name,href:`${KEY_VISUAL_HREF}?car=${encodeURIComponent(c.name)}`,picture:c.picture}))}
   onStart={brief=>location.assign(brief?`${KEY_VISUAL_HREF}?brief=${encodeURIComponent(brief)}`:KEY_VISUAL_HREF)}/>
 </WorkspaceFrame>;
}

export function LibraryPage(){
 const account=useAccount();
 const [place]=React.useState<Place>(()=>query('in')||'all'),[openId]=React.useState(()=>query('open'));
 const lib=useLibraryPage(place);
 return <WorkspaceFrame current="library" notices={<AccountNotices variant="ds"/>}>
  {!lib.ready?(lib.problem?<Problem text={lib.problem} onRetry={()=>void lib.reload()}/>:<Loading/>)
   :<LibraryView {...lib} hrefFor={libraryHref} readOnly={!canChange(account)} openId={openId}/>}
 </WorkspaceFrame>;
}

// Projects keeps its header in every state: loading, a failed load, folders not
// switched on yet, and the folders themselves.
export function ProjectsPage(){
 const account=useAccount(),lib=useLibraryPage('all',{limit:1});
 return <WorkspaceFrame current="projects" notices={<AccountNotices variant="ds"/>}>
  {!lib.ready?<><ProjectsHeader/>{lib.problem?<State kind="error" title="Your folders didn’t load" actions={<Button onClick={()=>void lib.reload()}>Try again</Button>}>{lib.problem}</State>
    :<div className="workspace-folders" role="status" aria-busy="true" aria-label="Loading your folders">{Array.from({length:6},(_,i)=><SkeletonTile key={i}/>)}</div>}</>
   :!lib.foldersReady?<ProjectsUnavailable/>
   :<ProjectsScreen folders={lib.folders} canEdit={canChange(account)} actions={lib.folderActions}/>}
 </WorkspaceFrame>;
}

export function FolderPage({id}:{id:string}){
 const account=useAccount(),lib=useLibraryPage(id);
 const folder=lib.folders.find(f=>f.id===id),canEdit=canChange(account);
 return <WorkspaceFrame current="projects" notices={<AccountNotices variant="ds"/>}>
  {!lib.ready&&!lib.problem?<Loading/>
   :!folder?<State kind="empty" title="This folder isn’t here" actions={<Link className="ds-btn" href="/projects">All folders</Link>}>It may have been deleted, or belong to another company.</State>
   :<div className="workspace-folder-page"><LibraryView {...lib} hrefFor={folderHref} readOnly={!canEdit}
     above={<FolderHeader folder={folder} folders={lib.folders} canEdit={canEdit} folderActions={lib.folderActions}/>}/></div>}
 </WorkspaceFrame>;
}
