'use client';
import * as React from 'react';
import {Trash2} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {useConfirm} from '@/components/ds/dialog';
import {DropZone} from '@/components/ds/drop-zone';
import {Checkbox} from '@/components/ds/field';
import {Badge,Loading,SkeletonRow,Upsell} from '@/components/ds/feedback';
import {Section} from '@/components/ds/layout';
import {useToast} from '@/components/ds/toast';
import {brandFontName,EMBEDDING_HELP,EMBEDDING_LABELS,FONT_ACCEPT,LICENCE_TEXT,MAX_BRAND_FONTS,MAX_FONT_MB,WORDS,type BrandFontFile,type BrandFontsState} from '@/lib/brand-fonts/shared';
import {weightName} from '@/lib/editor/fonts';
import {loadBrandFonts,removeBrandFont,uploadBrandFont,useBrandFonts,type UploadResult} from './brand-fonts';
import {loadPreview} from '@/components/canvas/fonts';
import {fontByName} from '@/lib/editor/fonts';

// The company's own fonts (owner's decisions, 2026-11-22): only owners upload,
// into their own company's brand fonts, after confirming the company holds a
// licence (recorded with who, when and the exact words); every file is
// sanitised on the server before any browser loads it; only the company sees
// them; the plan decides (studio.brand_fonts). Shown on Settings → Brand kit
// and, for the upload alone, from the editor's font list.

const plural=(n:number,one:string,many:string)=>`${n} ${n===1?one:many}`;

/** Who may do what, in one sentence, for anyone who can't upload here. Null when this person may upload. */
export function uploadBlocker(state:BrandFontsState|null):React.ReactNode{
 if(!state)return null;
 if(!state.ready)return <p className="ds-help">{WORDS.notYet}</p>;
 if(!state.onPlan)return <p className="ds-help"><span className="ds-sr-only">Brand fonts: </span><Upsell plan={state.upsell}/></p>;
 if(!state.mayUpload)return <p className="ds-help">{WORDS.onlyOwners}</p>;
 return null;
}

/** The licence confirmation and the drop zone (several files at once). */
export function FontUploader({onDone}:{onDone?:(results:UploadResult[])=>void}){
 const [licence,setLicence]=React.useState(false),[results,setResults]=React.useState<UploadResult[]>([]),[progress,setProgress]=React.useState('');
 const licenceId=React.useId();
 async function add(files:File[]){
  setResults([]);
  const out:UploadResult[]=[];
  // One at a time: each is read and made safe on the server before the next goes.
  for(const [i,file] of files.entries()){
   setProgress(files.length>1?`Checking ${file.name} (${i+1} of ${files.length})…`:`Checking ${file.name}…`);
   out.push(await uploadBrandFont(file));
  }
  setProgress('');setResults(out);
  await loadBrandFonts(true);
  onDone?.(out);
 }
 const added=results.filter(r=>r.ok),refused=results.filter(r=>!r.ok);
 return <div className="ds-stack brand-font-upload" data-brand-font-upload>
  <Checkbox id={licenceId} checked={licence} onChange={e=>setLicence(e.target.checked)} label={LICENCE_TEXT} data-licence/>
  <DropZone kind="font" name="font files" multiple accept={FONT_ACCEPT} maxBytes={MAX_FONT_MB*1024*1024} disabled={!licence} busy={progress||false}
   label="Drop font files here, or choose them" onFiles={add}
   hint={licence?`OTF, TTF, WOFF or WOFF2, up to ${MAX_FONT_MB} MB each. Add a family’s files together: Regular, Bold, Italic…`:'Tick the licence confirmation above to add fonts.'}/>
  {results.length>0&&<div role="status" className="ds-stack">
   {added.length>0&&<p className="ds-help">{`${plural(added.length,'font','fonts')} added: `}{added.map(r=>r.ok&&`${r.font.family} ${r.font.style}`).join(', ')}.</p>}
   {refused.map((r,i)=><p key={i} className="ds-error">{`${r.name}: `}{!r.ok&&r.error}</p>)}
  </div>}
 </div>;
}

function FamilyName({family}:{family:string}){
 const font=fontByName(brandFontName(family)),[shown,setShown]=React.useState(false);
 React.useEffect(()=>{if(!font)return;let live=true;void loadPreview(font).then(r=>{if(live&&r.ok)setShown(true)});return()=>{live=false}},[font]);
 return <h3 className="brand-font-family" style={shown&&font?{fontFamily:`"nm-preview-${font.id}", var(--ds-font-sans)`}:undefined}>{family}</h3>;
}

function FontRow({font,editable,onRemove}:{font:BrandFontFile;editable:boolean;onRemove:(f:BrandFontFile)=>void}){
 const range=font.weightRange?`weights ${font.weightRange[0]}–${font.weightRange[1]}`:`${weightName(font.weight)} (${font.weight})`;
 return <li className="brand-font-file" data-brand-font={font.id} data-status={font.status}>
  <span className="brand-font-text">
   <b>{font.style}</b>
   <span className="brand-hex">{[range,font.italic?'italic':null,font.format.toUpperCase(),`${Math.max(1,Math.round(font.size/1024))} KB`].filter(Boolean).join(' · ')}</span>
   {font.status==='refused'&&<span className="ds-error">{font.reason}</span>}
  </span>
  {font.status==='ready'
   ?<span title={EMBEDDING_HELP[font.embedding]}><Badge>{EMBEDDING_LABELS[font.embedding]}</Badge><span className="ds-sr-only">: {EMBEDDING_HELP[font.embedding]}</span></span>
   :<Badge kind="warn">Not added</Badge>}
  {editable&&<Button size="sm" kind="quiet" icon={<Trash2 aria-hidden="true"/>} onClick={()=>onRemove(font)}>Remove<span className="ds-sr-only"> {font.family} {font.style}</span></Button>}
 </li>;
}

/** Settings → Brand kit → Your fonts: the list by family, and the upload for owners. */
export function BrandFontsSection(){
 const {state,error,reload}=useBrandFonts(),ask=useConfirm(),toast=useToast();
 const fonts=state?.fonts??[],ready=fonts.filter(f=>f.status==='ready');
 const families=[...new Set(fonts.map(f=>f.family))];
 const editable=!!state?.mayUpload&&!!state.ready;
 async function remove(font:BrandFontFile){
  const yes=await ask({title:`Remove ${font.family} ${font.style}?`,verb:'Remove font',danger:true,
   body:font.status==='ready'?'Designs that use it will show “Missing font” until someone picks another font. To bring it back, upload the file again.':'It leaves this list.'});
  if(!yes)return;
  const problem=await removeBrandFont(font.id);
  if(problem){toast.toast({kind:'bad',message:problem});return}
  await reload();toast.toast({kind:'ok',message:'Font removed.'});
 }
 return <Section title="Your fonts" count={state?.ready?`${ready.length} of ${MAX_BRAND_FONTS}`:undefined}>
  <div className="ds-stack" data-brand-fonts>
   <p className="brand-line">Your company’s own font files, for its designs only. Every file is checked and made safe before anyone’s browser loads it.</p>
   {/* Until the list answers: said, and the space kept, so the upload and the list don't appear from nothing. */}
   {!state&&!error&&<Loading label="Loading your fonts" className="ds-stack"><SkeletonRow/><SkeletonRow/></Loading>}
   {error&&!state&&<p className="ds-error" role="alert">{error} <Button size="sm" onClick={()=>void reload()}>Try again</Button></p>}
   {state&&(uploadBlocker(state)??<FontUploader/>)}
   {state?.ready&&(families.length
    ?<ul className="brand-font-families" aria-label="Your fonts">
     {families.map(family=><li key={family} className="brand-font-card">
      <FamilyName family={family}/>
      <ul className="brand-font-files" aria-label={`${family} files`}>
       {fonts.filter(f=>f.family===family).map(f=><FontRow key={f.id} font={f} editable={editable} onRemove={f=>void remove(f)}/>)}
      </ul>
     </li>)}
    </ul>
    :<p className="brand-line">No fonts uploaded yet.</p>)}
  </div>
 </Section>;
}
