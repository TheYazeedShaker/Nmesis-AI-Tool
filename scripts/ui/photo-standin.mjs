// A photo library on this machine for the UI harness (editor Phase 5's Photos panel). Loaded into the
// Studio server the harness starts (NODE_OPTIONS=--import, after ./no-network.mjs) with UI_PHOTO_STANDIN=1:
// the server's requests to Pixabay's API and pictures are answered here, from synthetic data (a demo
// photographer, solid-colour pictures), so the journey searches, places and exports a photo with no
// network at all. Unsplash is left without a key, so the panel shows a library that is off.
// The harness's browser gets the same pictures for the grid (scripts/check-ui.mjs prepareContext).
import { encode } from 'fast-png';

export const STANDIN_KEY = 'ui-standin-0000-0000-pixabay';
/** The stand-in photos' one colour: the journey finds it in the export where a photo was placed. */
export const PHOTO_COLOUR = [58, 123, 213];
export const PHOTO_HOSTS = /^(pixabay\.com|cdn\.pixabay\.com)$/;

/** A solid-colour PNG. */
export function standinPng(width = 96, height = 64, [r, g, b] = PHOTO_COLOUR) {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) { data[i * 3] = r; data[i * 3 + 1] = g; data[i * 3 + 2] = b; }
  return Buffer.from(encode({ width, height, data, channels: 3, depth: 8 }));
}

const hits = (n) => Array.from({ length: n }, (_, i) => ({
  id: 900000 + i, pageURL: `https://pixabay.com/photos/demo-road-${900000 + i}/`, type: 'photo', tags: 'demo, road, hills',
  webformatURL: `https://pixabay.com/get/demo${i}_640.png`, largeImageURL: `https://pixabay.com/get/demo${i}_1280.png`,
  imageWidth: i % 3 ? 4000 : 3000, imageHeight: i % 3 ? 3000 : 4000, user: 'demo_maker', user_id: 4242,
}));

if (process.env.UI_PHOTO_STANDIN === '1') {
  const real = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    let url;
    try { url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url); } catch { return real(input, init); }
    if (url.hostname === 'pixabay.com' && url.pathname === '/api/') {
      if (url.searchParams.get('key') !== STANDIN_KEY) return new Response('[ERROR 400] Invalid or missing API key', { status: 400 });
      const all = /nothing/i.test(url.searchParams.get('q') || '') ? [] : hits(60);
      const id = url.searchParams.get('id');
      if (id) return Response.json({ totalHits: 1, hits: all.filter((h) => String(h.id) === id) });
      const page = Number(url.searchParams.get('page') || 1), per = Number(url.searchParams.get('per_page') || 20);
      return Response.json({ total: all.length, totalHits: all.length, hits: all.slice((page - 1) * per, page * per) }, { headers: { 'x-ratelimit-remaining': '99' } });
    }
    if ((url.hostname === 'pixabay.com' && url.pathname.startsWith('/get/')) || url.hostname === 'cdn.pixabay.com') {
      return new Response(standinPng(), { status: 200, headers: { 'content-type': 'image/png' } });
    }
    return real(input, init);
  };
}
