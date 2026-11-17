'use client';
import * as React from 'react';
import {MessageSquare} from 'lucide-react';
import {Button} from '@/components/ds/button';

// "Ask Nmesis for more seats / a pack / a plan change": one short email to
// Nmesis from the company's owner (app/api/company/ask). The answer is said in
// place, next to the button.
export function AskNmesisButton({topic,children,disabled,kind='secondary'}:{topic:'seats'|'pack'|'plan';children:React.ReactNode;disabled?:boolean;kind?:'primary'|'secondary'|'quiet'}){
 const [busy,setBusy]=React.useState(false),[said,setSaid]=React.useState<{text:string;bad:boolean}|null>(null);
 async function ask(){
  setBusy(true);setSaid(null);
  try{
   const r=await fetch('/api/company/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topic}),signal:AbortSignal.timeout(20_000)});
   const d=await r.json().catch(()=>({})) as {said?:string;error?:string};
   setSaid(r.ok?{text:d.said||'Nmesis has been asked.',bad:false}:{text:d.error||'Nmesis couldn’t be asked. Try again.',bad:true});
  }catch(e){setSaid({text:e instanceof Error&&e.name==='TimeoutError'?'That took too long. Try again.':'The connection was interrupted. Try again.',bad:true})}
  finally{setBusy(false)}
 }
 return <span className="settings-actions">
  <Button kind={kind} icon={<MessageSquare aria-hidden="true"/>} busy={busy} disabled={disabled} onClick={()=>void ask()}>{children}</Button>
  <span className="settings-status" role="status" data-kind={said?.bad?'bad':undefined}>{said?.text}</span>
 </span>;
}
