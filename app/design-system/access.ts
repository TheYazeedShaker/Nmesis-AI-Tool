import { notFound } from 'next/navigation';
import { getStudioContext } from '@/lib/studio-context';
import { galleryOpenWithoutSignIn } from '@/lib/ds/gallery-access';

// The gallery and the wireframes are for Nmesis staff. Anybody else gets the
// ordinary 404, so the route does not announce itself. The proxy has already
// sent a signed-out visitor to sign in.
export async function requireStaff() {
  if (galleryOpenWithoutSignIn()) return;
  const r = await getStudioContext();
  if (!r.ok || !r.ctx.staff) notFound();
}
