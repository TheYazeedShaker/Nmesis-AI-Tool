import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {AuthShell} from '@/components/auth/auth-shell';
import {ChoosePasswordForm} from '@/components/auth/forms';
import {safeNext} from '@/lib/auth/words';
import {sessionUser} from '@/lib/studio-context';
export const metadata:Metadata={title:'Choose your password · Nmesis Studio'};
export const dynamic='force-dynamic';
// Every invitation and recovery link stops here before the workspace.
export default async function ChoosePassword({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const q=await searchParams,user=await sessionUser().catch(()=>null);
 if(!user)redirect('/signin?problem=expired');
 return <AuthShell eyebrow="WELCOME TO NMESIS STUDIO" title="Choose your password" lead="Set a password so you can sign in with it next time. You can also keep using links we email you.">
  <ChoosePasswordForm email={user.email} next={safeNext(typeof q.next==='string'?q.next:'')}/>
 </AuthShell>;
}
