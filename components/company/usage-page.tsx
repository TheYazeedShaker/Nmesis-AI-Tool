'use client';
import * as React from 'react';
import {Button} from '@/components/ds/button';
import {SkeletonPanel,State,Loading} from '@/components/ds/feedback';
import {PageHeader,Section} from '@/components/ds/layout';
import {DataTable} from '@/components/workspace/table';
import {count,credits,dateTime,dayDate,plural,shortDay} from '@/lib/ds/words';
import type {UsagePage} from '@/lib/credits/usage';
import {AskNmesisButton} from './ask-nmesis';

// Usage (design finish pass), for a company's owners and Nmesis staff with
// support access: the credit meter with its 80% and 100% marks, the use over
// the period, by person and by tool, the last 50 actions and the packs.
// Credits only: the server never sends a provider or a cost here. The
// company's legal name belongs on this page.

function Gauge({meter}:{meter:NonNullable<UsagePage['meter']>}){
 const capacity=meter.used+meter.left,share=capacity>0?Math.min(1,meter.used/capacity):1;
 const label=`${credits(meter.used)} used and ${credits(meter.left)} left this period (${meter.percent}%).`;
 return <div className="usage-gauge" data-level={meter.level||undefined}>
  <div className="usage-figures">
   <p className="usage-figure"><b>{count(meter.used)}</b><span>credits used</span></p>
   <p className="usage-figure"><b>{count(meter.left)}</b><span>credits left{meter.held?` (${count(meter.held)} held for work in progress)`:''}</span></p>
   <p className="usage-figure"><b>{meter.percent}%</b><span>of this period’s credits</span></p>
  </div>
  <div className="usage-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={meter.percent} aria-valuetext={label} aria-label="Credits used this period">
   <span className="usage-fill" style={{transform:`scaleX(${share})`}}/>
   <span className="usage-mark" style={{left:'80%'}} aria-hidden="true"/>
   <span className="usage-mark" style={{right:0}} aria-hidden="true"/>
  </div>
  <div className="usage-marks" aria-hidden="true"><span style={{left:'80%'}}>80%</span><span style={{left:'100%'}}>100%</span></div>
  <p className="settings-line">At 80% the people chosen in Company settings get an email; at 100% new paid work pauses.</p>
  <p className="settings-line">{meter.periodFrom&&meter.periodTo?`This period runs from ${dayDate(meter.periodFrom)} to ${dayDate(meter.periodTo)}. `:''}{meter.resetsOn?`The allowance resets on ${dayDate(meter.resetsOn)}. `:''}The monthly allowance is used first, then packs.</p>
  {meter.level===100?<p className="settings-line">New paid work is paused until the allowance resets or Nmesis adds a pack.</p>:meter.level===80?<p className="settings-line">80% is used. If you expect to need more this period, ask Nmesis for a pack.</p>:null}
 </div>;
}

// Use over the period: one bar per day (per month for a long period), drawn
// in the design system's colours, with the same numbers written out.
function OverTime({over}:{over:UsagePage['over']}){
 const id=React.useId().replace(/[^a-zA-Z0-9]/g,'');
 const b=over.buckets,max=Math.max(1,...b.map(x=>x.credits)),total=b.reduce((s,x)=>s+x.credits,0);
 if(!b.length)return <p className="settings-line">Nothing to show for this period yet.</p>;
 const top=b.reduce((m,x)=>x.credits>m.credits?x:m,b[0]);
 const word=(day:string)=>over.unit==='month'?dayDate(day).split(' ').slice(1).join(' '):shortDay(day);
 const summary=total?`${credits(total)} used from ${word(b[0].day)} to ${word(b[b.length-1].day)}. The most in one ${over.unit} was ${credits(top.credits)}, on ${word(top.day)}.`:`No credits used from ${word(b[0].day)} to ${word(b[b.length-1].day)}.`;
 const W=10,H=100,gap=2;
 return <figure className="usage-chart">
  <svg viewBox={`0 0 ${b.length*W} ${H}`} preserveAspectRatio="none" role="img" aria-labelledby={`${id}-t ${id}-d`}>
   <title id={`${id}-t`}>Credits used per {over.unit}</title>
   <desc id={`${id}-d`}>{summary}</desc>
   {b.map((x,i)=>{const h=x.credits?Math.max(2,(x.credits/max)*H):2;return <rect key={x.day} className={x.credits?'usage-bar':'usage-bar-empty'} x={i*W+gap/2} y={H-h} width={W-gap} height={h}><title>{`${word(x.day)}: ${credits(x.credits)}`}</title></rect>})}
  </svg>
  <div className="usage-axis" aria-hidden="true"><span>{word(b[0].day)}</span>{b.length>2&&<span>{word(b[Math.floor(b.length/2)].day)}</span>}<span>{word(b[b.length-1].day)}</span></div>
  <figcaption>{summary}</figcaption>
 </figure>;
}

const empty=<p className="settings-line">No credits used this period yet.</p>;
function Splits({data}:{data:UsagePage}){
 return <div className="settings-split">
  <Section title="By person" count={data.byPerson.length?plural(data.byPerson.length,'person','people'):undefined}>
   {data.byPerson.length?<DataTable caption="Credits used this period, by person" columns={[{key:'who',label:'Person'},{key:'actions',label:'Actions',numeric:true},{key:'credits',label:'Credits',numeric:true}]}
    rows={data.byPerson.map(p=>({key:p.who,cells:{who:<span className="settings-email">{p.who}</span>,actions:count(p.actions),credits:count(p.credits)}}))}/>:empty}
  </Section>
  <Section title="By tool" count={data.byTool.length?plural(data.byTool.length,'tool'):undefined}>
   {data.byTool.length?<DataTable caption="Credits used this period, by tool" columns={[{key:'tool',label:'Tool'},{key:'actions',label:'Actions',numeric:true},{key:'credits',label:'Credits',numeric:true}]}
    rows={data.byTool.map(t=>({key:t.tool,cells:{tool:t.tool,actions:count(t.actions),credits:count(t.credits)}}))}/>:empty}
  </Section>
 </div>;
}

export function UsageScreen({data,onRetry,problem}:{data:UsagePage|null;problem?:string;onRetry?:()=>void}){
 const m=data?.meter;
 return <div className="settings-page">
  <PageHeader title="Usage" lede={data?`${data.company}’s credits: what was used this period, by whom and on what.`:'Your company’s credits: what was used this period, by whom and on what.'}/>
  {problem&&!data?<State kind="error" title="Usage didn’t load" actions={onRetry&&<Button onClick={onRetry}>Try again</Button>}>{problem}</State>
   :!data?<Loading label="Loading usage" className="ds-stack"><SkeletonPanel/><SkeletonPanel/></Loading>
   :<>
    <Section title="This period">
     {data.unlimited||!m?<p className="settings-line">This is Nmesis’s own workspace: its actions are recorded and never limited.</p>:<Gauge meter={m}/>}
    </Section>
    <Section title={data.over.unit==='month'?'Use by month':'Use by day'}><OverTime over={data.over}/></Section>
    <Splits data={data}/>
    <Section title="Last 50 actions" count={data.recent.length?plural(data.recent.length,'action'):undefined}>
     {data.recent.length?<DataTable caption="The last 50 actions with their credits" columns={[{key:'what',label:'What'},{key:'when',label:'When'},{key:'who',label:'Who'},{key:'credits',label:'Credits',numeric:true}]}
      rows={data.recent.map((r,i)=>({key:r.at+i,cells:{what:<>{r.action}{r.action!==r.tool?<span className="settings-you"> · {r.tool}</span>:null}</>,when:<time dateTime={r.at}>{dateTime(r.at)}</time>,who:<span className="settings-email">{r.who}</span>,credits:r.ownKey?'0 · own key':count(r.credits)}}))}/>
      :<p className="settings-line">Nothing yet. Every paid action shows here with its credits.</p>}
    </Section>
    <Section title="Packs" count={data.packs.length?plural(data.packs.length,'pack'):undefined}>
     {data.packs.length?<DataTable caption="Credit packs, when they were bought and when they expire" columns={[{key:'expires',label:'Expires'},{key:'bought',label:'Bought'},{key:'credits',label:'Credits',numeric:true},{key:'left',label:'Left',numeric:true}]}
      rows={data.packs.map((p,i)=>({key:String(i),cells:{expires:<>{dayDate(p.expiresOn)||'No date'}{p.expired?<span className="settings-you"> · expired</span>:null}</>,bought:dayDate(p.boughtOn)||'No date',credits:count(p.credits),left:p.expired?'0':count(p.left)}}))}/>
      :<p className="settings-line">No packs. Packs are used after the monthly allowance and expire on their own date.</p>}
     {data.canAsk?<AskNmesisButton topic="pack">Ask Nmesis for a pack</AskNmesisButton>:!data.unlimited&&<p className="settings-line">Your company’s owners can ask Nmesis for a pack.</p>}
    </Section>
   </>}
 </div>;
}

// The page's data, inside the frame app/usage/page.tsx draws.
export function UsagePageView(){
 const [data,setData]=React.useState<UsagePage|null>(null),[problem,setProblem]=React.useState(''),[attempt,setAttempt]=React.useState(0);
 React.useEffect(()=>{
  let live=true;
  fetch('/api/usage',{cache:'no-store',signal:AbortSignal.timeout(30_000)}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error((d as {error?:string}).error||'Usage could not be loaded.');if(live)setData(d as UsagePage)})
   .catch(e=>{if(live)setProblem(e instanceof Error&&e.name==='TimeoutError'?'Loading usage took too long.':e instanceof Error?e.message:'Usage could not be loaded.')});
  return()=>{live=false};
 },[attempt]);
 return <UsageScreen data={data} problem={problem} onRetry={()=>{setProblem('');setAttempt(a=>a+1)}}/>;
}
