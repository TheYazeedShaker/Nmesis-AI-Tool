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
import {LibraryView,type CreateOptions,type Place} from './library';
import {FolderHeader,ProjectsScreen,folderHref} from './projects';
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

// The library's Create menu: the five tools, in the editor's order and to the
// editor's pages (EDITOR_TOOLS), each with its plan chip when the plan lacks it.
const CREATE:{key:string;label:string;href:string;icon:React.ReactNode;feature:FeatureKey}[]=[
 {key:'kv',label:'New key visual',href:KEY_VISUAL_HREF,icon:<ImageIcon/>,feature:'studio.key_visuals'},
 {key:'lineup',label:'New line-up',href:'/lineup',icon:<Layers/>,feature:'studio.lineups'},
 {key:'film',label:'New film',href:'/films',icon:<Film/>,feature:'studio.film'},
 {key:'swap',label:'New swap',href:'/swap',icon:<Replace/>,feature:'studio.swap'},
 {key:'story',label:'New story',href:'/storyboard',icon:<Clapperboard/>,feature:'studio.storyboards'},
];
const planChip=(account:AccountSummary|null,feature:FeatureKey)=>hasFeature(account,feature)?undefined:planEnded(account)?PLAN_ENDED_CHIP:`On ${account?.upsell[feature]}`;
function createOptions(account:AccountSummary|null,onNewFolder:(name:string)=>void,folderIn?:string):CreateOptions{
 return {tools:CREATE.map(({feature,...t})=>({...t,locked:planChip(account,feature)})),onNewFolder,folderIn};
}

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
   :<LibraryView {...lib} hrefFor={libraryHref} readOnly={!canChange(account)} openId={openId} create={createOptions(account,name=>lib.folderActions.onCreate(name,null))}/>}
 </WorkspaceFrame>;
}

export function ProjectsPage(){
 const account=useAccount(),lib=useLibraryPage('all',{limit:1});
 return <WorkspaceFrame current="projects" notices={<AccountNotices variant="ds"/>}>
  {!lib.ready?(lib.problem?<Problem text={lib.problem} onRetry={()=>void lib.reload()}/>:<Loading/>)
   :!lib.foldersReady?<State kind="empty" title="Folders are on their way">Folders aren’t available yet. Your work is all in the library.</State>
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
