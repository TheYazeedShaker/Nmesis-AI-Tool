import type {Metadata} from 'next';
import {AccountNotices} from '@/components/studio-account';
import {WorkspaceFrame} from '@/components/workspace/frame';
import {BrandKitScreen} from '@/components/brand/brand-kit';
export const metadata:Metadata={title:'Brand · Nmesis Studio'};
// The company's brand kit: logos, colours, fonts and voice. Everyone in the
// company reads; owners and creators change it.
export default function Brand(){
 return <WorkspaceFrame current="brand" notices={<AccountNotices variant="ds"/>}><BrandKitScreen/></WorkspaceFrame>;
}
