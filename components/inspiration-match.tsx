"use client";
import {useId} from 'react';
import {Focus,Check} from 'lucide-react';
import {INSPIRATION_MATCH_PROMPT,NANO_BANANA_REFERENCE_LOCK_PROMPT,type ReferenceMode} from '@/lib/studio';
export function InspirationMatch({value,onChange,disabled=false,nanoBanana=false,refining=false}:{value:ReferenceMode;onChange:(mode:ReferenceMode)=>void;disabled?:boolean;nanoBanana?:boolean;refining?:boolean}){
 const id=useId(),active=value==='match-inspiration';
 return <div className={'inspiration-match '+(active?'active':'')}>
  <button type="button" className="inspiration-match-button" aria-pressed={active} aria-describedby={id} disabled={disabled} onClick={()=>onChange(active?'creative':'match-inspiration')}>
   <Focus size={20} aria-hidden="true"/><span>{refining?'Use inspiration for this edit':nanoBanana?'Nano Banana reference lock':'Match inspiration exactly'}</span><span className="match-state" aria-hidden="true">{active?<><Check size={14}/>On</>:'Off'}</span>
  </button>
  <p id={id}>{refining?'The displayed image is always the base. Earlier edits stay intact; inspiration guides only the new change.':nanoBanana?(active?'Keeps the inspiration’s scene, camera, lens, lighting and mood. Replaces its car with your configurator car using a dedicated Nano Banana prompt.':'Turn on for Nano Banana Pro or 2.1 to closely match your inspiration while preserving your car’s design, color and trim.'):(active?'Your car. The reference’s shot. Locks camera angle, lens distortion, framing, lighting, mood and setting.':'Turn on to follow the inspiration’s full shot, using your configurator car’s design, color and trim.')}</p>
  {active&&!refining&&<><p className="match-hint">Capture a similar car angle for better accuracy. AI can still vary details. Turn off to freely change the shot.</p><details><summary>{nanoBanana?'View Nano Banana prompt':'View the fixed prompt'}</summary><pre>{nanoBanana?NANO_BANANA_REFERENCE_LOCK_PROMPT:INSPIRATION_MATCH_PROMPT}</pre></details></>}
 </div>;
}
