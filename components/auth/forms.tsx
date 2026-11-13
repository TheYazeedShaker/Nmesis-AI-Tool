'use client';
import {useState} from 'react';
import {Eye,EyeOff,Mail,LoaderCircle,Check,Info,CircleCheck} from 'lucide-react';
import {PASSWORD_MIN,passwordProblem} from '@/lib/auth/words';
// The sign-in screens' forms. They post to the Studio's own /api/auth routes;
// every decision (who you are, which step comes next) is made there.
async function post(url:string,data:Record<string,unknown>){
 try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(data)});const d=await r.json().catch(()=>({}));return {ok:r.ok,...d} as {ok:boolean;error?:string;said?:string;next?:string;signInAgain?:boolean}}
 catch{return {ok:false,error:'The connection was interrupted. Try again.'}}
}
const Problem=({text}:{text:string})=>text?<p className="error-banner" role="alert"><Info size={18}/><span>{text}</span></p>:null;
const Note=({text}:{text:string})=>text?<p className="auth-note" role="status"><CircleCheck size={18}/><span>{text}</span></p>:null;
export function PasswordField({id,label,value,onChange,autoComplete,describedBy}:{id:string;label:string;value:string;onChange:(v:string)=>void;autoComplete:string;describedBy?:string}){
 const [shown,setShown]=useState(false);
 return <div className="auth-field"><label className="field-label" htmlFor={id}>{label}</label><div className="auth-password">
  <input id={id} className="text-input" type={shown?'text':'password'} value={value} onChange={e=>onChange(e.target.value)} autoComplete={autoComplete} maxLength={200} aria-describedby={describedBy} required/>
  <button type="button" className="auth-eye" onClick={()=>setShown(s=>!s)} aria-label={shown?'Hide password':'Show password'} aria-pressed={shown} title={shown?'Hide':'Show'}>{shown?<EyeOff size={18}/>:<Eye size={18}/>}</button>
 </div></div>;
}
export function SignInForm({next,email:initial='',google}:{next:string;email?:string;google:boolean}){
 const [email,setEmail]=useState(initial),[password,setPassword]=useState(''),[busy,setBusy]=useState(''),[problem,setProblem]=useState(''),[note,setNote]=useState('');
 async function withPassword(e:React.FormEvent){e.preventDefault();setBusy('password');setProblem('');setNote('');const d=await post('/api/auth/password',{email,password,next});if(d.ok&&d.next){location.assign(d.next);return}setProblem(d.error||'That did not work. Try again.');setBusy('')}
 async function withLink(){if(!email.trim()){setProblem('Enter your email address first.');return}setBusy('link');setProblem('');setNote('');const d=await post('/api/auth/magic',{email,next});if(d.ok)setNote(d.said||'');else setProblem(d.error||'That did not work. Try again.');setBusy('')}
 return <>
  <Problem text={problem}/><Note text={note}/>
  <form className="auth-form" onSubmit={withPassword}>
   <div className="auth-field"><label className="field-label" htmlFor="email">Email address</label><input id="email" className="text-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" maxLength={254} required/></div>
   <PasswordField id="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password"/>
   <button className="generate" type="submit" disabled={!!busy}>{busy==='password'?<LoaderCircle className="spin" size={18}/>:null}Sign in</button>
   <div className="auth-divider">OR</div>
   <button className="secondary" type="button" onClick={()=>void withLink()} disabled={!!busy}>{busy==='link'?<LoaderCircle className="spin" size={16}/>:<Mail size={16}/>}Email me a sign-in link</button>
   {google&&<a className="secondary" href="/auth/google">Continue with Google</a>}
  </form>
  <div className="auth-links"><a className="text-button" href={'/signin/forgot'+(email?'?email='+encodeURIComponent(email):'')}>Forgot your password?</a></div>
 </>;
}
export function ForgotForm({email:initial=''}:{email?:string}){
 const [email,setEmail]=useState(initial),[busy,setBusy]=useState(false),[problem,setProblem]=useState(''),[note,setNote]=useState('');
 async function send(e:React.FormEvent){e.preventDefault();setBusy(true);setProblem('');setNote('');const d=await post('/api/auth/recover',{email});if(d.ok)setNote(d.said||'');else setProblem(d.error||'That did not work. Try again.');setBusy(false)}
 return <>
  <Problem text={problem}/><Note text={note}/>
  <form className="auth-form" onSubmit={send}>
   <div className="auth-field"><label className="field-label" htmlFor="email">Email address</label><input id="email" className="text-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" maxLength={254} required/></div>
   <button className="generate" type="submit" disabled={busy}>{busy?<LoaderCircle className="spin" size={18}/>:null}Email me a link</button>
  </form>
  <div className="auth-links"><a className="text-button" href="/signin">Back to sign in</a></div>
 </>;
}
export function ChoosePasswordForm({email,next}:{email:string;next:string}){
 const [password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(''),[problem,setProblem]=useState('');
 const rules=[{text:`At least ${PASSWORD_MIN} characters`,met:password.length>=PASSWORD_MIN},{text:'Not your email address',met:!!password&&!passwordProblem(password,password,email).includes('email')},{text:'The same both times',met:!!password&&password===confirm}];
 async function save(e:React.FormEvent){e.preventDefault();const said=passwordProblem(password,confirm,email);if(said){setProblem(said);return}setBusy('save');setProblem('');const d=await post('/api/auth/choose-password',{password,confirm,next});if(d.ok&&d.next){location.assign(d.next);return}setProblem(d.error||'Your password was not saved. Try again.');setBusy('')}
 async function skip(){setBusy('skip');setProblem('');const d=await post('/api/auth/skip-password',{next});if(d.ok&&d.next){location.assign(d.next);return}setProblem(d.error||'That did not work. Try again.');setBusy('')}
 return <>
  <Problem text={problem}/>
  <form className="auth-form" onSubmit={save}>
   <div className="auth-field"><label className="field-label" htmlFor="account">Your account</label><input id="account" className="text-input" type="email" value={email} readOnly autoComplete="username"/></div>
   <PasswordField id="new-password" label="Password" value={password} onChange={setPassword} autoComplete="new-password" describedBy="password-rules"/>
   <PasswordField id="confirm-password" label="The same again" value={confirm} onChange={setConfirm} autoComplete="new-password" describedBy="password-rules"/>
   <ul className="auth-rules" id="password-rules" aria-label="Password rules">{rules.map(r=><li key={r.text} className={r.met?'met':''}>{r.met?<Check size={14}/>:<span aria-hidden="true">·</span>}{r.text}</li>)}</ul>
   <button className="generate" type="submit" disabled={!!busy}>{busy==='save'?<LoaderCircle className="spin" size={18}/>:null}Save and continue</button>
  </form>
  <div className="auth-links"><button type="button" className="text-button" onClick={()=>void skip()} disabled={!!busy}>Skip, I’ll use email links</button></div>
 </>;
}
