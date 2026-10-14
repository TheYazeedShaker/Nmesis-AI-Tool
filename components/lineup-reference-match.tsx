'use client';
import {useId} from 'react';
import {Focus,Check} from 'lucide-react';
import {STRICT_LINEUP_REFERENCE_PROMPT} from '@/lib/lineup';
export function LineupReferenceMatch({active,onChange,disabled=false,refining=false}:{active:boolean;onChange:(active:boolean)=>void;disabled?:boolean;refining?:boolean}){
 const id=useId();
 return <div className={'inspiration-match '+(active?'active':'')}><button type="button" className="inspiration-match-button" aria-pressed={active} aria-describedby={id} disabled={disabled} onClick={()=>onChange(!active)}><Focus size={20}/><span>{refining?'Use inspiration for this edit':'Match reference exactly'}</span><span className="match-state">{active?<><Check size={14}/>On</>:'Off'}</span></button><p id={id}>{refining?'The displayed lineup is the base. Preserve previous edits; use inspiration only for the requested change.':active?'Your cars. The reference’s shot. Locks camera, lens distortion, framing, lighting, mood and surroundings. Reference staging overrides car angles, hero placement and conflicting prompt text.':'Turn on to use the inspiration as the full shot blueprint, replacing its cars with yours.'}</p>{active&&!refining&&<><p className="match-hint">For the closest match, use the same number of cars as the reference. Car order maps left to right. AI can still vary details.</p><details><summary>View the fixed prompt</summary><pre>{STRICT_LINEUP_REFERENCE_PROMPT}</pre></details></>}</div>;
}
