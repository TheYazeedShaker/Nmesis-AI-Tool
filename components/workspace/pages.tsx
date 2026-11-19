'use client';
import * as React from 'react';
import {workName} from '@/lib/accounts/names';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {Clapperboard,Film,ImageIcon,Layers,Replace} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {SkeletonTile,State} from '@/components/ds/feedback';
import {AccountNotices,hasFeature,planEnded,PLAN_ENDED_CHIP,useAccount} from '@/components/studio-account';
import {useCredits} from '@/components/credits';
import {COMING_SOON,toolOpen,type ToolId} from '@/lib/tools';
import {dayDate,ownKeysLine,OWN_KEYS_ALL} from '@/lib/ds/words';
import {isDemoConfigurator,useConfiguratorPresets} from '@/lib/configurator-presets';
import {FEATURE_TOOL,briefPlaceholder,toolSample} from '@/lib/tool-samples';
import {KEY_VISUAL_HREF} from '@/components/studio-topbar';
import {viewerHref} from '@/lib/work-ref';
import type {AccountSummary} from '@/lib/accounts/summary';
import type {FeatureKey} from '@/lib/accounts/plan';
import {WorkspaceFrame} from './frame';
import {HomeScreen,type HomeTool} from './home';
import {LibraryView,type CreateOptions,type Place} from './library';
import {FolderHeader,ProjectsHeader,ProjectsScreen,ProjectsUnavailable,folderHref} from './projects';
import {useLibraryPage} from './data';

// The rebuilt screens wired to the Studio (Phase 3): the library a page at a time.

const canChange=(a:AccountSummary|null)=>!!a&&a.workspace.open&&a.role!=='viewer'&&!a.viewingAs;
const TOOLS:(Omit<HomeTool,'locked'>&{feature:FeatureKey;tool:ToolId})[]=[
 {tool:'visuals',key:'kv',name:'Key visual',line:'One car, one scene, campaign-ready.',href:KEY_VISUAL_HREF,icon:<ImageIcon/>,feature:'studio.key_visuals'},
 {tool:'lineup',key:'lineup',name:'Car lineup',line:'Several cars together in one frame.',href:'/lineup',icon:<Layers/>,feature:'studio.lineups'},
 {tool:'storyboard',key:'story',name:'Story studio',line:'Plan a film shot by shot.',href:'/storyboard',icon:<Clapperboard/>,feature:'studio.storyboards'},
 {tool:'films',key:'film',name:'Film',line:'A short film from your key visual.',href:'/films',icon:<Film/>,feature:'studio.film'},
 {tool:'swap',key:'swap',name:'Replace car',line:'Put your car into an existing ad.',href:'/swap',icon:<Replace/>,feature:'studio.swap'},
];

// The library's Create menu: the five tools, in the editor's order and to the
// editor's pages (EDITOR_TOOLS), each with its plan chip when the plan lacks it.
const CREATE:{key:string;label:string;href:string;icon:React.ReactNode;feature:FeatureKey;tool:ToolId}[]=[
 {tool:'visuals',key:'kv',label:'New key visual',href:KEY_VISUAL_HREF,icon:<ImageIcon/>,feature:'studio.key_visuals'},
 {tool:'lineup',key:'lineup',label:'New line-up',href:'/lineup',icon:<Layers/>,feature:'studio.lineups'},
 {tool:'films',key:'film',label:'New film',href:'/films',icon:<Film/>,feature:'studio.film'},
 {tool:'swap',key:'swap',label:'New swap',href:'/swap',icon:<Replace/>,feature:'studio.swap'},
 {tool:'storyboard',key:'story',label:'New story',href:'/storyboard',icon:<Clapperboard/>,feature:'studio.storyboards'},
];
const planChip=(account:AccountSummary|null,feature:FeatureKey)=>hasFeature(account,feature)?undefined:planEnded(account)?PLAN_ENDED_CHIP:`On ${account?.upsell[feature]}`;
function createOptions(account:AccountSummary|null,onNewFolder:(name:string)=>void,folderIn?:string):CreateOptions{
 return {tools:CREATE.map(({feature,tool,...t})=>({...t,locked:toolOpen(tool)?planChip(account,feature):COMING_SOON})),onNewFolder,folderIn};
}

function Loading(){
 return <div className="ds-grid" aria-busy="true" aria-label="Loading the library">{Array.from({length:8},(_,i)=><SkeletonTile key={i}/>)}</div>;
}
function Problem({text,onRetry}:{text:string;onRetry:()=>void}){
 return <State kind="error" title="The library didn’t load" actions={<Button onClick={onRetry}>Try again</Button>}>{text}</State>;
}
const libraryHref=(p:Place)=>p==='all'?'/library':`/library?in=${encodeURIComponent(p)}`;

export function HomePage(){
 const account=useAccount(),credits=useCredits(),lib=useLibraryPage('all',{limit:10});
 const presets=useConfiguratorPresets(),cars=presets.filter(c=>!isDemoConfigurator(c));
 // Each tool's one fixed picture (lib/tool-samples.ts): never its latest work, which is in Recent work below.
 // Car lineup: two or three different cars of the company side by side (neutral cars while they load).
 const lineupCars=cars.length>=2?cars.slice(0,3).map(c=>c.picture):[undefined,undefined,undefined];
 const tools:HomeTool[]=TOOLS.map(({tool,feature,...t})=>!toolOpen(tool)?{...t,locked:COMING_SOON,soon:true}
  :{...t,sample:toolSample(FEATURE_TOOL[feature],cars).src,cars:tool==='lineup'?lineupCars:undefined,locked:hasFeature(account,feature)?undefined:planEnded(account)?PLAN_ENDED_CHIP:`On ${account?.upsell[feature]}`});
 const meter=credits&&!credits.unlimited?credits.meter:null,own=ownKeysLine(credits);
 const first=account?.user.name?.split(' ')[0];
 return <WorkspaceFrame current="home" notices={<AccountNotices variant="ds" credits={false}/>}>
  {lib.problem&&!lib.ready?<Problem text={lib.problem} onRetry={()=>void lib.reload()}/>:null}
  <HomeScreen tools={tools} greeting={account?(first?`Welcome back, ${first}`:`Welcome to ${workName(account)}`):undefined} placeholder={briefPlaceholder(cars,account?.brand?.id)}
   credits={own===OWN_KEYS_ALL?{left:null,own,href:credits?.usage?'/usage':undefined}:meter?{left:meter.left,resetsOn:meter.resetsOn?dayDate(meter.resetsOn)||meter.resetsOn:null,href:credits?.usage?'/usage':undefined,own}:null}
   recent={lib.ready?lib.items.map(i=>({...i,href:i.kind==='image'?viewerHref(i.ref):i.href})):lib.problem?[]:null}
   onStart={brief=>location.assign(brief?`${KEY_VISUAL_HREF}?brief=${encodeURIComponent(brief)}`:KEY_VISUAL_HREF)}/>
 </WorkspaceFrame>;
}

// The library follows its address: ?in= (the folder) and ?open= (the viewer) are read on every
// navigation (a click, Back, Forward, a shared link), not once. useSearchParams needs a Suspense boundary.
export function LibraryPage(){
 return <React.Suspense fallback={<WorkspaceFrame current="library" notices={<AccountNotices variant="ds"/>}><Loading/></WorkspaceFrame>}><LibraryAtAddress/></React.Suspense>;
}
function LibraryAtAddress(){
 const account=useAccount(),params=useSearchParams();
 const place:Place=params.get('in')||'all',openId=params.get('open');
 const lib=useLibraryPage(place);
 return <WorkspaceFrame current="library" notices={<AccountNotices variant="ds"/>}>
  {!lib.ready?(lib.problem?<Problem text={lib.problem} onRetry={()=>void lib.reload()}/>:<Loading/>)
   :<LibraryView {...lib} hrefFor={libraryHref} readOnly={!canChange(account)} openId={openId} create={createOptions(account,name=>lib.folderActions.onCreate(name,null))}/>}
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
 // Folders go one level deep: in a top folder New folder makes a sub-folder; in a sub-folder, one beside it.
 const home=folder&&(folder.parentId?lib.folders.find(f=>f.id===folder.parentId)||null:folder);
 return <WorkspaceFrame current="projects" notices={<AccountNotices variant="ds"/>}>
  {!lib.ready&&!lib.problem?<Loading/>
   :!folder?<State kind="empty" title="This folder isn’t here" actions={<Link className="ds-btn" href="/projects">All folders</Link>}>It may have been deleted, or belong to another company.</State>
   :<div className="workspace-folder-page"><LibraryView {...lib} hrefFor={folderHref} readOnly={!canEdit}
     create={createOptions(account,name=>lib.folderActions.onCreate(name,home?.id??null),home?.name)}
     above={<FolderHeader folder={folder} folders={lib.folders} canEdit={canEdit} folderActions={lib.folderActions}/>}/></div>}
 </WorkspaceFrame>;
}
