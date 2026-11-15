import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ProposalScreen } from '@/components/ds-gallery/proposals';
import { PROPOSALS, type Proposal } from '@/components/ds-gallery/screens';
import { requireStaff } from '../../access';

export const metadata: Metadata = { title: 'Proposal · Nmesis Studio', robots: { index: false, follow: false } };
// Staff are checked on every request; never prerendered at build time.
export const dynamic = 'force-dynamic';

// Phase 3 group 1 before it is built into the Studio: the real screens with
// synthetic data. /design-system/proposals/<home|library|projects|folder>
export default async function ProposalPage({ params }: { params: Promise<{ screen: string }> }) {
  await requireStaff();
  const { screen } = await params;
  if (!(PROPOSALS as readonly string[]).includes(screen)) notFound();
  return <ProposalScreen screen={screen as Proposal} />;
}
