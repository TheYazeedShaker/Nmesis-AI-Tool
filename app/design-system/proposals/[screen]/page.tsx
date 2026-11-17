import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProposalScreen } from '@/components/ds-gallery/proposals';
import { EditorProposal } from '@/components/ds-gallery/editor-proposals';
import { PROPOSALS, type Proposal } from '@/components/ds-gallery/screens';
import type { EditorTool } from '@/components/editor/editor-screen';
import { requireStaff } from '../../access';

export const metadata: Metadata = { title: 'Proposal · Nmesis Studio', robots: { index: false, follow: false } };
// Staff are checked on every request; never prerendered at build time.
export const dynamic = 'force-dynamic';

// Phase 3 before it is built into the Studio: the real screens with synthetic
// data. /design-system/proposals/<home|library|projects|folder|editor-<tool>>
export default async function ProposalPage({ params }: { params: Promise<{ screen: string }> }) {
  await requireStaff();
  const { screen } = await params;
  if (!(PROPOSALS as readonly string[]).includes(screen)) notFound();
  if (screen.startsWith('editor-')) return <EditorProposal tool={screen.slice(7) as EditorTool} />;
  return <ProposalScreen screen={screen as Exclude<Proposal, `editor-${string}`>} />;
}
