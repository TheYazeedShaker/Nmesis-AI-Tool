'use client';
import * as React from 'react';
import {UserPlus,UserMinus} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {useConfirm} from '@/components/ds/dialog';
import {Badge} from '@/components/ds/feedback';
import {Field,Input,Select} from '@/components/ds/field';
import {Fold,Section} from '@/components/ds/layout';
import {initialsOf} from '@/lib/accounts/names';
import {dateTime,plural} from '@/lib/ds/words';
import type {TeamChange,TeamPage} from '@/lib/accounts/team';
import type {Role} from '@/lib/accounts/plan';
import {AskNmesisButton} from './ask-nmesis';
import {api} from './api';

// Company settings → Team. Everyone reads; the company's own owners invite,
// change roles and remove. Until the owner's setup step is done the list
// still shows and the controls say why they are off.
const ROLES:{value:Role;label:string}[]=[{value:'owner',label:'Owner'},{value:'creator',label:'Creator'},{value:'viewer',label:'Viewer'}];
const roleWord=(r:Role|null)=>ROLES.find(x=>x.value===r)?.label||'';
function changeWords(c:TeamChange){
 const who=c.actorEmail||'An owner';
 if(c.action==='invite')return `${who} invited ${c.email} as ${roleWord(c.roleAfter).toLowerCase()}`;
 if(c.action==='remove')return `${who} removed ${c.email}`;
 return `${who} made ${c.email} ${roleWord(c.roleAfter).toLowerCase()} (was ${roleWord(c.roleBefore).toLowerCase()})`;
}
type Said={text:string;bad:boolean}|null;

export function TeamSection({team,owner,onTeam}:{team:TeamPage;/** The person is one of the company's own owners (controls are shown, maybe disabled). */owner:boolean;onTeam:(t:TeamPage)=>void}){
 const ask=useConfirm();
 const [email,setEmail]=React.useState(''),[role,setRole]=React.useState<Role>('creator'),[busy,setBusy]=React.useState(''),[said,setSaid]=React.useState<Said>(null);
 const reasonId=React.useId().replace(/[^a-zA-Z0-9]/g,'')+'-why';
 const full=team.seats.limit!==null&&team.seats.taken>=team.seats.limit;
 const off=!team.canEdit||!!busy;
 async function run(key:string,call:()=>Promise<{said:string;team:TeamPage}>){
  setBusy(key);setSaid(null);
  try{const r=await call();onTeam(r.team);setSaid({text:r.said,bad:false});return true}
  catch(e){setSaid({text:e instanceof Error?e.message:'That change couldn’t be made.',bad:true});return false}
  finally{setBusy('')}
 }
 async function invite(e:React.FormEvent){
  e.preventDefault();
  if(await run('invite',()=>api('/api/company/team','POST',{email:email.trim(),role})))setEmail('');
 }
 async function remove(userId:string,who:string){
  if(!await ask({title:`Remove ${who}?`,body:<p>They can no longer open your company’s Studio. Their work stays in the library. You can invite them again later.</p>,verb:'Remove',danger:true}))return;
  await run('remove:'+userId,()=>api(`/api/company/team/${encodeURIComponent(userId)}`,'DELETE'));
 }
 const seats=team.seats.limit!==null?`${team.seats.taken} of ${plural(team.seats.limit,'seat')} taken`:plural(team.seats.taken,'person','people');
 return <Section title="Team" count={seats}>
  {team.blocked&&<p className="settings-line" id={reasonId}>{team.blocked}</p>}
  <ul className="team-list" aria-label="People in your company">
   {team.people.map(p=><li key={p.userId} className="team-row">
    <span className="team-who"><span className="ds-avatar" aria-hidden="true">{initialsOf(p.email.split('@')[0].replace(/[._+-]+/g,' '))}</span>
     <span className="team-name"><span className="settings-email">{p.email}{p.you&&<span className="settings-you"> (you)</span>}</span>
      {p.status==='invited'&&<span className="settings-line">Invited, not signed in yet</span>}</span></span>
    <span className="team-controls">
     {owner?<>
      <Select aria-label={`Role of ${p.email}`} value={p.role} disabled={off} aria-describedby={team.blocked?reasonId:undefined}
       onChange={e=>{const next=e.target.value as Role;void run('role:'+p.userId,()=>api(`/api/company/team/${encodeURIComponent(p.userId)}`,'PATCH',{role:next}))}}>
       {ROLES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
      </Select>
      <Button kind="danger-quiet" size="sm" icon={<UserMinus aria-hidden="true"/>} disabled={off} busy={busy==='remove:'+p.userId} aria-describedby={team.blocked?reasonId:undefined} onClick={()=>void remove(p.userId,p.email)}>Remove<span className="ds-sr-only"> {p.email}</span></Button>
     </>:<Badge kind={p.role==='owner'?'accent':'quiet'}>{roleWord(p.role)}</Badge>}
    </span>
   </li>)}
  </ul>
  {team.others>0&&<p className="settings-line">And {plural(team.others,'more person','more people')}. Your company’s owners see the whole team.</p>}
  {owner&&<form className="team-invite" onSubmit={e=>void invite(e)} aria-label="Invite someone">
   <Field label="Invite by email">
    <Input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="off" maxLength={254} placeholder="name@example.com" disabled={off||full}/>
   </Field>
   <Field label="Role"><Select value={role} onChange={e=>setRole(e.target.value as Role)} disabled={off||full}>{ROLES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}</Select></Field>
   <Button kind="primary" type="submit" icon={<UserPlus aria-hidden="true"/>} busy={busy==='invite'} disabled={off||full||!email.trim()}>Invite</Button>
  </form>}
  {owner&&<p className="settings-line">{full?'Every seat on your plan is taken.':'They get an email to choose a password, or see your company the next time they sign in.'}</p>}
  {owner&&team.seats.limit!==null&&<AskNmesisButton topic="seats" kind={full?'primary':'secondary'}>Ask Nmesis for more seats</AskNmesisButton>}
  <p className="settings-status" role="status" data-kind={said?.bad?'bad':undefined}>{said?.text}</p>
  {team.log.length>0&&<Fold name="team-log" title="Changes" summary={plural(team.log.length,'change')}>
   <ul className="team-log">{team.log.map((c,i)=><li key={c.at+i}><span>{changeWords(c)}</span> · <time dateTime={c.at}>{dateTime(c.at)}</time></li>)}</ul>
  </Fold>}
 </Section>;
}
