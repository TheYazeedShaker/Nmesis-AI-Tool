'use client';
import * as React from 'react';
import {Download,LockKeyhole} from 'lucide-react';
import {Button,buttonClass} from '@/components/ds/button';
import {Badge} from '@/components/ds/feedback';
import {Dialog} from '@/components/ds/dialog';
import {Field,Input,Radio,RadioGroup} from '@/components/ds/field';
import {NmesisProvides} from '@/components/credits';
import {VIDEO_MODEL,type Film,type FilmDraft,type FilmModelId} from '@/lib/films';
import {QUALITY_LABEL,SettingsSection,type Quality,type Version} from './parts';

// The Film tool's own pieces of the one editor (Phase 3 group 2): quality as
// Standard / High detail over the film models, the versions from the film
// list, the branded export and the video connection. The page keeps the
// behaviour (app/films/page.tsx); these only draw it.

export const FILM_STATUS:Record<string,string>={draft:'Draft',quoted:'Estimate ready',submitting:'Submitting',unknown:'Submission uncertain',queued:'In queue',in_progress:'Rendering',archiving:'Saving film',ready:'Ready to review',failed:'Could not render',nsfw:'Needs revision',canceled:'Canceled'};
/** Being made: the provider has it, or may have it. */
export const FILM_WORKING=['queued','in_progress','archiving','submitting','unknown'];

// Quality over the models the screen already offered: the two Kling 3.0 tiers
// whose plain names are already "Standard" and "High detail"
// (lib/provider-words.ts). Launch films and Animate image both take them. The
// car-reference workflow has no such pair, so it shows the model choice only.
const KLING_PRO:FilmModelId='kling-video/v3.0/pro/image-to-video';
export const QUALITY_MODEL:Record<Quality,FilmModelId>={standard:VIDEO_MODEL,high:KLING_PRO};
export const hasQuality=(mode:FilmDraft['mode'])=>mode!=='reference';
export const qualityOf=(model:string|undefined):Quality|null=>(model??VIDEO_MODEL)===KLING_PRO?'high':(model??VIDEO_MODEL)===VIDEO_MODEL?'standard':null;
/** For the version list: the higher tiers read as High detail. */
const versionQuality=(model:string|undefined):Quality=>/\/(pro|4k)\//.test(model??'')?'high':'standard';

/** Each film is a version, newest first. Failed films carry no "nothing used"
 *  claim: a render the provider accepted is charged even when it then fails. */
export function filmVersions(films:Film[]):Version[]{
 return films.map((f,i)=>{
  const working=FILM_WORKING.includes(f.status),date=new Date(f.createdAt).toLocaleDateString();
  return {id:f.id,n:films.length-i,label:f.data.title,src:'/api/assets/'+f.data.sourceId,quality:versionQuality(f.data.model),
   used:f.status==='ready'?f.credits:null,at:working||f.status==='ready'?date:`${FILM_STATUS[f.status]||f.status} · ${date}`,
   status:working?'working':'ready',stage:FILM_STATUS[f.status]||f.status,held:working?f.credits:undefined};
 });
}

export function FilmNameField({value,onChange,disabled}:{value:string;onChange:(v:string)=>void;disabled?:boolean}){
 return <label className="editor-name"><span className="ds-sr-only">Film name</span><Input value={value} onChange={e=>onChange(e.target.value)} maxLength={100} disabled={disabled}/></label>;
}

/** Standard / High detail. The price is the provider's live estimate, so it is
 *  shown for the chosen quality once estimated, never guessed for the other. */
export function FilmQualitySettings({value,onChange,price}:{value:Quality|null;onChange:(q:Quality)=>void;price:string|null}){
 return <SettingsSection title="Quality" id="film-quality-title">
  <RadioGroup legend="Quality" className="editor-quality">
   {(['standard','high'] as Quality[]).map(q=><Radio key={q} name="film-quality" checked={value===q} onChange={()=>onChange(q)}
    label={<span className="editor-quality-label">{QUALITY_LABEL[q]}<span className="ds-muted">{value===q&&price?price:'Priced at the estimate'}</span></span>}
    help={q==='standard'?'Balanced motion; good for trying ideas.':'Higher-fidelity motion for the final.'}/>)}
  </RadioGroup>
 </SettingsSection>;
}

export type FilmShape='landscape'|'portrait'|'square';
const SHAPES:{id:FilmShape;label:string}[]=[{id:'landscape',label:'16:9 · 720p'},{id:'portrait',label:'9:16 · 720p'},{id:'square',label:'1:1 · 1080px'}];

/** Brand and closing line over the film, in a format; made in this tab, no credits. */
export function FilmExportDialog({open,onClose,videoUrl,brand,tagline,onBrand,onTagline,shape,onShape,exporting,onExport,onCancel}:{
 open:boolean;onClose:()=>void;videoUrl:string;brand:string;tagline:string;onBrand:(v:string)=>void;onTagline:(v:string)=>void;
 shape:FilmShape;onShape:(s:FilmShape)=>void;exporting:number|null;onExport:()=>void;onCancel:()=>void}){
 return <Dialog open={open} onClose={onClose} title="Make it yours"
  footer={<>{exporting!==null
   ?<Button onClick={onCancel}>Cancel export</Button>
   :<a className={buttonClass({kind:'quiet'})} href={videoUrl+'?download=1'} download><Download aria-hidden="true"/>Original MP4</a>}
   <Button kind="primary" busy={exporting!==null} onClick={onExport} icon={<Download aria-hidden="true"/>}>{exporting!==null?`Exporting ${exporting}%`:'Download branded film'}</Button></>}>
  <p className="ds-help">Add your brand and closing line, then choose a format.</p>
  <Field label="Brand" count={{value:brand.length,max:60}}><Input value={brand} maxLength={60} onChange={e=>onBrand(e.target.value)}/></Field>
  <Field label="Closing line" count={{value:tagline.length,max:100}}><Input value={tagline} maxLength={100} onChange={e=>onTagline(e.target.value)}/></Field>
  <RadioGroup legend="Format">
   {SHAPES.map(s=><Radio key={s.id} name="film-shape" checked={shape===s.id} onChange={()=>onShape(s.id)} label={s.label} disabled={exporting!==null}/>)}
  </RadioGroup>
  <p className="ds-help">The entire frame is preserved with dark borders when needed. The closing title appears over the final two seconds. Keep this tab open while exporting. Original MP4 keeps the model’s native resolution.</p>
 </Dialog>;
}

export type VideoConnection={connected:boolean;sponsored:boolean;ownKeys?:boolean;nmesis?:boolean;available?:boolean};

/** Who pays for films: Nmesis's AI (credits) or the company's own key. The
 *  key is sent once to the server, stored encrypted, and never shown again. */
export function FilmConnectionDialog({open,onClose,connection,words,busy,saving,error,onSave,onRemove}:{
 open:boolean;onClose:()=>void;connection:VideoConnection|null;words:(t:string)=>string;busy:boolean;saving:boolean;error:string;
 onSave:(key:string)=>Promise<boolean>;onRemove:()=>void}){
 const [key,setKey]=React.useState('');
 const close=()=>{setKey('');onClose()};
 return <Dialog open={open} onClose={close} title={<><LockKeyhole aria-hidden="true"/> Video connection</>}>
  {connection&&!connection.ownKeys?<>
   <p className="ds-help">{words('Films, swaps and Higgsfield images use the AI Nmesis provides. Each one shows its cost in credits before it starts.')}</p>
   <NmesisProvides provider="higgsfield"/>
  </>:<>
   <p className="ds-help">{connection?.sponsored?words('Your company’s owner manages its own Higgsfield key. Its key stays private.'):words('Your plan includes your own provider keys. With your Higgsfield key connected, videos and Higgsfield images are billed to that account and cost 0 credits; without it, Nmesis provides the AI and your company spends credits.')}</p>
   <Badge kind={connection?.connected?'ok':'quiet'}>{connection?.connected?'Encrypted credential saved':'No key of your own: Nmesis provides the AI'}</Badge>
   {!connection?.sponsored?<>
    <form className="ds-stack" onSubmit={e=>{e.preventDefault();void onSave(key).then(saved=>{if(saved)setKey('')})}}>
     <Field label={words('Higgsfield API credential')} help="Stored encrypted on the server. Access is verified when you request a film estimate.">
      <Input type="password" autoComplete="off" placeholder="Paste your complete API credential" value={key} onChange={e=>setKey(e.target.value)} required/>
     </Field>
     <span className="ds-row"><Button kind="primary" type="submit" busy={saving} disabled={busy||!key.trim()}>Save video connection</Button></span>
    </form>
    <a className="ds-link" href="https://open.higgsfield.ai/api-keys" target="_blank" rel="noreferrer">{words('Open Higgsfield developer account')} <span aria-hidden="true">↗</span><span className="ds-sr-only"> (opens in a new tab)</span></a>
    {connection?.connected&&<span className="ds-row"><Button kind="danger-quiet" size="sm" disabled={busy} onClick={()=>{setKey('');onRemove()}}>Remove video connection</Button></span>}
   </>:<p className="ds-help">{connection.connected?words('Your company’s own Higgsfield key is used: 0 credits.'):'Without a company key, Nmesis provides the AI and your company spends credits.'}</p>}
  </>}
  {error&&<p role="alert" className="ds-error">{error}</p>}
 </Dialog>;
}
