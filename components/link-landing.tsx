'use client';
import {useEffect,useState} from 'react';
import {LoaderCircle} from 'lucide-react';
import "@/app/auth.css";
// Invitations sent by the Nmesis admin come back with the session after the #,
// where no server can see it. This hands it to /api/auth/session once (the server
// verifies it with Supabase and decides the next step), then wipes it from the
// address bar. A refused or expired link goes to sign in with a plain sentence.
export function LinkLanding(){
 const [working,setWorking]=useState(false);
 useEffect(()=>{
  const hash=location.hash.slice(1);if(!hash||!/(^|&)(access_token|error_code|error)=/.test(hash))return;
  const p=new URLSearchParams(hash);history.replaceState(null,'',location.pathname+location.search);
  if(!p.get('access_token')){location.replace('/signin?problem='+(p.get('error_code')==='otp_expired'?'link_invalid':'unknown'));return}
  // eslint-disable-next-line react-hooks/set-state-in-effect -- shows progress for a one-off hand-over
  setWorking(true);
  const next=new URLSearchParams(location.search).get('next')||(location.pathname.startsWith('/signin')||location.pathname.startsWith('/auth/')?'/':location.pathname);
  void fetch('/api/auth/session',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({accessToken:p.get('access_token'),refreshToken:p.get('refresh_token'),type:p.get('type'),next})})
   .then(async r=>{const d=await r.json().catch(()=>({}));location.replace(r.ok&&typeof d.next==='string'?d.next:'/signin?problem='+(typeof d.problem==='string'?d.problem:'unknown'))})
   .catch(()=>location.replace('/signin?problem=unreachable'));
 },[]);
 return working?<div className="auth-overlay" role="status"><span><LoaderCircle className="spin" size={18}/>Signing you in…</span></div>:null;
}
