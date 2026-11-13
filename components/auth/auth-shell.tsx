import Link from 'next/link';
import {Aperture,Info,CircleCheck} from 'lucide-react';
import '@/app/auth.css';
// The frame every sign-in and account screen shares: the Studio's top bar and
// one card, in the Studio's own classes.
export function AuthShell({eyebrow,title,lead,children,problem,note}:{eyebrow?:string;title:string;lead?:React.ReactNode;children:React.ReactNode;problem?:string;note?:string}){
 return <div className="auth-shell">
  <header className="topbar"><Link href="/" className="brand"><Aperture/><span>NMESIS <b>STUDIO</b></span></Link></header>
  <main className="auth-main"><section className="auth-card" aria-labelledby="auth-title">
   {eyebrow&&<p className="eyebrow">{eyebrow}</p>}
   <h1 id="auth-title">{title}</h1>
   {lead&&<p className="auth-lead">{lead}</p>}
   {problem&&<p className="error-banner" role="alert"><Info size={18}/><span>{problem}</span></p>}
   {note&&<p className="auth-note" role="status"><CircleCheck size={18}/><span>{note}</span></p>}
   {children}
  </section></main>
  <footer className="auth-footer">Nmesis Studio · Automotive creative workspace</footer>
 </div>;
}
