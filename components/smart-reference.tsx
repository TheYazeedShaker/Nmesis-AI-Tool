'use client';
import * as React from 'react';
import {Radio,RadioGroup,Switch} from '@/components/ds/field';
import {SMART_OPTIONS,smartCamera,type SmartPriority,type SmartPlan,type SmartReview} from '@/lib/smart-reference';
import {CreditCost} from '@/components/credits';
// Key visual → Smart reference prompt: a design-system card with a title, one
// line of help and a switch; the three priorities appear once it is on.
export function SmartControls({value,onChange,disabled=false}:{value:SmartPriority|null;onChange:(v:SmartPriority|null)=>void;disabled?:boolean}){
 const id=React.useId(),name=id+"-priority";
 return <section className="ds-setting" aria-labelledby={id+"-title"}>
  <div className="ds-setting-head">
   <div className="ds-setting-text"><span className="ds-setting-title" id={id+"-title"}>Smart reference prompt</span><span className="ds-help" id={id+"-help"}>The Studio studies your pictures and writes the directions for you.</span></div>
   <Switch label={<span className="ds-sr-only">Smart reference prompt</span>} checked={!!value} disabled={disabled} aria-describedby={id+"-help"} onChange={e=>onChange(e.target.checked?"balanced":null)}/>
  </div>
  {value&&<><RadioGroup legend="What matters most">{SMART_OPTIONS.map(o=><Radio key={o.id} name={name} value={o.id} checked={value===o.id} disabled={disabled} onChange={()=>onChange(o.id)} label={o.label} help={o.description}/>)}</RadioGroup>
   <p className="ds-help">Planning and the detail check each cost <CreditCost cost="openai.text" provider="openai"/>, plus the picture. An unchanged plan is reused at no cost.</p></>}
 </section>;
}
export function SmartPlanView({plan}:{plan:SmartPlan}){return <section className="smart-plan"><h3>Your tailored prompt is ready</h3><p><strong>Camera priority:</strong> {smartCamera(plan.priority,plan.viewCompatibility)==='car'?'Configurator viewpoint':'Inspiration viewpoint'} · {SMART_OPTIONS.find(o=>o.id===plan.priority)?.label}</p><p><strong>Capture advice:</strong> {plan.captureAdvice}</p>{plan.conflicts.length>0&&<details open><summary>Reference conflicts to review</summary><ul>{plan.conflicts.map((s,i)=><li key={i}>{s}</li>)}</ul></details>}<details><summary>Car identity checklist</summary><ul>{plan.carDetails.map((s,i)=><li key={i}>{s}</li>)}</ul></details><details><summary>Inspiration checklist</summary><ul>{plan.sceneDetails.map((s,i)=><li key={i}>{s}</li>)}</ul></details>{plan.detailRegions.length>0&&<p className="helper">Extra source crops: {plan.detailRegions.map(r=>r.label).join(' · ')}</p>}<details><summary>Preview tailored prompt</summary><pre>{plan.prompt}</pre></details><p className="helper">AI observations can be wrong. Crops guide the generator; they do not lock original pixels.</p></section>}
export function SmartReviewView({review}:{review?:SmartReview}){if(!review)return null;return <section className="smart-review"><h4>Reference check</h4>{review.status==='failed'?<p>{review.error} Your generated image is saved.</p>:<><p>{review.verdict==='no-obvious-mismatch'?'No obvious mismatch reported':review.verdict==='needs-review'?'Visible differences need review':'Some details could not be verified'}</p><ul>{[...review.carFindings||[],...review.sceneFindings||[]].map((s,i)=><li key={i}>{s}</li>)}</ul>{review.suggestedFix&&<details><summary>Suggested correction</summary><p>{review.suggestedFix}</p></details>}<small>This AI check is advisory. Compare the original references before approval.</small></>}</section>}
