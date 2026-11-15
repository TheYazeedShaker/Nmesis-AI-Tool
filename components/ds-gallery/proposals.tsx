'use client';
import * as React from 'react';
import {Clapperboard,Film,ImageIcon,Layers,Replace,Sparkles} from 'lucide-react';
import {Banner} from '@/components/ds/shell';
import {useToast} from '@/components/ds/toast';
import {WorkspaceFrame} from '@/components/workspace/frame';
import {HomeScreen,type HomeTool} from '@/components/workspace/home';
import {LibraryScreen,type Place} from '@/components/workspace/library';
import {FolderScreen,ProjectsScreen} from '@/components/workspace/projects';
import type {Folder,WorkItem,WorkTool} from '@/components/workspace/items';
import type {ShellPreview,StudioPage} from '@/components/studio-topbar';
import type {AccountSummary} from '@/lib/accounts/summary';
import type {CreditOverview} from '@/lib/credits/usage';
import {CARS,LONG_NAME,PEOPLE} from './sample';
import {thumb} from './thumbs';
import type {Proposal} from './screens';

// The Phase 3 group 1 screens with synthetic data, for the owner's yes before
// they are built into the Studio: the real components and the real top bar,
// in light and dark. /design-system/proposals/<home|library|projects|folder>.


const ACCOUNT={
 user:{email:'alex@example.test'},org:{id:'c1',name:'Demo Company'},role:'owner',
 orgs:[{id:'c1',name:'Demo Company'},{id:'c4',name:'Test Dealers'}],switcher:null,staff:false,viewingAs:false,supportUntil:null,internal:false,
 plan:{name:'Growth',legacy:false,none:false},
 features:{'studio.key_visuals':true,'studio.lineups':true,'studio.area_edit':true,'studio.object_select':true,'studio.pinterest':true,'studio.smart_reference':true,'studio.upscale':true,'studio.film':false,'studio.swap':false,'studio.storyboards':false,'studio.own_keys':false},
 upsell:{'studio.film':'Enterprise','studio.swap':'Enterprise','studio.storyboards':'Enterprise','studio.own_keys':'Enterprise'},
 maxEdge:3840,workspace:{open:true,libraryOpen:true,libraryUntil:null},
} as unknown as AccountSummary;
const CREDITS={unlimited:false,meter:{used:1700,left:300,held:0,percent:85,level:80,periodFrom:null,periodTo:null,resetsOn:'5 Dec'},prices:{},billing:{},ignoredKeys:null,usage:true} as unknown as CreditOverview;
const PREVIEW:ShellPreview={account:ACCOUNT,credits:CREDITS};

const TOOLS:WorkTool[]=['Key visual','Key visual','Line-up','Key visual','Film','Car swap','Key visual','Story'];
const SCENES=['Desert dusk','City night','Studio white','Coast road','Mountain pass'];
const DAYS=['2026-11-15','2026-11-14','2026-11-12','2026-11-03'];
const WHEN=['Today','Yesterday','12 Nov','3 Nov'];
const FOLDERS:Folder[]=[
 {id:'f1',name:'Launch campaign',parentId:null,count:14,covers:[thumb(0),thumb(3),thumb(5)]},
 {id:'f1a',name:'Social cut-downs',parentId:'f1',count:4,covers:[thumb(8)]},
 {id:'f2',name:'Showroom screens',parentId:null,count:9,covers:[thumb(2),thumb(7)]},
 {id:'f3',name:LONG_NAME,parentId:null,count:6,covers:[thumb(11)]},
 {id:'f4',name:'Winter offers',parentId:null,count:0,covers:[]},
];
function items(n:number):WorkItem[]{
 return Array.from({length:n},(_,i)=>{
  const tool=TOOLS[i%TOOLS.length],car=CARS[i%CARS.length];
  const status=i===3?{kind:'info' as const,label:'In progress'}:i===9?{kind:'bad' as const,label:'Didn’t finish'}:undefined;
  return {id:`w${i+1}`,name:i===2?`${LONG_NAME} launch visual`:`${car} · ${SCENES[i%SCENES.length]}`,sub:WHEN[i%4],at:DAYS[i%4]+'T1'+(i%10)+':00:00Z',
   tool,car,person:PEOPLE[i%PEOPLE.length],src:status?.kind==='info'?undefined:thumb(i),kind:tool==='Film'?'film':tool==='Car swap'?'swap':tool==='Story'?'storyboard':'image',
   status:status||(tool==='Film'?{kind:'quiet' as const,label:'Film'}:tool==='Car swap'?{kind:'quiet' as const,label:'Car swap'}:tool==='Story'?{kind:'quiet' as const,label:'Story'}:undefined),
   folderId:i<14?'f1':i<18?'f1a':i<27?'f2':i<33?'f3':null,deleted:i>=44,width:640,height:400};
 });
}
const HOME_TOOLS:HomeTool[]=[
 {key:'kv',name:'Key visual',line:'One car, one scene, campaign-ready.',href:'#key-visual',icon:<ImageIcon/>,cost:'4 credits'},
 {key:'lineup',name:'Car lineup',line:'Several cars together in one frame.',href:'#lineup',icon:<Layers/>,cost:'6 credits'},
 {key:'story',name:'Story studio',line:'Plan a film shot by shot.',href:'#storyboard',icon:<Clapperboard/>,locked:'On Enterprise'},
 {key:'film',name:'Film',line:'A short film from your key visual.',href:'#films',icon:<Film/>,locked:'On Enterprise'},
 {key:'swap',name:'Replace car',line:'Put your car into an existing ad.',href:'#swap',icon:<Replace/>,locked:'On Enterprise'},
];

function Notices(){
 return <Banner kind="warn" icon={<Sparkles/>}>Your company has used 85% of this month’s credits: 300 left. They reset on 5 Dec. <a className="ds-link" href="#usage">Usage</a></Banner>;
}

export function ProposalScreen({screen}:{screen:Proposal}){
 const toast=useToast();
 const [all,setAll]=React.useState(()=>items(48));
 const [base,setFolders]=React.useState(FOLDERS);
 // Counts and covers from the items, as the server will give them.
 const folders=base.map(f=>{const mine=all.filter(i=>!i.deleted&&(i.folderId===f.id||base.find(s=>s.id===i.folderId)?.parentId===f.id));return {...f,count:mine.length,covers:mine.filter(i=>i.src).slice(0,3).map(i=>i.src!)}});
 const place:Place='all';
 const actions={
  onMove:(ids:string[],folderId:string|null)=>{setAll(v=>v.map(i=>ids.includes(i.id)?{...i,folderId}:i));toast.toast({message:`Moved ${ids.length===1?'1 item':ids.length+' items'} to ${folders.find(f=>f.id===folderId)?.name||'Not in a folder'}.`,kind:'ok'})},
  onDelete:(ids:string[])=>{setAll(v=>v.map(i=>ids.includes(i.id)?{...i,deleted:true}:i));toast.undo(`${ids.length===1?'1 item':ids.length+' items'} moved to Deleted.`,()=>setAll(v=>v.map(i=>ids.includes(i.id)?{...i,deleted:false}:i)))},
  onRestore:(ids:string[])=>{setAll(v=>v.map(i=>ids.includes(i.id)?{...i,deleted:false}:i));toast.toast({message:'Restored.',kind:'ok'})},
  onDownload:()=>toast.toast({message:'Downloading.'}),
 };
 const folderActions={
  onCreate:(name:string,parentId:string|null)=>setFolders(v=>[...v,{id:'n'+v.length,name,parentId,count:0,covers:[]}]),
  onRename:(id:string,name:string)=>setFolders(v=>v.map(f=>f.id===id?{...f,name}:f)),
  onDelete:(id:string)=>{const was=folders;setFolders(v=>v.filter(f=>f.id!==id&&f.parentId!==id));toast.undo('Folder deleted. Its work is now Not in a folder.',()=>setFolders(was))},
 };
 const current:StudioPage=screen==='home'?'home':screen==='library'?'library':'projects';
 return <WorkspaceFrame current={current} preview={PREVIEW} notices={<Notices/>}>
  {screen==="home"&&<HomeScreen tools={HOME_TOOLS} recent={all.filter(i=>!i.deleted).slice(0,10)} cars={CARS.map(c=>({name:c,href:'#key-visual?car='+encodeURIComponent(c)}))} onStart={()=>toast.toast({message:'Opens a key visual with your words.'})} libraryHref="/design-system/proposals/library"/>}
  {screen==='library'&&<LibraryScreen items={all} folders={folders} place={place} hrefFor={p=>`#${p}`} actions={actions} createHref="/design-system/proposals/home"/>}
  {screen==='projects'&&<ProjectsScreen folders={folders} canEdit actions={folderActions}/>}
  {screen==='folder'&&<FolderScreen folder={folders[0]} folders={folders} items={all} canEdit folderActions={folderActions} libraryActions={actions}/>}
 </WorkspaceFrame>;
}
