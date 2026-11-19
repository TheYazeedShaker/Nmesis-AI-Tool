'use client';
import * as React from 'react';
import {ArrowDown,ArrowUp,Camera,Crown,Images,MoreHorizontal,Plus,Sparkles,X} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {Badge,State} from '@/components/ds/feedback';
import {Dialog} from '@/components/ds/dialog';
import {Field,Input,Radio,RadioGroup,Select,Slider,Switch,Textarea} from '@/components/ds/field';
import {Menu,MenuItem,MenuSeparator} from '@/components/ds/menu';
import {credits as creditWords,OWN_KEY} from '@/lib/ds/words';
import {ChoiceChips,QualitySettings,SettingsSection,QUALITY_LABEL,type Quality} from './parts';
import {LINEUP_LAYOUTS,MAX_LINEUP_CARS,MIN_LINEUP_SCALE,STRICT_LINEUP_REFERENCE_PROMPT,type Lineup,type LineupCar} from '@/lib/lineup';
import {EXTERNAL_IMAGE_MODELS,HIGGSFIELD_IMAGE_MODELS,OPENAI_IMAGE_MODELS,higgsImageModel,openaiImageModel,type ImageProvider} from '@/lib/image-models';
import {ENGINE_LABEL,imageModelLabel} from '@/lib/provider-words';
import {openaiImageCost,sizeTier} from '@/lib/credits/words';
import type {CostKey} from '@/lib/credits/pricing';
import type {CreditOverview} from '@/lib/credits/usage';
import type {Visual} from '@/lib/studio';

// The Line-up tool's pieces in the one editor: the cars, the layout and its
// placement guide, the inspiration lock, quality and engine, the saved car
// references and the one-car refinement. The page (app/lineup/page.tsx) holds
// the state and the requests; these only draw it.

/** A private picture on a signed or same-origin URL (never through next/image). */
export function LineupImg(props:React.ComponentProps<"img">&{alt:string}){
 // eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs
 return <img crossOrigin="anonymous" {...props} alt={props.alt}/>;
}
export const asset=(id:string)=>'/api/assets/'+id;

// ── Quality and cost ─────────────────────────────────────────────────────
// Standard and High detail are the 2K and 4K output sizes the screen always
// had; "High detail" starts at about 3K on the long edge (lib/visual-labels).
export const QUALITY_SIZE:Record<Quality,string>={standard:'2048x1152',high:'3840x2160'};
export const sizeQuality=(size:string):Quality=>sizeTier(size)==='4k'?'high':'standard';

/** The cost-table key of one line-up image; null when the provider prices it as it starts. */
export function lineupCostKey(provider:ImageProvider,model:string,size:string):CostKey|null{
 if(provider==='openai')return openaiImageCost(size);
 if(provider==='higgsfield'){
  let token=false;
  try{token=higgsImageModel(model).variableCost}catch{token=false/* not a Higgsfield model: no table price */}
  return token?'higgsfield.image.token':null;
 }
 return null;
}
/** Credits for one line-up image from the company's price book; 0 on its own key; null when not known before it starts. */
export function lineupCredits(o:CreditOverview|null,provider:ImageProvider,model:string,size:string):number|null{
 const key=lineupCostKey(provider,model,size);
 if(!o||!key)return null;
 if(o.billing[provider]==='own key')return 0;
 const n=o.prices[key];
 return typeof n==='number'?n:null;
}
/** The words under Generate about how it is billed, when the number alone does not say it. */
export function lineupBillingNote(o:CreditOverview|null,provider:ImageProvider,model:string,size:string,names:boolean):string{
 const key=lineupCostKey(provider,model,size);
 if(!key)return names?'Higgsfield prices it in credits as it starts.':'Its credits are set as it starts.';
 const billing=o?.billing[provider];
 if(billing==='own key')return OWN_KEY+'.';
 if(billing==='internal')return 'Not counted here.';
 return '';
}

export function LineupQuality({o,provider,model,size,onSize,names,children}:{o:CreditOverview|null;provider:ImageProvider;model:string;size:string;onSize:(s:string)=>void;names:boolean;/** The Advanced fold (staff, own keys). */children?:React.ReactNode}){
 let fourK=true;
 try{fourK=provider!=='higgsfield'||higgsImageModel(model).max4k}catch{fourK=false/* unknown model: offer only what every model makes */}
 if(!fourK)return <SettingsSection title="Quality" id="lineup-quality-title"><p className="ds-help">{names?'Grok makes 1K or 2K. For High detail, choose another model under Advanced.':'Standard (up to 2K) for this version.'}</p>{children}</SettingsSection>;
 const value=sizeQuality(size);
 const costs={standard:lineupCredits(o,provider,model,QUALITY_SIZE.standard),high:lineupCredits(o,provider,model,QUALITY_SIZE.high)};
 if(costs.standard!==null&&costs.high!==null)return <QualitySettings value={value} onChange={q=>onSize(QUALITY_SIZE[q])} costs={costs as Record<Quality,number>}>{children}</QualitySettings>;
 return <SettingsSection title="Quality" id="lineup-quality-title">
  <RadioGroup legend="Quality" className="editor-quality">
   {(['standard','high'] as Quality[]).map(q=><Radio key={q} name="lineup-quality" checked={value===q} onChange={()=>onSize(QUALITY_SIZE[q])} label={QUALITY_LABEL[q]} help={q==='standard'?'Quicker; good for trying ideas.':'Sharper details for the final.'}/>)}
  </RadioGroup>
  {children}
 </SettingsSection>;
}

// ── Engine (the old image generator settings) ────────────────────────────
// Only for Nmesis staff and companies with their own keys, under Advanced in
// the Quality section; they see the provider and the model (F-050).
export function LineupEngine({names,provider,model,size,onProvider,onModel,onSize}:{names:boolean;provider:ImageProvider;model:string;size:string;onProvider:(p:ImageProvider)=>void;onModel:(m:string)=>void;onSize:(s:string)=>void}){
 let info:ReturnType<typeof higgsImageModel>=higgsImageModel(HIGGSFIELD_IMAGE_MODELS[0].id);
 try{if(provider==='higgsfield')info=higgsImageModel(model)}catch{info=higgsImageModel(HIGGSFIELD_IMAGE_MODELS[0].id)/* unknown model: describe the default */}
 const fourK=provider!=='higgsfield'||info.max4k;
 const engine=(p:'openai'|'higgsfield',named:string)=>names?named:ENGINE_LABEL[p];
 const modelName=(id:string,named:string)=>names?named:imageModelLabel(id);
 let named='';
 try{named=provider==='openai'?openaiImageModel(model).description+' Uses your OpenAI connection. Output dimensions are saved with each image.':''}catch{named=''/* unknown model: the general line below */}
 const about=!names
  ?provider==='openai'?'Detailed visuals and precise area edits. Output dimensions are saved with each image.':info.max4k?'High-quality reference editing at 1K, 2K or 4K. Generate starts a paid request immediately. Each image costs the credits shown next to Generate.':'Quick works at 1K or 2K. Generate starts a paid request immediately; its credits are set as it starts. Choose High detail or Fast for 4K.'
  :provider==='openai'?named:info.max4k?'High-quality reference editing at 1K, 2K or 4K. Generate starts a paid request immediately. Each image costs the credits shown next to Generate.':'Grok supports 1K or 2K. Generate starts a paid request immediately; Higgsfield prices it in credits as it starts. Choose Sunburst or Flare for 4K.';
 const models=provider==='openai'?OPENAI_IMAGE_MODELS.map(m=><option key={m.id} value={m.id}>{modelName(m.id,m.label)}</option>)
  :HIGGSFIELD_IMAGE_MODELS.map(m=><option key={m.id} value={m.id}>{modelName(m.id,m.label)}{names?(m.max4k?' · up to 4K':' · up to 2K'):(m.max4k?' · up to 4K':'')}</option>);
 return <>
  <Field label={names?'Image generator':'Image engine'}><Select value={provider} onChange={e=>onProvider(e.target.value as ImageProvider)}><option value="openai">{engine('openai','ChatGPT / OpenAI')}</option><option value="higgsfield">{engine('higgsfield','Higgsfield')}</option></Select></Field>
  <Field label={names?'Image model':'Mode'} help={about}><Select value={model} onChange={e=>onModel(e.target.value)}>{models}</Select></Field>
  <Field label="Output size"><Select value={size} onChange={e=>onSize(e.target.value)}>
   {provider==='openai'?<option value="1536x864">Preview · 1536 × 864</option>:<option value="1024x576">1K · landscape</option>}
   <option value="2048x1152">2K · landscape</option>
   {fourK&&<option value="3840x2160">{provider==='openai'?'4K · 3840 × 2160':'4K · landscape'}</option>}
  </Select></Field>
  {names&&provider==='higgsfield'&&<details className="editor-lineup-details"><summary>Nano Banana Pro &amp; Seedream</summary><p className="ds-help">Use these on Higgsfield’s website. These models are not connected through the Higgsfield API here.</p><div className="editor-row">{EXTERNAL_IMAGE_MODELS.map(m=><a key={m.label} className="ds-link" href={m.url} target="_blank" rel="noreferrer">Open {m.label} on Higgsfield</a>)}</div></details>}
 </>;
}

// ── Match the reference exactly ──────────────────────────────────────────
export function LineupReferenceSwitch({active,onChange,refining=false}:{active:boolean;onChange:(a:boolean)=>void;refining?:boolean}){
 const id=React.useId();
 return <div className="editor-inspiration">
  <Switch label={refining?'Use inspiration for this edit':'Match reference exactly'} checked={active} onChange={e=>onChange(e.target.checked)} aria-describedby={id}/>
  <p className="ds-help" id={id}>{refining?'The displayed lineup is the base. Preserve previous edits; use inspiration only for the requested change.':active?'Your cars. The reference’s shot. Locks camera, lens distortion, framing, lighting, mood and surroundings. Reference staging overrides car angles, hero placement and conflicting prompt text.':'Turn on to use the inspiration as the full shot blueprint, replacing its cars with yours.'}</p>
  {active&&!refining&&<><p className="ds-help">For the closest match, use the same number of cars as the reference. Car order maps left to right. AI can still vary details.</p>
   <details className="editor-lineup-details"><summary>View the fixed prompt</summary><pre className="editor-lineup-prompt">{STRICT_LINEUP_REFERENCE_PROMPT}</pre></details></>}
 </div>;
}

// ── The cars ─────────────────────────────────────────────────────────────
export function LineupCars({cars,heroId,strict,ready,onEdit,onSaved,onHero,onMove,onRemove,onAdd}:{cars:LineupCar[];heroId:string;strict:boolean;ready:boolean;
 onEdit:(id:string)=>void;onSaved:(id:string)=>void;onHero:(id:string)=>void;onMove:(i:number,by:-1|1)=>void;onRemove:(id:string)=>void;onAdd:()=>void}){
 return <SettingsSection title="Cars" id="lineup-cars-title">
  <p className="ds-help">2–6 cars. One main angle and an optional detail view for each; keep each car’s colour and trim consistent.</p>
  <ol className="editor-lineup" aria-busy={!ready||undefined}>
   {cars.map((car,i)=>{const hero=car.id===heroId;return <li key={car.id} className="editor-lineup-car" data-hero={hero||undefined}>
    <button type="button" className="editor-lineup-open" onClick={()=>onEdit(car.id)} aria-label={`Car ${i+1}, ${car.name}${hero?', hero':''}: ${car.views.length?'edit its views':'choose an angle'}`}>
     <span className="editor-lineup-thumb" aria-hidden="true">{car.views[0]?<LineupImg src={asset(car.views[0].id)} alt=""/>:<Camera/>}</span>
     <span><b className="ds-truncate">{car.name}</b><span className="ds-muted ds-truncate">{car.views.length?[car.views[0].label,car.finish].filter(Boolean).join(' · '):'Choose an angle'}</span></span>
    </button>
    {hero&&<Badge icon={<Crown aria-hidden="true"/>}>Hero</Badge>}
    <Menu label={`More for car ${i+1}`} trigger={<MoreHorizontal aria-hidden="true"/>} size="sm">
     <MenuItem icon={<Camera/>} onSelect={()=>onEdit(car.id)}>{car.views.length?'Edit views':'Capture or upload'}</MenuItem>
     <MenuItem icon={<Images/>} onSelect={()=>onSaved(car.id)}>Saved references</MenuItem>
     <MenuItem icon={<Crown/>} disabled={strict||hero} onSelect={()=>onHero(car.id)}>Make hero</MenuItem>
     <MenuItem icon={<ArrowUp/>} disabled={i===0} onSelect={()=>onMove(i,-1)}>Move left</MenuItem>
     <MenuItem icon={<ArrowDown/>} disabled={i===cars.length-1} onSelect={()=>onMove(i,1)}>Move right</MenuItem>
     <MenuSeparator/>
     <MenuItem danger icon={<X/>} disabled={cars.length<=2} onSelect={()=>onRemove(car.id)}>Remove car</MenuItem>
    </Menu>
   </li>})}
  </ol>
  <div className="editor-row"><Button size="sm" icon={<Plus aria-hidden="true"/>} disabled={cars.length>=MAX_LINEUP_CARS||!ready} onClick={onAdd}>Add a car</Button></div>
 </SettingsSection>;
}

// ── Layout and expert placement ──────────────────────────────────────────
const PLACE:[keyof Pick<LineupCar,'x'|'y'|'scale'>,string,number,number][]=[['x','Left / right',5,95],['y','Near / far',25,90],['scale','Apparent width',MIN_LINEUP_SCALE,60]];
export function LineupLayout({cars,layout,strict,expert,onLayout,onExpert,onPlace}:{cars:LineupCar[];layout:Lineup['layout'];strict:boolean;expert:boolean;
 onLayout:(l:Lineup['layout'])=>void;onExpert:(on:boolean)=>void;onPlace:(id:string,patch:Partial<LineupCar>)=>void}){
 const chosen=LINEUP_LAYOUTS.find(l=>l.id===layout);
 return <SettingsSection title="Layout" id="lineup-layout-title">
  {strict?<p className="ds-help">Reference composition is locked. Car order replaces reference vehicles from left to right.</p>
   :<><ChoiceChips legend="Layout" name="lineup-layout" choices={LINEUP_LAYOUTS.map(l=>({id:l.id,name:l.name}))} value={layout} onChange={id=>onLayout(id as Lineup['layout'])}/>
    <p className="ds-help">{chosen?.description} {layout==='inspiration'?'The inspiration sets the final camera and staging.':'The generator adapts placement to realistic perspective and vehicle sizes.'}</p></>}
  <Switch label="Expert placement" checked={expert} onChange={e=>onExpert(e.target.checked)}/>
  {expert&&<>
   {cars.map((c,i)=><fieldset key={c.id} className="editor-lineup-place" disabled={strict||layout==='inspiration'}>
    <legend className="ds-label">Car {i+1} · {c.name}</legend>
    {PLACE.map(([k,label,min,max])=><Field key={k} label={label}><Slider value={c[k]} min={min} max={max} format={v=>`${v}%`} onValueChange={v=>onPlace(c.id,{[k]:v})}/></Field>)}
   </fieldset>)}
   {(strict||layout==='inspiration')&&<p className="ds-help">Choose another layout to use custom placement.</p>}
  </>}
 </SettingsSection>;
}

/** The placement guide in the canvas: not a generated preview. */
export function LineupPlacement({cars,heroId,strict,moodId}:{cars:LineupCar[];heroId:string;strict:boolean;moodId?:string}){
 if(strict&&moodId)return <figure className="editor-result">
  <LineupImg className="editor-lineup-locked" src={asset(moodId)} alt="Locked reference composition"/>
  <figcaption><span>Reference composition is locked. Car order replaces reference vehicles from left to right.</span></figcaption>
 </figure>;
 return <figure className="editor-result">
  <div className="editor-lineup-stage" role="img" aria-label={`Placement guide: ${cars.map((c,i)=>`${i+1} ${c.name}${c.id===heroId?' (hero)':''}`).join(', ')}`}>
   <span className="editor-lineup-horizon" aria-hidden="true"/>
   {[...cars].sort((a,b)=>a.y-b.y).map(car=><span key={car.id} className="editor-lineup-stage-car" data-hero={car.id===heroId||undefined} style={{left:car.x+'%',top:car.y+'%',width:car.scale+'%'}} aria-hidden="true">
    {car.views[0]?<LineupImg src={asset(car.views[0].id)} alt=""/>:<Camera/>}
    <span>{cars.findIndex(c=>c.id===car.id)+1} · {car.name}</span>
   </span>)}
  </div>
  <figcaption><span>Placement guide, not a generated preview.</span></figcaption>
 </figure>;
}

// ── Saved car references ─────────────────────────────────────────────────
export function LineupSavedDialog({saved,cars,targetId,onPick,onClose}:{saved:LineupCar[];cars:LineupCar[];targetId:string;onPick:(c:LineupCar)=>void;onClose:()=>void}){
 const [search,setSearch]=React.useState('');
 const list=saved.filter(c=>(c.name+' '+c.finish).toLowerCase().includes(search.toLowerCase()));
 return <Dialog open wide onClose={onClose} title="Use a saved car reference">
  <div className="ds-stack">
   <p className="ds-help">These are the original car images used in your saved visuals.</p>
   <Field label="Find a car"><Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Car name or colour…"/></Field>
   {!saved.length?<State kind="empty" title="No saved car references yet">Capture or upload a car view.</State>
    :!list.length?<State kind="no-results" title="No car matches" actions={<Button size="sm" onClick={()=>setSearch('')}>Clear search</Button>}>Try fewer letters.</State>
    :<ul className="ds-grid dense editor-lineup-saved" aria-label="Saved car references">{list.map(c=><li key={c.views[0].id}>
     <button type="button" className="editor-lineup-pick" disabled={cars.some(x=>x.id!==targetId&&x.views.some(v=>c.views.some(r=>r.id===v.id)))} onClick={()=>onPick(c)}>
      <LineupImg loading="lazy" src={asset(c.views[0].id)} alt=""/><b className="ds-truncate">{c.name}</b>{c.finish&&<span className="ds-muted ds-truncate">{c.finish}</span>}
     </button></li>)}</ul>}
  </div>
 </Dialog>;
}

// ── Refine one car ───────────────────────────────────────────────────────
export function LineupRefineDialog({visual,strict,onStrict,carId,onCar,text,onText,cost,note,onRefine,onClose}:{visual:Visual;strict:boolean;onStrict:(a:boolean)=>void;carId:string;onCar:(id:string)=>void;
 text:string;onText:(t:string)=>void;cost:number|null;note:string;onRefine:()=>void;onClose:()=>void}){
 const cars=visual.lineup?.cars||[];
 return <Dialog open wide onClose={onClose} title={strict?'Refine the reference match':'Refine one car'}
  footer={<><Button onClick={onClose}>Cancel</Button><Button kind="primary" icon={<Sparkles aria-hidden="true"/>} disabled={!text.trim()||!carId} onClick={onRefine}>Create refined lineup{cost!==null&&<span className="ds-btn-meta">· {creditWords(cost)}</span>}</Button></>}>
  <div className="ds-stack">
   <LineupReferenceSwitch refining active={strict} onChange={onStrict}/>
   <RadioGroup legend="Car to change" className="editor-quality">
    {cars.map((c,i)=><Radio key={c.id} name="lineup-refine-car" checked={carId===c.id} onChange={()=>onCar(c.id)} label={<span className="editor-lineup-car"><span className="editor-lineup-thumb" aria-hidden="true">{c.views[0]&&<LineupImg src={asset(c.views[0].id)} alt=""/>}</span><span>Car {i+1} · {c.name}</span></span>}/>)}
   </RadioGroup>
   <Field label="What should change?" count={{value:text.length,max:1000}} help="Edits the displayed lineup and keeps previous changes. For a change in one precise region, use Area edit. Every version is saved separately.">
    <Textarea value={text} onChange={e=>onText(e.target.value.slice(0,1000))} rows={4} placeholder="Correct this car’s wheels to match its reference. Keep the other cars and scenery unchanged."/>
   </Field>
   {note&&<p className="ds-help">{note}</p>}
  </div>
 </Dialog>;
}
