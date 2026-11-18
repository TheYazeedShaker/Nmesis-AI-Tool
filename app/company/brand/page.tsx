import type {Metadata} from 'next';
import {AccountNotices} from '@/components/studio-account';
import {WorkspaceFrame} from '@/components/workspace/frame';
import {BrandKitScreen} from '@/components/brand/brand-kit';
import {SettingsNav} from '@/components/company/settings-nav';
export const metadata:Metadata={title:'Brand kit · Nmesis Studio'};
// Settings → Brand kit: the company's logos, colours, fonts and voice.
// Everyone in the company reads; owners and creators change it. The Brand
// panel beside a tool shows the same kit, ready to use (components/brand/brand-panel.tsx).
export default function CompanyBrand(){
 return <WorkspaceFrame current="company" notices={<AccountNotices variant="ds"/>}>
  <div className="settings-page"><SettingsNav current="brand"/><BrandKitScreen/></div>
 </WorkspaceFrame>;
}
