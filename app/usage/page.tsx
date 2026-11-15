'use client';
import {StudioTopBar} from '@/components/studio-topbar';
import {useEffect,useState} from 'react';
import {AccountNotices} from '@/components/studio-account';
import {creditsLabel} from '@/lib/credits/words';
import type {UsagePage} from '@/lib/credits/usage';
// Usage, for a company's owners (and Nmesis staff with support access): credits
// used and left this period, by person and by tool, the last 50 actions, packs.
// Credits only; the server never sends a provider or a provider cost here.
const when=(iso:string)=>{const t=Date.parse(iso);return Number.isFinite(t)?new Date(t).toLocaleString():''};
export default function Usage(){
 const [data,setData]=useState<UsagePage|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;fetch('/api/usage',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||'Usage could not be loaded.');if(live)setData(d as UsagePage)}).catch(e=>{if(live)setError((e as Error).message)});return()=>{live=false}},[]);
 const m=data?.meter;
 return <>
  <StudioTopBar current="usage"/><AccountNotices/>
  <main className="account-page">
   <div><p className="eyebrow">USAGE</p><h1>{data?.company||'Your company'}’s credits</h1></div>
   {error&&<p className="field-error" role="alert">{error}</p>}
   {!data&&!error&&<p className="helper">Loading usage…</p>}
   {data&&<>
    <section aria-labelledby="usage-period">
     <h2 id="usage-period">This month</h2>
     {data.unlimited||!m?<p className="helper">This is Nmesis’s own workspace: its actions are recorded and never limited.</p>:<>
      <div className="usage-totals">
       <div><b>{m.used.toLocaleString('en-US')}</b><span>credits used this period</span></div>
       <div><b>{m.left.toLocaleString('en-US')}</b><span>credits left{m.held?` (${creditsLabel(m.held)} held for actions in progress)`:''}</span></div>
       <div><b>{m.percent}%</b><span>of this period’s credits used</span></div>
       <div><b>{m.resetsOn||'—'}</b><span>allowance resets on</span></div>
      </div>
      <p className="helper">{m.periodFrom&&m.periodTo?`Period ${m.periodFrom} to ${m.periodTo}. `:''}The monthly allowance is used first, then packs. Ask Nmesis to add a pack if you need more.</p>
     </>}
    </section>
    <div className="usage-split">
     <section aria-labelledby="usage-people"><h2 id="usage-people">By person</h2>
      {data.byPerson.length?<table className="usage-table"><thead><tr><th>Person</th><th className="num">Actions</th><th className="num">Credits</th></tr></thead><tbody>{data.byPerson.map(p=><tr key={p.who}><td>{p.who}</td><td className="num">{p.actions}</td><td className="num">{p.credits.toLocaleString('en-US')}</td></tr>)}</tbody></table>:<p className="helper">No credits used this period yet.</p>}
     </section>
     <section aria-labelledby="usage-tools"><h2 id="usage-tools">By tool</h2>
      {data.byTool.length?<table className="usage-table"><thead><tr><th>Tool</th><th className="num">Actions</th><th className="num">Credits</th></tr></thead><tbody>{data.byTool.map(t=><tr key={t.tool}><td>{t.tool}</td><td className="num">{t.actions}</td><td className="num">{t.credits.toLocaleString('en-US')}</td></tr>)}</tbody></table>:<p className="helper">No credits used this period yet.</p>}
     </section>
    </div>
    <section aria-labelledby="usage-recent"><h2 id="usage-recent">Last 50 actions</h2>
     {data.recent.length?<table className="usage-table"><thead><tr><th>When</th><th>What</th><th>Who</th><th className="num">Credits</th></tr></thead><tbody>{data.recent.map((r,i)=><tr key={r.at+i}><td>{when(r.at)}</td><td>{r.action}{r.action!==r.tool?<span className="helper"> · {r.tool}</span>:null}</td><td>{r.who}</td><td className="num">{r.ownKey?'0 · own key':r.credits.toLocaleString('en-US')}</td></tr>)}</tbody></table>:<p className="helper">Nothing yet. Every paid action shows here with its credits.</p>}
    </section>
    <section aria-labelledby="usage-packs"><h2 id="usage-packs">Packs</h2>
     {data.packs.length?<table className="usage-table"><thead><tr><th>Bought</th><th>Expires</th><th className="num">Credits</th><th className="num">Left</th></tr></thead><tbody>{data.packs.map((p,i)=><tr key={i}><td>{p.boughtOn||'—'}</td><td>{p.expiresOn||'—'}{p.expired?' · expired':''}</td><td className="num">{p.credits.toLocaleString('en-US')}</td><td className="num">{p.expired?0:p.left.toLocaleString('en-US')}</td></tr>)}</tbody></table>:<p className="helper">No packs. Nmesis adds packs on request; they are used after the monthly allowance and expire on their own date.</p>}
    </section>
   </>}
  </main>
 </>;
}
