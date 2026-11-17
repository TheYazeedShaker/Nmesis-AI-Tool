'use client';
import * as React from 'react';
import {Button} from '@/components/ds/button';
import {Checkbox} from '@/components/ds/field';
import {Section} from '@/components/ds/layout';
import {plural} from '@/lib/ds/words';
import type {NotificationsState} from '@/lib/company';
import {api} from './api';

// Company settings → Notifications: who gets the email when 80% of the
// period's credits are used, and when they run out. The owners choose among
// the company's people; with no choice, the owners get them.
export function NotificationsSection({state,onState}:{state:NotificationsState;onState:(s:NotificationsState)=>void}){
 const [picked,setPicked]=React.useState<Set<string>>(()=>new Set(state.people.filter(p=>p.chosen).map(p=>p.userId)));
 const [busy,setBusy]=React.useState(false),[said,setSaid]=React.useState<{text:string;bad:boolean}|null>(null);
 const saved=new Set(state.people.filter(p=>p.chosen).map(p=>p.userId));
 const changed=picked.size!==saved.size||[...picked].some(id=>!saved.has(id));
 async function save(){
  setBusy(true);setSaid(null);
  try{const next=await api<NotificationsState>('/api/company/notifications','PUT',{userIds:[...picked]});onState(next);setPicked(new Set(next.people.filter(p=>p.chosen).map(p=>p.userId)));setSaid({text:'Saved. The next credit email goes to the people ticked here.',bad:false})}
  catch(e){setSaid({text:e instanceof Error?e.message:'That couldn’t be saved.',bad:true})}
  finally{setBusy(false)}
 }
 const toggle=(id:string,on:boolean)=>setPicked(s=>{const n=new Set(s);if(on)n.add(id);else n.delete(id);return n});
 return <Section title="Credit emails" count={plural(state.count,'person','people')}>
  <p className="settings-line">One email when 80% of this period’s credits are used, and one when they run out.{state.fallback?' Nobody is chosen yet, so your company’s owners get them.':''}</p>
  {state.people.length?<>
   <fieldset className="settings-choices" disabled={!state.canEdit||busy}>
    <legend className="ds-sr-only">Who gets the credit emails</legend>
    {state.people.map(p=><Checkbox key={p.userId} checked={picked.has(p.userId)} onChange={e=>toggle(p.userId,e.target.checked)}
     label={<span className="settings-email">{p.email}{p.you&&<span className="settings-you"> (you)</span>}</span>} help={p.role==='owner'?'Owner':p.role==='creator'?'Creator':'Viewer'}/>)}
   </fieldset>
   {state.canEdit?<span className="settings-actions"><Button kind="primary" busy={busy} disabled={!changed||!picked.size} onClick={()=>void save()}>Save</Button>{!picked.size&&<span className="settings-line">Choose at least one person.</span>}</span>
    :<p className="settings-line">Only your company’s owners change this.</p>}
  </>:<p className="settings-line">{state.you?'You get these emails. ':'You don’t get these emails. '}Your company’s owners choose who does.</p>}
  <p className="settings-status" role="status" data-kind={said?.bad?'bad':undefined}>{said?.text}</p>
 </Section>;
}
