'use client';
import * as React from 'react';
import {Download,MoreHorizontal,Pencil,Plus,Trash2,X} from 'lucide-react';
import {Button,IconButton} from '@/components/ds/button';
import {Dialog,useConfirm} from '@/components/ds/dialog';
import {DropZone} from '@/components/ds/drop-zone';
import {Field,Input,Select} from '@/components/ds/field';
import {Loading,SkeletonPanel,State} from '@/components/ds/feedback';
import {PageHeader,Section} from '@/components/ds/layout';
import {Menu,MenuItem,MenuSeparator} from '@/components/ds/menu';
import {useToast} from '@/components/ds/toast';
import {api} from '@/components/company/api';
import {loadAccount,useAccount} from '@/components/studio-account';
import {can} from '@/lib/accounts/can';
import {studioFetch} from '@/lib/studio-fetch';
import {BRAND_FONTS,cleanHex,COLOUR_NAME_MAX,LOGO_MAX_BYTES,LOGO_NAME_MAX,MAX_COLOURS,MAX_LOGOS,NOT_YET,ONLY_EDITORS,parseKit,parseLogoName,PICKER_FALLBACK,TOO_MANY_LOGOS,VOICE_MAX,type BrandFont,type BrandKit,type BrandLogo} from '@/lib/brand-kit';

// The company's brand kit (Settings → Brand kit, /company/brand): logos,
// colours, fonts and the brand voice. The Brand panel beside a tool shows the
// same kit to use (brand-panel.tsx, through useBrandKit below). Everyone in
// the company reads it; owners and creators change it (can(…,'brand.edit');
// every write route checks the same rule again).
// Logos are added and removed at once; colours, fonts and voice are saved
// together with one button. Styles: app/brand.css.

// ── The kit, loaded once per page ───────────────────────────────────────
let pending:Promise<BrandKit>|undefined;
let last:BrandKit|undefined;
const listeners=new Set<(kit:BrandKit)=>void>();
function publish(kit:BrandKit){last=kit;pending=Promise.resolve(kit);listeners.forEach(l=>l(kit))}
async function fetchKit():Promise<BrandKit>{
 const d=await api<{kit?:BrandKit}>('/api/brand-kit');
 if(!d.kit)throw new Error('The brand kit didn’t load. Try again.');
 return d.kit;
}
/** The kit from GET /api/brand-kit, asked for once per page; `fresh` asks again. */
export function loadBrandKit(fresh=false):Promise<BrandKit>{
 if(fresh||!pending)pending=fetchKit().then(kit=>{publish(kit);return kit},e=>{pending=undefined;throw e});
 return pending;
}
/** The company's brand kit for any part of a page (logos to place, fonts and
 *  colours to style with). Every part using it updates when the kit changes. */
export function useBrandKit():{kit:BrandKit|null;error:string;reload:()=>Promise<void>}{
 const [kit,setKit]=React.useState<BrandKit|null>(()=>last??null);
 const [error,setError]=React.useState('');
 React.useEffect(()=>{
  let live=true;
  listeners.add(setKit);
  loadBrandKit().then(k=>{if(live){setKit(k);setError('')}},e=>{if(live)setError(e instanceof Error?e.message:'The brand kit didn’t load. Try again.')});
  return()=>{live=false;listeners.delete(setKit)};
 },[]);
 const reload=React.useCallback(async()=>{
  setError('');
  try{await loadBrandKit(true)}catch(e){setError(e instanceof Error?e.message:'The brand kit didn’t load. Try again.')}
 },[]);
 return {kit,error,reload};
}

const message=(e:unknown,fallback:string)=>e instanceof Error&&e.message?e.message:fallback;
const plural=(n:number,one:string,many:string)=>`${n.toLocaleString('en-US')} ${n===1?one:many}`;

// ── Logos ───────────────────────────────────────────────────────────────
// Under Vercel's 4.5 MB request limit a logo goes straight to the route; a
// larger one goes through private storage first (lib/studio-fetch.ts).
const DIRECT_MAX=4_000_000;
async function sendLogo(file:File){
 const form=new FormData();form.set('logo',file);
 let r:Response;
 try{r=await (file.size>DIRECT_MAX?studioFetch:fetch)('/api/brand-kit/logos',{method:'POST',body:form,signal:AbortSignal.timeout(120_000)})}
 catch(e){throw new Error(e instanceof Error&&e.name==='TimeoutError'?'That took too long. Try again.':message(e,'The logo couldn’t be uploaded. Try again.'))}
 const d=await r.json().catch(()=>null) as {error?:string}|null;
 if(!r.ok)throw new Error(d?.error||'The logo couldn’t be added. Try again.');
}

function LogoTile({logo,editable,onRename,onRemove}:{logo:BrandLogo;editable:boolean;onRename:()=>void;onRemove:()=>void}){
 return <div className="ds-tile" role="listitem">
  {/* A light checkerboard in both themes: most logos are dark, and transparency shows. */}
  <div className="ds-tile-media brand-logo-media" data-theme="light">
   {/* eslint-disable-next-line @next/next/no-img-element -- private media on a signed link */}
   <img src={logo.url} alt={logo.name} loading="lazy"/>
  </div>
  <div className="ds-tile-actions">
   <Menu label={`More for ${logo.name}`} trigger={<MoreHorizontal aria-hidden="true"/>} size="sm">
    <MenuItem icon={<Download/>} onSelect={()=>location.assign(logo.url+'?download=1')}>Download</MenuItem>
    {editable&&<MenuItem icon={<Pencil/>} onSelect={onRename}>Rename</MenuItem>}
    {editable&&<MenuSeparator/>}
    {editable&&<MenuItem icon={<Trash2/>} danger onSelect={onRemove}>Remove</MenuItem>}
   </Menu>
  </div>
  <div className="ds-tile-meta"><span className="ds-tile-name ds-truncate" title={logo.name}>{logo.name}</span></div>
 </div>;
}

function RenameDialog({logo,onClose}:{logo:BrandLogo;onClose:()=>void}){
 const toast=useToast();
 const [name,setName]=React.useState(logo.name),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
 async function save(){
  if(busy)return;
  const checked=parseLogoName(name);
  if(!checked.ok){setError(checked.error);return}
  setBusy(true);
  try{await api(logo.url,'PATCH',{name:checked.value});await loadBrandKit(true);toast.toast({message:'Logo renamed.',kind:'ok'});onClose()}
  catch(e){setError(message(e,'The logo couldn’t be renamed. Try again.'))}
  finally{setBusy(false)}
 }
 return <Dialog open onClose={onClose} title="Rename logo" footer={<>
  <Button kind="quiet" onClick={onClose}>Cancel</Button>
  <Button kind="primary" busy={busy} onClick={()=>void save()}>Save name</Button>
 </>}>
  <form onSubmit={e=>{e.preventDefault();void save()}}>
   <Field label="Name" error={error||undefined} count={{value:name.length,max:LOGO_NAME_MAX}}>
    <Input value={name} maxLength={LOGO_NAME_MAX} autoComplete="off" onChange={e=>{setName(e.target.value);setError('')}}/>
   </Field>
  </form>
 </Dialog>;
}

function LogosSection({kit,editable}:{kit:BrandKit;editable:boolean}){
 const toast=useToast(),ask=useConfirm();
 const [renaming,setRenaming]=React.useState<BrandLogo|null>(null);
 const [problem,setProblem]=React.useState('');
 const room=MAX_LOGOS-kit.logos.length;
 async function add(files:File[]){
  setProblem('');
  if(files.length>room)throw new Error(room>0?`Your brand kit has room for ${plural(room,'more logo','more logos')}.`:TOO_MANY_LOGOS);
  let added=0;
  try{for(const file of files){await sendLogo(file);added++}}
  finally{if(added)await loadBrandKit(true).catch(()=>setProblem('The logos list didn’t refresh. Reload the page to see it.'))}
  toast.toast({message:added===1?'Logo added.':`${plural(added,'logo','logos')} added.`,kind:'ok'});
 }
 async function remove(logo:BrandLogo){
  setProblem('');
  const yes=await ask({title:`Remove “${logo.name}”?`,body:'It is removed from the brand kit for everyone in your company. This can’t be undone.',verb:'Remove logo',danger:true});
  if(!yes)return;
  try{await api(logo.url,'DELETE');await loadBrandKit(true);toast.toast({message:'Logo removed.',kind:'ok'})}
  catch(e){setProblem(message(e,'The logo couldn’t be removed. Try again.'))}
 }
 return <Section title="Logos" count={`${kit.logos.length} of ${MAX_LOGOS}`}>
  <div className="ds-stack">
   {kit.logos.length>0
    ?<div className="ds-grid dense" role="list" aria-label="Logos">
     {kit.logos.map(l=><LogoTile key={l.id} logo={l} editable={editable} onRename={()=>setRenaming(l)} onRemove={()=>void remove(l)}/>)}
    </div>
    :!editable&&<p className="brand-line">No logos yet.</p>}
   {editable&&(room>0
    ?<DropZone label={kit.logos.length?'Drop, paste or choose another logo':'Drop, paste or choose your logo'} name="logo" multiple maxBytes={LOGO_MAX_BYTES}
      hint={`PNG, JPEG or WebP, up to 5 MB each. Up to ${MAX_LOGOS} logos.`} onFiles={add}/>
    :<p className="brand-line">{TOO_MANY_LOGOS}</p>)}
   {problem&&<p className="ds-error" role="alert">{problem}</p>}
  </div>
  {editable&&renaming&&<RenameDialog key={renaming.id} logo={renaming} onClose={()=>setRenaming(null)}/>}
 </Section>;
}

// ── Colours, fonts and voice: one draft, one Save ───────────────────────
type DraftColour={key:number;hex:string;name:string;error?:string};
type Draft={colours:DraftColour[];headingFont:BrandFont;bodyFont:BrandFont;voice:string};
let nextKey=1;
const toDraft=(kit:BrandKit):Draft=>({colours:kit.colours.map(c=>({key:nextKey++,hex:c.hex,name:c.name})),headingFont:kit.headingFont,bodyFont:kit.bodyFont,voice:kit.voice});
const toBody=(d:Draft)=>({colours:d.colours.map(c=>({hex:c.hex,name:c.name})),headingFont:d.headingFont,bodyFont:d.bodyFont,voice:d.voice});
const sameDraft=(a:Draft,b:Draft)=>JSON.stringify(toBody(a))===JSON.stringify(toBody(b));

function ColourRow({colour,index,onChange,onRemove}:{colour:DraftColour;index:number;onChange:(c:DraftColour)=>void;onRemove:()=>void}){
 const n=index+1,hex=cleanHex(colour.hex);
 return <li className="brand-colour">
  <div className="brand-colour-row" role="group" aria-label={`Colour ${n}`}>
   <input type="color" className="brand-colour-pick" value={(hex||PICKER_FALLBACK).toLowerCase()} aria-label={`Pick colour ${n}`}
    onChange={e=>onChange({...colour,hex:e.target.value.toUpperCase(),error:undefined})}/>
   <Input className="brand-colour-hex" value={colour.hex} maxLength={7} spellCheck={false} autoComplete="off" aria-label={`Hex value of colour ${n}`}
    aria-invalid={colour.error?true:undefined} aria-describedby={colour.error?`brand-colour-${colour.key}-error`:undefined}
    onChange={e=>onChange({...colour,hex:e.target.value,error:undefined})}
    onBlur={()=>{const clean=cleanHex(colour.hex);onChange(clean?{...colour,hex:clean,error:undefined}:{...colour,error:'Use 6 digits, 0–9 and A–F.'})}}/>
   <Input className="brand-colour-name" value={colour.name} maxLength={COLOUR_NAME_MAX} autoComplete="off" placeholder="Name (optional)" aria-label={`Name of colour ${n} (optional)`}
    onChange={e=>onChange({...colour,name:e.target.value})}/>
   <IconButton label={`Remove colour ${n}`} size="sm" onClick={onRemove}><X aria-hidden="true"/></IconButton>
  </div>
  {colour.error&&<p className="ds-error" id={`brand-colour-${colour.key}-error`}>{colour.error}</p>}
 </li>;
}

function Swatches({kit}:{kit:BrandKit}){
 if(!kit.colours.length)return <p className="brand-line">No colours yet.</p>;
 return <ul className="brand-swatches" aria-label="Colours">
  {kit.colours.map((c,i)=><li key={i} className="brand-swatch">
   <span className="brand-swatch-chip" style={{background:c.hex}} aria-hidden="true"/>
   <span className="brand-swatch-text"><b className="ds-truncate" title={c.name||c.hex}>{c.name||c.hex}</b>{c.name&&<span className="brand-hex">{c.hex}</span>}</span>
  </li>)}
 </ul>;
}

function KitForm({kit,editable}:{kit:BrandKit;editable:boolean}){
 const toast=useToast();
 const saved=React.useMemo(()=>toDraft(kit),[kit]);
 const [draft,setDraft]=React.useState<Draft>(saved);
 const [problem,setProblem]=React.useState(''),[busy,setBusy]=React.useState(false);
 const dirty=!sameDraft(draft,saved);
 const set=(change:Partial<Draft>)=>{setDraft(d=>({...d,...change}));setProblem('')};
 const setColour=(key:number,c:DraftColour)=>set({colours:draft.colours.map(x=>x.key===key?c:x)});
 async function save(){
  if(busy||!dirty)return;
  const body=toBody(draft),checked=parseKit(body);
  if(!checked.ok){setProblem(checked.error);return}
  setBusy(true);setProblem('');
  try{const d=await api<{kit:BrandKit}>('/api/brand-kit','PUT',body);publish(d.kit);toast.toast({message:'Brand kit saved.',kind:'ok'})}
  catch(e){setProblem(message(e,'The brand kit couldn’t be saved. Try again.'))}
  finally{setBusy(false)}
 }
 if(!editable)return <>
  <Section title="Colours" count={`${kit.colours.length} of ${MAX_COLOURS}`}><Swatches kit={kit}/></Section>
  <div className="brand-split">
   <Section title="Fonts">
    <dl className="brand-facts">
     <div><dt>Headings</dt><dd>{kit.headingFont}</dd></div>
     <div><dt>Body text</dt><dd>{kit.bodyFont}</dd></div>
    </dl>
   </Section>
   <Section title="Brand voice"><p className={kit.voice?'brand-voice':'brand-line'}>{kit.voice||'Not set yet.'}</p></Section>
  </div>
 </>;
 return <form className="brand-form" onSubmit={e=>{e.preventDefault();void save()}} aria-label="Colours, fonts and brand voice">
  <Section title="Colours" count={`${draft.colours.length} of ${MAX_COLOURS}`}>
   <div className="ds-stack">
    {draft.colours.length>0&&<ul className="brand-colours" aria-label="Colours">
     {draft.colours.map((c,i)=><ColourRow key={c.key} colour={c} index={i} onChange={next=>setColour(c.key,next)} onRemove={()=>set({colours:draft.colours.filter(x=>x.key!==c.key)})}/>)}
    </ul>}
    {draft.colours.length<MAX_COLOURS
     ?<div><Button size="sm" icon={<Plus aria-hidden="true"/>} onClick={()=>set({colours:[...draft.colours,{key:nextKey++,hex:'',name:''}]})}>Add a colour</Button></div>
     :<p className="brand-line">{`A brand kit holds up to ${MAX_COLOURS} colours.`}</p>}
   </div>
  </Section>
  <div className="brand-split">
   <Section title="Fonts">
    <div className="ds-stack">
     <Field label="Heading font"><Select value={draft.headingFont} onChange={e=>set({headingFont:e.target.value as BrandFont})}>{BRAND_FONTS.map(f=><option key={f} value={f}>{f}</option>)}</Select></Field>
     <Field label="Body font"><Select value={draft.bodyFont} onChange={e=>set({bodyFont:e.target.value as BrandFont})}>{BRAND_FONTS.map(f=><option key={f} value={f}>{f}</option>)}</Select></Field>
    </div>
   </Section>
   <Section title="Brand voice">
    <Field label="How your brand speaks" help="One line, such as “Confident, warm and precise.”" count={{value:draft.voice.length,max:VOICE_MAX}}>
     <Input value={draft.voice} maxLength={VOICE_MAX} autoComplete="off" onChange={e=>set({voice:e.target.value})}/>
    </Field>
   </Section>
  </div>
  {/* Buttons on the left: the toasts stack on the right. */}
  <div className="brand-save" data-dirty={dirty||undefined}>
   <div className="ds-row">
    <Button kind="primary" type="submit" busy={busy} disabled={!dirty}>Save changes</Button>
    <Button kind="quiet" disabled={!dirty||busy} onClick={()=>{setDraft(saved);setProblem('')}}>Discard changes</Button>
   </div>
   <span className="brand-save-state" role="status">{dirty?'You have unsaved changes.':kit.updatedAt?'All changes saved.':''}</span>
   {problem&&<p className="ds-error" role="alert">{problem}</p>}
  </div>
 </form>;
}

// ── The screen ──────────────────────────────────────────────────────────
export function BrandKitScreen(){
 const account=useAccount();
 const {kit,error,reload}=useBrandKit();
 // Wait for the account too, so an editor never sees the read-only page first.
 const [accountSettled,setAccountSettled]=React.useState(false);
 React.useEffect(()=>{let live=true;void loadAccount().then(()=>{if(live)setAccountSettled(true)});return()=>{live=false}},[]);
 const mayEdit=can(account,'brand.edit');
 const editable=mayEdit&&!!account?.workspace.open&&!!kit?.ready;
 return <div className="brand-page">
  <PageHeader eyebrow="Settings" title="Brand kit" lede="Your company’s logos, colours, fonts and voice, in one place for all its work."/>
  {error&&!kit?<State kind="error" title="The brand kit didn’t load" actions={<Button onClick={()=>void reload()}>Try again</Button>}>{error}</State>
   :!kit||!accountSettled?<Loading label="Loading the brand kit" className="ds-stack"><SkeletonPanel/><SkeletonPanel/></Loading>
   :<>
    {!mayEdit&&<p className="brand-line">{ONLY_EDITORS}</p>}
    {mayEdit&&!kit.ready&&<p className="brand-line">{NOT_YET}</p>}
    <LogosSection kit={kit} editable={editable}/>
    <KitForm key={kit.updatedAt??'new'} kit={kit} editable={editable}/>
   </>}
 </div>;
}
