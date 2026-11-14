import type {Metadata} from 'next';
import {AuthShell} from '@/components/auth/auth-shell';
import {ForgotForm} from '@/components/auth/forms';
export const metadata:Metadata={title:'Forgot your password? · Nmesis Studio'};
export const dynamic='force-dynamic';
export default async function Forgot({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const q=await searchParams,email=typeof q.email==='string'?q.email.slice(0,254):'';
 return <AuthShell eyebrow="NMESIS STUDIO" title="Forgot your password?" lead="Enter your email address. We’ll send a link that takes you to choose a new password.">
  <ForgotForm email={email}/>
 </AuthShell>;
}
