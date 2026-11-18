import type {Metadata} from 'next';
import {AccountPage} from '@/components/shell/account-page';
export const metadata:Metadata={title:'Your account · Nmesis Studio'};
export default function Page(){return <AccountPage/>}
