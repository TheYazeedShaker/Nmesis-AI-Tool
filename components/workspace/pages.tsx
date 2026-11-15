'use client';
import * as React from 'react';
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
import {LibraryScreen,type Place} from './library';
import {FolderScreen,ProjectsScreen} from './projects';
import {useLibrary} from './data';

// The rebuilt screens wired to the Studio (Phase 3 group 1).

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

export function HomePage(){
 const account=useAccount(),{items,lib,problem,reload}=useLibrary();
 const presets=useConfiguratorPresets();
 const tools:HomeTool[]=TOOLS.map(t=>({...t,locked:hasFeature(account,t.feature)?undefined:planEnded(account)?PLAN_ENDED_CHIP:`On ${account?.upsell[t.feature]}`}));
 return <WorkspaceFrame current="home" notices={<AccountNotices variant="ds"/>}>
  {problem&&!lib?<Problem text={problem} onRetry={()=>void reload()}/>:null}
  <HomeScreen tools={tools}
   recent={lib?items.filter(i=>!i.deleted).slice(0,10).map(i=>({...i,href:i.kind==='image'?`/library?open=${encodeURIComponent(i.id)}`:i.href})):problem?[]:null}
   cars={presets.filter(c=>c.url.startsWith('https://')).map(c=>({name:c.name,href:`${KEY_VISUAL_HREF}?car=${encodeURIComponent(c.name)}`}))}
   onStart={brief=>location.assign(brief?`${KEY_VISUAL_HREF}?brief=${encodeURIComponent(brief)}`:KEY_VISUAL_HREF)}/>
 </WorkspaceFrame>;
}

export function LibraryPage(){
 const account=useAccount(),{items,folders,lib,problem,reload,actions,foldersReady}=useLibrary();
 const [place]=React.useState<Place>(()=>query('in')||'all'),[openId]=React.useState(()=>query('open'));
 return <WorkspaceFrame current="library" notices={<AccountNotices variant="ds"/>}>
  {!lib?(problem?<Problem text={problem} onRetry={()=>void reload()}/>:<Loading/>)
   :<LibraryScreen items={items} folders={folders} place={place} hrefFor={p=>p==='all'?'/library':`/library?in=${encodeURIComponent(p)}`} actions={actions}
     readOnly={!canChange(account)} openId={openId} foldersReady={foldersReady}/>}
 </WorkspaceFrame>;
}

export function ProjectsPage(){
 const account=useAccount(),{folders,lib,problem,reload,folderActions,foldersReady}=useLibrary();
 return <WorkspaceFrame current="projects" notices={<AccountNotices variant="ds"/>}>
  {!lib?(problem?<Problem text={problem} onRetry={()=>void reload()}/>:<Loading/>)
   :!foldersReady?<State kind="empty" title="Folders are on their way">Folders aren’t available yet. Your work is all in the library.</State>
   :<ProjectsScreen folders={folders} canEdit={canChange(account)} actions={folderActions}/>}
 </WorkspaceFrame>;
}

export function FolderPage({id}:{id:string}){
 const account=useAccount(),{items,folders,lib,problem,reload,actions,folderActions,foldersReady}=useLibrary();
 const folder=folders.find(f=>f.id===id);
 return <WorkspaceFrame current="projects" notices={<AccountNotices variant="ds"/>}>
  {!lib?(problem?<Problem text={problem} onRetry={()=>void reload()}/>:<Loading/>)
   :!folder?<State kind="empty" title="This folder isn’t here" actions={<a className="ds-btn" href="/projects">All folders</a>}>It may have been deleted, or belong to another company.</State>
   :<FolderScreen folder={folder} folders={folders} items={items} canEdit={canChange(account)} folderActions={folderActions} libraryActions={actions} foldersReady={foldersReady}/>}
 </WorkspaceFrame>;
}
