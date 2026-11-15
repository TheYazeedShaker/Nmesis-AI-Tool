import type { Metadata } from 'next';
import { Gallery } from '@/components/ds-gallery/gallery';
import { requireStaff } from './access';

export const metadata: Metadata = { title: 'Design system · Nmesis Studio', robots: { index: false, follow: false } };
// Staff are checked on every request; never prerendered at build time.
export const dynamic = 'force-dynamic';

// Staff only: every token and component in every state, light and dark.
export default async function DesignSystemPage() {
  await requireStaff();
  return (
    <div className="ds-app">
      <main className="ds-main" id="main">
        <Gallery />
      </main>
    </div>
  );
}
