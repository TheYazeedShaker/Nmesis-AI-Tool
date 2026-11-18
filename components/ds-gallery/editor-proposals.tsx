'use client';
import * as React from 'react';
import {Download,Scissors,Sparkles,Upload,ZoomIn} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {Banner} from '@/components/ds/shell';
import {Field,Select,Switch} from '@/components/ds/field';
import {useToast} from '@/components/ds/toast';
import {WorkspaceFrame} from '@/components/workspace/frame';
import {EditorScreen,type EditorTool} from '@/components/editor/editor-screen';
import {CarSettings,ChoiceChips,ConfiguratorStage,CostBadge,LengthSettings,NameField,PromptSettings,QualitySettings,SaveToProject,SettingsSection,VersionHistory,type Quality,type Version} from '@/components/editor/parts';
import type {ConfiguratorOptions} from '@/components/editor/configurator';
import type {AccountSummary} from '@/lib/accounts/summary';
import type {CreditOverview} from '@/lib/credits/usage';
import {CARS} from './sample';
import {thumb} from './thumbs';

// Phase 3 group 2 before it is built: the one editor for the five tools with
// synthetic data, for the owner's yes. /design-system/proposals/editor-<tool>.

const ACCOUNT={user:{email:'alex@example.test'},org:{id:'c1',name:'Demo Company'},role:'owner',orgs:[{id:'c1',name:'Demo Company'},{id:'c4',name:'Test Dealers'}],switcher:null,staff:false,viewingAs:false,supportUntil:null,internal:false,
 plan:{name:'Enterprise',legacy:false,none:false},features:Object.fromEntries(['studio.key_visuals','studio.lineups','studio.area_edit','studio.upscale','studio.film','studio.swap','studio.storyboards','studio.smart_reference'].map(k=>[k,true])),
 upsell:{},maxEdge:3840,workspace:{open:true,libraryOpen:true,libraryUntil:null}} as unknown as AccountSummary;
const CREDITS={unlimited:false,meter:{used:1700,left:300,held:0,percent:85,level:80,periodFrom:null,periodTo:null,resetsOn:'5 Dec'},prices:{},billing:{},ignoredKeys:null,usage:true} as unknown as CreditOverview;
const OPTIONS:ConfiguratorOptions={
 colours:[{id:'c1',name:'Lime metallic',swatch:'var(--nm-lime)'},{id:'c2',name:'Glacier white',swatch:'var(--ds-panel)'},{id:'c3',name:'Graphite',swatch:'var(--ds-neutral-muted)'},{id:'c4',name:'Night black',swatch:'var(--ds-text-strong)'},{id:'c5',name:'Signal blue',swatch:'var(--ds-info)'},{id:'c6',name:'Rosso',swatch:'var(--ds-danger)'}],
 trims:[{id:'t1',name:'Sport'},{id:'t2',name:'Premium'},{id:'t3',name:'Base'}],
 views:[{id:'front34',name:'Front ¾'},{id:'side',name:'Side'},{id:'rear34',name:'Rear ¾'},{id:'front',name:'Front'},{id:'interior',name:'Interior'}],
 frames:36,
};
const COST:Record<EditorTool,Record<Quality,number>>={visuals:{standard:4,high:8},lineup:{standard:6,high:12},films:{standard:60,high:120},swap:{standard:40,high:80},storyboard:{standard:12,high:24}};
const FOLDERS=[{id:'f1',name:'Launch campaign',parentId:null},{id:'f1a',name:'Social cut-downs',parentId:'f1'},{id:'f2',name:'Showroom screens',parentId:null}];
const versions=(seed:number,n:number,label?:string):Version[]=>[
 {id:'v-run',n:n+1,quality:'high',used:null,at:'now',status:'working',stage:'Rendering',progress:0.4,held:8,label:label?`${label} ${n+1}`:undefined},
 ...Array.from({length:n},(_,i)=>({id:`v${n-i}`,n:n-i,src:thumb(seed+i),quality:(i%2?'standard':'high') as Quality,used:i%2?COST.visuals.standard:COST.visuals.high,at:['14:02','13:48','Yesterday','12 Nov'][i%4],status:(i===3?'failed':'ready') as Version['status'],label:label?`${label} ${n-i}`:undefined})),
];

export function EditorProposal({tool:initial}:{tool:EditorTool}){
 const toast=useToast();
 const [tool,setTool]=React.useState<EditorTool>(initial);
 const [car,setCar]=React.useState(CARS[0]),[state,setState]=React.useState({colour:'c1',trim:'t1',view:'front34'}),[frame,setFrame]=React.useState(4);
 const [quality,setQuality]=React.useState<Quality>('high'),[prompt,setPrompt]=React.useState('Coast road at dusk, low sun, wet tarmac, the car in motion.');
 const [stage,setStage]=React.useState<'car'|'result'>(initial==='visuals'?'car':'result'),[current,setCurrent]=React.useState<string|null>('v4');
 const [folder,setFolder]=React.useState<string|null>(initial==='films'?'f1':null),[name,setName]=React.useState('Demo SUV · Coast road');
 const [length,setLength]=React.useState(10),[sound,setSound]=React.useState(true),[shots,setShots]=React.useState(6);
 const cost=COST[tool][quality];
 const history=versions(tool==='visuals'?0:tool==='lineup'?7:tool==='films'?3:tool==='swap'?9:5,4,tool==='storyboard'?'Draft':tool==='films'?'Cut':undefined);
 const shown=history.find(v=>v.id===current)||history[1];
 const resultActions=tool==='visuals'||tool==='lineup'
  ?<><Button size="sm" kind="quiet" icon={<Scissors aria-hidden="true"/>}>Area edit <span className="ds-btn-meta">· 3 credits</span></Button><Button size="sm" kind="quiet" icon={<ZoomIn aria-hidden="true"/>}>Upscale <span className="ds-btn-meta">· 8 credits</span></Button><Button size="sm" kind="quiet" icon={<Download aria-hidden="true"/>} aria-label="Download"/></>
  :<Button size="sm" kind="quiet" icon={<Download aria-hidden="true"/>} aria-label="Download"/>;
 const bar=<>
  <NameField value={name} onChange={setName}/>
  {tool==='visuals'&&<div className="ds-segmented editor-stage-switch" role="group" aria-label="Show"><button type="button" aria-pressed={stage==='car'} onClick={()=>setStage('car')}>Your car</button><button type="button" aria-pressed={stage==='result'} onClick={()=>setStage('result')}>Result</button></div>}
  <SaveToProject folders={FOLDERS} folderId={folder} onSave={f=>{setFolder(f);toast.toast({message:f?`Saved to ${FOLDERS.find(x=>x.id===f)?.name}.`:'Not in a folder.',kind:'ok'})}}/>
  <span className="editor-bar-actions">{(stage==='result'||tool!=='visuals')&&resultActions}</span>
 </>;
 const carSettings=<CarSettings cars={CARS} car={car} onCar={setCar} options={OPTIONS} state={state} onColour={c=>setState(s=>({...s,colour:c}))} onTrim={t=>setState(s=>({...s,trim:t}))} onView={v=>setState(s=>({...s,view:v}))} controlsInEditor/>;
 const settings=<>
  {tool==='lineup'
   ?<SettingsSection title="Cars" id="cars-title"><ol className="editor-lineup">{CARS.slice(0,3).map((c,i)=><li key={c} className="editor-lineup-car"><span className="editor-lineup-thumb" aria-hidden="true">{/* eslint-disable-next-line @next/next/no-img-element -- synthetic */}
<img src={thumb(i+2)} alt=""/></span><span><b>{c}</b><span className="ds-muted">{OPTIONS.colours[i].name} · {OPTIONS.views[i].name}</span></span>{i===0&&<span className="ds-badge">Hero</span>}</li>)}</ol><Button size="sm">Add a car</Button></SettingsSection>
   :tool==='swap'
   ?<><SettingsSection title="Reference ad" id="ad-title"><div className="editor-upload"><Upload aria-hidden="true"/><span><b>Showroom loop.mp4</b><span className="ds-muted">8 seconds · 1920 × 1080</span></span><Button size="sm" kind="quiet">Replace</Button></div></SettingsSection>{carSettings}</>
   :tool==='films'
   ?<SettingsSection title="Starting frame" id="frame-title"><div className="editor-upload"><span className="editor-lineup-thumb" aria-hidden="true">{/* eslint-disable-next-line @next/next/no-img-element -- synthetic */}
<img src={thumb(3)} alt=""/></span><span><b>Demo SUV · Coast road</b><span className="ds-muted">Key visual · version 4</span></span><Button size="sm" kind="quiet">Change</Button></div></SettingsSection>
   :carSettings}
  <PromptSettings label={tool==='films'?'Motion':tool==='storyboard'?'Your idea':tool==='swap'?'Anything to keep?':'Scene'} value={prompt} onChange={setPrompt} inspiration={tool==='visuals'||tool==='lineup'||tool==='storyboard'}/>
  {tool==='films'&&<SettingsSection title="Film" id="film-title"><LengthSettings value={length} onChange={setLength} choices={[5,10,15]}/><Switch label="Sound" checked={sound} onChange={e=>setSound(e.target.checked)}/></SettingsSection>}
  {tool==='storyboard'&&<SettingsSection title="Story" id="story-title"><Field label="Shots"><Select value={String(shots)} onChange={e=>setShots(Number(e.target.value))}>{[4,6,8].map(n=><option key={n} value={n}>{n} shots</option>)}</Select></Field></SettingsSection>}
  {tool==='lineup'&&<SettingsSection title="Layout" id="layout-title"><ChoiceChips legend="Layout" name="layout" choices={[{id:'row',name:'In a row'},{id:'v',name:'V-shape'},{id:'hero',name:'Hero in front'}]} value="hero" onChange={()=>{}}/></SettingsSection>}
  <QualitySettings value={quality} onChange={setQuality} costs={COST[tool]}/>
 </>;
 const stageNode=tool==='visuals'&&stage==='car'
  ?<ConfiguratorStage frame={frame} frames={OPTIONS.frames} onFrame={setFrame} onCapture={()=>{setStage('result');toast.toast({message:'View captured. It is the car for your next version.',kind:'ok'})}}>
    {/* eslint-disable-next-line @next/next/no-img-element -- synthetic */}
    <img src={thumb(frame)} alt={`${car}, ${OPTIONS.colours.find(c=>c.id===state.colour)?.name}, ${OPTIONS.views.find(v=>v.id===state.view)?.name}`}/>
    <span className="editor-live"><span aria-hidden="true"/>Live configurator</span>
   </ConfiguratorStage>
  :tool==='storyboard'
  ?<ol className="editor-story" aria-label="Shots">{Array.from({length:shots},(_,i)=><li key={i} className="editor-shot">{/* eslint-disable-next-line @next/next/no-img-element -- synthetic */}
<img src={thumb(i+5)} alt=""/><span><b>Shot {i+1}</b><span className="ds-muted">{['Wide establishing','Front ¾ approach','Wheel detail','Interior','Rear ¾ exit','Logo close-up','Coast road pass','Sunset hold'][i]}</span></span></li>)}</ol>
  :<figure className="editor-result">{/* eslint-disable-next-line @next/next/no-img-element -- synthetic */}
<img src={shown?.src||thumb(1)} alt={name}/>
    <figcaption><span>{shown?.label||`Version ${shown?.n}`} · {shown?shown.quality==='high'?'High detail':'Standard':''}</span>{shown&&<CostBadge credits={shown.used} used/>}</figcaption></figure>;
 return <WorkspaceFrame current={tool} bleed preview={{account:ACCOUNT,credits:CREDITS}} notices={<Banner kind="warn" icon={<Sparkles/>}>Your company has used 85% of this month’s credits: 300 left. They reset on 5 Dec. <a className="ds-link" href="#usage">Usage</a></Banner>}>
  <EditorScreen tool={tool} onTool={t=>{setTool(t);setStage(t==='visuals'?'car':'result')}} bar={bar} stage={stageNode}
   history={<VersionHistory versions={history} current={current} onPick={setCurrent} onCancel={()=>toast.toast({message:'Cancelled. The held credits are back.',kind:'ok'})}/>}
   settings={settings} cost={cost} verb={tool==='storyboard'?'Plan the shots':'Generate'} onGenerate={()=>toast.toast({message:`A new version starts. ${cost} credits are held until it finishes.`})}
   note={<>1,700 of 2,000 credits used this month</>}/>
 </WorkspaceFrame>;
}

