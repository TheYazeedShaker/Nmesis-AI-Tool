'use client';
import * as React from 'react';
import {Link2,Music,Upload} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {Field,Input,Radio,RadioGroup,Select,Switch,Textarea} from '@/components/ds/field';
import {filmModelLabel} from '@/lib/provider-words';
import {FILM_MODELS,VIDEO_MODEL} from '@/lib/films';
import type {Configurator} from '@/lib/configurators';
import type {Storyboard} from '@/lib/storyboards';
import {CarSettings,PromptSettings,QUALITY_LABEL,SettingsSection,type Quality} from './parts';
import type {ConfiguratorOptions} from './configurator';

// Story, the one settings panel (Phase 3 group 2): the car, the idea and its
// atmosphere, how many shots, the film's ending and soundtrack, and quality.
// Quality is the clips' video model: Standard is the studio's standard model,
// High detail its higher-fidelity tier of the same model (lib/films.ts). Clip
// prices are quoted live per clip, so the cost shows once the estimate is in.

const NONE:ConfiguratorOptions={colours:[],trims:[],views:[],frames:0};
const IDEAS:[string,string][]=[
 ['Desert escape','Desert road at sunset. Sculptural dunes, warm light and a quiet sense of freedom.'],
 ['Modern sanctuary','A glass pavilion at golden hour. Reflected architecture, warm stone and modern luxury.'],
 ['Quiet horizon','A mountain lake at blue hour. Silver mist, wet stone and calm reflections.'],
];
export const QUALITY_MODEL:Record<Quality,string>={standard:VIDEO_MODEL,high:FILM_MODELS.find(m=>m.launch&&!m.reference&&m.id.includes('/pro/'))?.id||VIDEO_MODEL};
export const qualityOf=(model:string):Quality=>model===QUALITY_MODEL.high&&model!==QUALITY_MODEL.standard?'high':'standard';

export function StorySettings({board,edit,cars,car,onCar,count,onCount,expert,onExpert,showNames,music,onMusic,onPin,onMood,quote,disabled}:{
 board:Storyboard;edit:(patch:Partial<Storyboard>)=>void;
 cars:Configurator[];car:Configurator;onCar:(c:Configurator)=>void;
 count:number;onCount:(n:number)=>void;expert:boolean;onExpert:(on:boolean)=>void;showNames:boolean;
 music:File|null;onMusic:(f:File|null)=>void;onPin:()=>void;onMood:(f:File)=>void;
 /** The quoted price of the new clips at the chosen quality, in words. */quote:string|null;disabled:boolean;
}){
 const moodInput=React.useRef<HTMLInputElement>(null),musicInput=React.useRef<HTMLInputElement>(null);
 const planned=board.shots.length>0,locked=planned||disabled;
 const quality=qualityOf(board.model),standardModel=board.model===QUALITY_MODEL.standard||board.model===QUALITY_MODEL.high;
 const names=cars.some(c=>c.url===car.url)?cars:[...cars,car];
 return <fieldset className="ds-contents" disabled={disabled}>
  <CarSettings cars={names.map(c=>c.name)} car={car.name} onCar={name=>{const c=names.find(x=>x.name===name);if(c&&!locked&&c.url!==car.url)onCar(c)}} options={NONE} state={{}} onColour={()=>{}} onTrim={()=>{}} onView={()=>{}} controlsInEditor={false} idPrefix="story-car"/>
  <SettingsSection title="Your car" id="story-vehicle-title">
   <Field label="Car / trim" help={planned?'Start a new story for another car.':'How the planner names your car.'}><Input value={board.vehicle} onChange={e=>edit({vehicle:e.target.value})} maxLength={100}/></Field>
  </SettingsSection>
  <PromptSettings label="Your idea" value={board.idea} onChange={idea=>edit({idea})} max={2000} inspiration={false} placeholder="A black SUV at a sculptural glass pavilion, warm desert sunset, understated luxury…"/>
  {!planned&&<div className="ds-row" role="group" aria-label="Start from an idea">{IDEAS.map(([name,idea])=><Button key={name} size="sm" kind="quiet" aria-pressed={board.idea===idea} onClick={()=>edit({idea})}>{name}</Button>)}</div>}
  <SettingsSection title="Atmosphere" id="story-mood-title">
   <Field label={<>Art direction <span className="ds-muted">(optional)</span></>} count={{value:board.direction.length,max:2000}}><Textarea value={board.direction} onChange={e=>edit({direction:e.target.value})} maxLength={2000} rows={3} placeholder="Natural reflections, warm highlights, cinematic contrast…"/></Field>
   <Field label={<>Pinterest image pin <span className="ds-muted">(optional)</span></>}><Input value={board.pin} onChange={e=>edit({pin:e.target.value})} placeholder="https://www.pinterest.com/pin/…" inputMode="url"/></Field>
   <div className="editor-row">
    <Button size="sm" icon={<Link2 aria-hidden="true"/>} disabled={!board.pin} onClick={onPin}>Add reference</Button>
    <Button size="sm" kind="quiet" icon={<Upload aria-hidden="true"/>} onClick={()=>moodInput.current?.click()}>Upload a location</Button>
   </div>
   <input hidden className="ds-sr-only" ref={moodInput} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload a location reference" onChange={e=>{const f=e.target.files?.[0];if(f)onMood(f);e.target.value=''}}/>
   {board.moodId&&<div className="editor-storyboard-frame">
    {/* eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs */}
    <img crossOrigin="anonymous" src={'/api/assets/'+board.moodId} alt="Campaign atmosphere reference"/>
   </div>}
   <p className="ds-help">The car views define your vehicle. This image guides the environment and lighting.{planned?' Changing the shared idea, art direction or references resets the affected images. Earlier versions stay saved.':''}</p>
  </SettingsSection>
  <SettingsSection title="Story" id="story-shots-title">
   <Field label="Shots" help={planned?'Set when the shots were planned.':'How many shots the planner writes.'}><Select value={String(count)} onChange={e=>onCount(Number(e.target.value))} disabled={planned}>{[6,12].map(n=><option key={n} value={n}>{n} shots</option>)}</Select></Field>
  </SettingsSection>
  <SettingsSection title="Film ending" id="story-ending-title">
   <Field label={<>Brand ending <span className="ds-muted">(optional)</span></>}><Input value={board.brand} onChange={e=>edit({brand:e.target.value})} maxLength={60}/></Field>
   <Field label={<>Closing line <span className="ds-muted">(optional)</span></>}><Input value={board.tagline} onChange={e=>edit({tagline:e.target.value})} maxLength={100}/></Field>
   <div className="editor-row">
    <Button size="sm" icon={<Music aria-hidden="true"/>} onClick={()=>musicInput.current?.click()}>{music?'Change soundtrack':'Add a soundtrack'}</Button>
    {music&&<Button size="sm" kind="quiet" onClick={()=>onMusic(null)}>Remove</Button>}
   </div>
   <input hidden className="ds-sr-only" ref={musicInput} type="file" accept="audio/*" aria-label="Continuous soundtrack" onChange={e=>{onMusic(e.target.files?.[0]||null);e.target.value=''}}/>
   <p className="ds-help">{music?music.name+' · uses the first 15 seconds, with a fade in/out.':'Without a soundtrack, the final film is silent. Add music you have permission to use.'}</p>
  </SettingsSection>
  <SettingsSection title="Quality" id="story-quality-title">
   <RadioGroup legend="Quality" className="editor-quality">
    {(['standard','high'] as Quality[]).map(q=><Radio key={q} name="story-quality" checked={standardModel&&quality===q} onChange={()=>edit({model:QUALITY_MODEL[q]})}
     label={<span className="editor-quality-label">{QUALITY_LABEL[q]}<span className="ds-muted">{standardModel&&quality===q&&quote?quote:'Priced before rendering'}</span></span>}
     help={q==='standard'?'Balanced cinematic motion for every clip.':'Higher-fidelity motion for the final.'}/>)}
   </RadioGroup>
   <Switch label="Expert controls" checked={expert} onChange={e=>onExpert(e.target.checked)}/>
   {expert&&<Field label="Video model" help="Changing it needs a new estimate for every clip."><Select value={board.model} onChange={e=>edit({model:e.target.value})}>{FILM_MODELS.filter(m=>!m.reference).map(m=><option key={m.id} value={m.id}>{showNames?m.label:filmModelLabel(m.id)}</option>)}</Select></Field>}
   <a className="ds-link" href="/films">Video connection & daily budget</a>
  </SettingsSection>
 </fieldset>;
}
