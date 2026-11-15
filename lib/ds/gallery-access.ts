// Who may open the design-system gallery (/design-system): Nmesis staff, which
// the page checks on the server with getStudioContext(). The one exception is a
// local `next dev` with STUDIO_DESIGN_GALLERY=open, so the gallery and its
// wireframes can be looked at (and screenshotted by the Phase 1 harness) with no
// Supabase project. `next build` / `next start` and every Vercel deployment run
// with NODE_ENV=production, where the exception can never apply. The gallery
// shows synthetic data only.
export const GALLERY_PATH = /^\/design-system(\/.*)?$/;

export function galleryOpenWithoutSignIn(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV === 'development' && env.STUDIO_DESIGN_GALLERY === 'open';
}
