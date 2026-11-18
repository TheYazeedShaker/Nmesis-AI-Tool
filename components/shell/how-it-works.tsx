import * as React from 'react';
import {Car,Images,Share2,Sparkles} from 'lucide-react';

// "How it works", the same four steps on Home and in Help: what a first-time
// person needs to know to make their first picture.
export const STEPS:{title:string;line:string;icon:React.ReactNode}[]=[
 {title:'Pick',line:'A tool and one of your cars.',icon:<Car aria-hidden="true"/>},
 {title:'Add references',line:'Photos that show the look you want.',icon:<Images aria-hidden="true"/>},
 {title:'Generate',line:'See the credits first; nothing is used before you press it.',icon:<Sparkles aria-hidden="true"/>},
 {title:'Edit and share',line:'Keep the best version, download it or share it.',icon:<Share2 aria-hidden="true"/>},
];

export function HowItWorks({headingLevel=2}:{headingLevel?:2|3}){
 const H=`h${headingLevel}` as 'h2'|'h3';
 return <section className="studio-how" aria-labelledby="studio-how-title">
  <H className="ds-block-title" id="studio-how-title">How it works</H>
  <ol className="studio-how-steps">
   {STEPS.map((s,i)=><li key={s.title} className="studio-how-step">
    <span className="studio-how-mark">{s.icon}</span>
    <span className="studio-how-text"><b><span className="ds-sr-only">Step {i+1}: </span>{s.title}</b><span className="ds-muted">{s.line}</span></span>
   </li>)}
  </ol>
 </section>;
}
