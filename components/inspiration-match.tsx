"use client";
import {providerNames,useAccount} from '@/components/studio-account';
import {plainProviderText} from '@/lib/provider-words';
import {useId} from 'react';
import {Switch} from '@/components/ds/field';
import {INSPIRATION_MATCH_PROMPT,NANO_BANANA_REFERENCE_LOCK_PROMPT,type ReferenceMode} from '@/lib/studio';
// Match the inspiration exactly: a design-system switch (it takes effect at
// once), what it does in one line, and the fixed prompt behind it. Provider
// names only for staff and companies with their own keys (F-050). Styles:
// app/inputs.css (.editor-match-*).
export function InspirationMatch({value,onChange,disabled=false,nanoBanana=false,refining=false}:{value:ReferenceMode;onChange:(mode:ReferenceMode)=>void;disabled?:boolean;nanoBanana?:boolean;refining?:boolean}){
 const showNames=providerNames(useAccount());const w=(text:string)=>showNames?text:plainProviderText(text);
 const id=useId(),active=value==='match-inspiration';
 return <div className="editor-match">
  <Switch label={refining?'Use inspiration for this edit':nanoBanana?w('Nano Banana reference lock'):'Match inspiration exactly'} checked={active} disabled={disabled} aria-describedby={id} onChange={()=>onChange(active?'creative':'match-inspiration')}/>
  <p className="ds-help" id={id}>{refining?'The displayed image is always the base. Earlier edits stay intact; inspiration guides only the new change.':nanoBanana?(active?w('Keeps the inspiration’s scene, camera, lens, lighting and mood. Replaces its car with your configurator car using a dedicated Nano Banana prompt.'):w('Turn on for Nano Banana Pro or 2.1 to closely match your inspiration while preserving your car’s design, color and trim.')):(active?'Your car. The reference’s shot. Locks camera angle, lens distortion, framing, lighting, mood and setting.':'Turn on to follow the inspiration’s full shot, using your configurator car’s design, color and trim.')}</p>
  {active&&!refining&&<><p className="ds-help">Capture a similar car angle for better accuracy. AI can still vary details. Turn off to freely change the shot.</p><details className="editor-match-details"><summary>{nanoBanana?w('View Nano Banana prompt'):'View the fixed prompt'}</summary><pre className="editor-match-prompt">{nanoBanana?NANO_BANANA_REFERENCE_LOCK_PROMPT:INSPIRATION_MATCH_PROMPT}</pre></details></>}
 </div>;
}
