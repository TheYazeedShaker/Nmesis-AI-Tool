'use client';
import * as React from 'react';
import {LifeBuoy,ShieldCheck} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {Badge} from '@/components/ds/feedback';
import {Field,Input} from '@/components/ds/field';
import {Section} from '@/components/ds/layout';
import {dateTime,plural} from '@/lib/ds/words';
import type {SupportState} from '@/lib/support-access';
import {DataTable} from '@/components/workspace/table';
import {api} from './api';

// Company settings → Nmesis support access. Off by default; an owner turns it
// on for 7 days at a time (renewable) with an optional note. While it is on,
// Nmesis staff can open the workspace read-only; every opening is listed, with
// the page they opened.
export function SupportSection({state,onState}:{state:SupportState;onState:(s:SupportState)=>void}){
 const [note,setNote]=React.useState(state.grant?.note||''),[busy,setBusy]=React.useState(false),[said,setSaid]=React.useState<{text:string;bad:boolean}|null>(null);
 async function change(on:boolean){
  setBusy(true);setSaid(null);
  try{onState(await api<SupportState>('/api/company/support',on?'POST':'DELETE',on?{note}:undefined));setSaid({text:on?'Nmesis support access is on for 7 days.':'Nmesis support access is off.',bad:false})}
  catch(e){setSaid({text:e instanceof Error?e.message:'Support access could not be changed.',bad:true})}
  finally{setBusy(false)}
 }
 return <Section title="Nmesis support access">
  <div className="support-line">
   <Badge kind={state.active?'ok':'quiet'} icon={state.active?<ShieldCheck aria-hidden="true"/>:<LifeBuoy aria-hidden="true"/>}>{state.active&&state.grant?`On until ${dateTime(state.grant.until)}`:'Off'}</Badge>
  </div>
  <p className="settings-line">When this is on, Nmesis staff can open your company’s workspace to help you, read-only: they can look, not create, change or delete anything. It turns itself off after 7 days; you can renew it or turn it off at any time.</p>
  {state.canEdit?<>
   <div className="settings-field"><Field label="Note for Nmesis (optional)" count={{value:note.length,max:300}}>
    <Input value={note} maxLength={300} onChange={e=>setNote(e.target.value)} placeholder="What should Nmesis look at?" disabled={busy}/>
   </Field></div>
   <div className="settings-actions">
    <Button kind="primary" busy={busy} onClick={()=>void change(true)}>{state.active?'Renew for 7 days':'Turn on for 7 days'}</Button>
    {state.active&&<Button disabled={busy} onClick={()=>void change(false)}>Turn off now</Button>}
   </div>
  </>:<p className="settings-line">Your company’s owners manage this.{state.grant?.note?` Their note: “${state.grant.note}”`:''}</p>}
  <p className="settings-status" role="status" data-kind={said?.bad?'bad':undefined}>{said?.text}</p>
  <h3 className="ds-label settings-sub">When Nmesis opened your workspace{state.log.length?` (${plural(state.log.length,'time')})`:''}</h3>
  {state.log.length?<DataTable caption="When Nmesis opened your workspace, and which page" columns={[{key:'page',label:'Page'},{key:'when',label:'When'}]}
   rows={state.log.map((l,i)=>({key:l.at+i,cells:{page:l.page,when:<time dateTime={l.at}>{dateTime(l.at)}</time>}}))}/>
   :<p className="settings-line">Nmesis has not opened your workspace.</p>}
 </Section>;
}
