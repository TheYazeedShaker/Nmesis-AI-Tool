'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {Aperture,LifeBuoy,ShieldCheck} from 'lucide-react';
import {AccountBar,AccountNotices,useAccount} from '@/components/studio-account';
import type {SupportState} from '@/lib/support-access';
// Company settings: "Allow Nmesis support access" (owners). Off by default; on for
// 7 days at a time, renewable, with an optional note for Nmesis. Every opening by
// Nmesis is listed here.
const when=(iso:string)=>{const t=Date.parse(iso);return Number.isFinite(t)?new Date(t).toLocaleString():''};
export default function Company(){
 const account=useAccount();
 const [state,setState]=useState<SupportState|null>(null),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{let live=true;fetch('/api/company/support',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Company settings could not be loaded.');if(live){setState(d as SupportState);setNote((d as SupportState).grant?.note||'')}}).catch(e=>{if(live)setError((e as Error).message)});return()=>{live=false}},[]);
 async function change(on:boolean){
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{const r=await fetch('/api/company/support',{method:on?'POST':'DELETE',headers:{'Content-Type':'application/json'},...on?{body:JSON.stringify({note})}:{}});const d=await r.json();if(!r.ok)throw new Error(d.error||'Support access could not be changed.');setState(d as SupportState);setNotice(on?'Nmesis support access is on for 7 days.':'Nmesis support access is off.')}
  catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 const owner=!!account&&account.role==='owner'&&!account.viewingAs;
 return <>
  <header className="topbar"><Link href="/" className="brand"><Aperture/><span>NMESIS <b>STUDIO</b></span></Link><AccountBar/></header><AccountNotices/>
  <main className="account-page">
   <div><p className="eyebrow">COMPANY SETTINGS</p><h1>{account?.org.name||'Your company'}</h1></div>
   {error&&<p className="field-error" role="alert">{error}</p>}
   {state?.internal?<section><p className="helper">This is Nmesis’s own workspace. It needs no support access.</p></section>:state&&<>
    <section aria-labelledby="support-title">
     <h2 id="support-title"><LifeBuoy size={18} aria-hidden="true"/> Allow Nmesis support access</h2>
     <p className="helper">When this is on, Nmesis staff can open your company’s workspace to help you, read-only: they can look, not create, change or delete anything. It turns itself off after 7 days; you can renew it or turn it off at any time. Every time Nmesis opens your workspace it is listed below.</p>
     <div className="support-toggle">
      <span className={'support-state'+(state.active?' on':'')}><ShieldCheck size={15} aria-hidden="true"/>{state.active&&state.grant?`On until ${when(state.grant.until)}`:'Off'}</span>
     </div>
     {owner?<>
      <label className="field-label" htmlFor="support-note">Note for Nmesis (optional)</label>
      <input id="support-note" className="text-input" value={note} maxLength={300} onChange={e=>setNote(e.target.value)} placeholder="What should Nmesis look at?" disabled={busy}/>
      <div className="support-toggle">
       <button className="generate" disabled={busy} onClick={()=>void change(true)}>{state.active?'Renew for 7 days':'Turn on for 7 days'}</button>
       {state.active&&<button className="secondary" disabled={busy} onClick={()=>void change(false)}>Turn off now</button>}
      </div>
     </>:<p className="helper">{account?.viewingAs?'You are viewing this company with its support access.':'Your company’s owners manage this setting.'}{state.grant?.note?` Note: “${state.grant.note}”`:''}</p>}
     {notice&&<p className="key-notice" role="status">{notice}</p>}
    </section>
    <section aria-labelledby="support-log">
     <h2 id="support-log">When Nmesis opened your workspace</h2>
     {state.log.length?<table className="usage-table"><thead><tr><th>When</th><th>Page</th></tr></thead><tbody>{state.log.map((l,i)=><tr key={l.at+i}><td>Nmesis opened your workspace at {when(l.at)}</td><td>{l.page}</td></tr>)}</tbody></table>:<p className="helper">Nmesis has not opened your workspace.</p>}
    </section>
   </>}
   {!state&&!error&&<p className="helper">Loading…</p>}
  </main>
 </>;
}
