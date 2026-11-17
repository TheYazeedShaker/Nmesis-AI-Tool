import {AccountNotices} from '@/components/studio-account';
import {WorkspaceFrame} from '@/components/workspace/frame';
import {UsagePageView} from '@/components/company/usage-page';
// Usage, for a company's owners (and Nmesis staff with support access): the
// credit meter, use over the period, by person and by tool, the last 50
// actions, packs. Credits only; the server never sends a provider or a cost.
export default function Usage(){
 return <WorkspaceFrame current="usage" notices={<AccountNotices variant="ds"/>}><UsagePageView/></WorkspaceFrame>;
}
