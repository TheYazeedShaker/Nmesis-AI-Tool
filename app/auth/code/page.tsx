import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {AuthShell} from '@/components/auth/auth-shell';
import {CodeForm} from '@/components/auth/forms';
import {safeNext} from '@/lib/auth/words';
import {sessionUser} from '@/lib/studio-context';
import {getDirectory} from '@/lib/accounts/directory';
export const metadata:Metadata={title:'Six-digit code · Nmesis Studio'};
export const dynamic='force-dynamic';
// Nmesis staff, after their password: the code from the authenticator app they
// already use for the admin (or adding one, if the account somehow has none).
// Client people never see this step.
export default async function SixDigitCode({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const q=await searchParams,next=safeNext(typeof q.next==='string'?q.next:'');
 const user=await sessionUser().catch(()=>null);
 if(!user)redirect('/signin?problem=expired'+(next!=='/'?'&next='+encodeURIComponent(next):''));
 const staff=await getDirectory()?.staffRole(user.id).catch(()=>null);
 if(!staff||user.aal==='aal2')redirect(next);
 return <AuthShell eyebrow="NMESIS STAFF" title={user.totp?'Six-digit code':'Add your authenticator app'} lead={user.totp?'Enter the code from the authenticator app you use for the Nmesis admin.':'Your account has no authenticator app yet. Add one to continue; the admin will use the same one.'}>
  <CodeForm next={next} email={user.email} enrol={!user.totp}/>
 </AuthShell>;
}
