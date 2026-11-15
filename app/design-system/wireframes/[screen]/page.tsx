import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Wireframe } from '@/components/ds-gallery/wireframes';
import { SCREEN_TITLES, isScreen } from '@/components/ds-gallery/screens';
import { requireStaff } from '../../access';

export const metadata: Metadata = { title: 'Wireframe · Nmesis Studio', robots: { index: false, follow: false } };
// Staff are checked on every request; never prerendered at build time.
export const dynamic = 'force-dynamic';

// One wireframe at full size: /design-system/wireframes/<home|folders|library|editor>?theme=light|dark
export default async function WireframePage({ params, searchParams }: { params: Promise<{ screen: string }>; searchParams: Promise<{ theme?: string }> }) {
  await requireStaff();
  const { screen } = await params;
  const { theme } = await searchParams;
  if (!isScreen(screen)) notFound();
  return (
    <>
      <h1 className="ds-sr-only">Wireframe: {SCREEN_TITLES[screen]}</h1>
      <Wireframe screen={screen} theme={theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : undefined} />
    </>
  );
}
