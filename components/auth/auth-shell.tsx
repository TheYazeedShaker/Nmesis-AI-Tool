import Link from 'next/link';
import {Aperture,Info,CircleCheck} from 'lucide-react';
import '@/app/auth.css';
// The frame every sign-in and account screen shares, on the design system in
// the Nmesis theme: the brand, one centred card, light or dark as the system is.
export function AuthShell({eyebrow,title,lead,children,problem,note}:{eyebrow?:string;title:string;lead?:React.ReactNode;children:React.ReactNode;problem?:string;note?:string}){
 return <div className="ds-app auth-shell">
  <header className="auth-top"><Link className="ds-brand" href="/" aria-label="Nmesis Studio, Home">
   <span className="ds-brand-mark" aria-hidden="true"><Aperture/></span>
   <span aria-hidden="true">NMESIS <span className="ds-brand-sub">STUDIO</span></span>
  </Link></header>
  <main className="auth-main"><section className="ds-section auth-card" aria-labelledby="auth-title"><div className="auth-card-body">
   {eyebrow&&<p className="ds-label-caps">{eyebrow}</p>}
   <h1 className="ds-page-title" id="auth-title">{title}</h1>
   {lead&&<p className="ds-help auth-lead">{lead}</p>}
   {problem&&<div className="ds-banner bad" role="alert"><Info aria-hidden="true"/><span>{problem}</span></div>}
   {note&&<div className="ds-banner" role="status"><CircleCheck aria-hidden="true"/><span>{note}</span></div>}
   {children}
  </div></section></main>
  <footer className="auth-footer ds-help">Nmesis Studio · Automotive creative workspace</footer>
 </div>;
}
