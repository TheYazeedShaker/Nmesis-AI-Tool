import {AccountNotices} from '@/components/studio-account';
import {WorkspaceFrame} from '@/components/workspace/frame';
import {CompanySettingsView} from '@/components/company/company-settings';
// Company settings: the team, the plan, the brands, who gets the credit
// emails, the company's own keys (own-key plans) and Nmesis support access.
// Everyone in the company reads; only its owners change anything.
export default function Company(){
 return <WorkspaceFrame current="company" notices={<AccountNotices variant="ds"/>}><CompanySettingsView/></WorkspaceFrame>;
}
