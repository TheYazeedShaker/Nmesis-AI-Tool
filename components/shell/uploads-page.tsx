'use client';
import {PageHeader,Section} from '@/components/ds/layout';
import {AccountNotices} from '@/components/studio-account';
import {WorkspaceFrame} from '@/components/workspace/frame';
import {UploadsPanel} from './panels';

// Uploads outside a tool: the same list as the Uploads panel inside Key visual
// and Car lineup, as a page. A picture picked here is ready as a reference when
// a tool opens.
export function UploadsPage(){
 return <WorkspaceFrame current="uploads" notices={<AccountNotices variant="ds"/>}>
  <PageHeader title="Uploads" lede="Your own pictures, ready to use as references in Key visual and Car lineup."/>
  <Section className="studio-uploads-page"><UploadsPanel/></Section>
 </WorkspaceFrame>;
}
