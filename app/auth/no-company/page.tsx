import type {Metadata} from 'next';
import {LogOut} from 'lucide-react';
import {AuthShell} from '@/components/auth/auth-shell';
import {NO_COMPANY} from '@/lib/auth/words';
export const metadata:Metadata={title:'No company yet · Nmesis Studio'};
// A signed-in person with no active membership (and not staff).
export default function NoCompany(){
 return <AuthShell eyebrow="NMESIS STUDIO" title="Almost there" lead={NO_COMPANY}>
  <form className="auth-form" method="post" action="/auth/signout"><button className="secondary" type="submit"><LogOut size={16}/>Sign out</button></form>
 </AuthShell>;
}
