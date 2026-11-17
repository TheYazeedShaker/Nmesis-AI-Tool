import type {Metadata} from 'next';
import {LogOut} from 'lucide-react';
import {Button} from '@/components/ds/button';
import {AuthShell} from '@/components/auth/auth-shell';
import {NO_COMPANY} from '@/lib/auth/words';
export const metadata:Metadata={title:'No company yet · Nmesis Studio'};
// A signed-in person with no active membership (and not staff).
export default function NoCompany(){
 return <AuthShell eyebrow="NMESIS STUDIO" title="Almost there" lead={NO_COMPANY}>
  <form className="auth-form" method="post" action="/auth/signout"><Button block type="submit" icon={<LogOut aria-hidden="true"/>}>Sign out</Button></form>
 </AuthShell>;
}
