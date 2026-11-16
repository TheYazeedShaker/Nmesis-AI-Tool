// A stand-in for the configurator site, for the UI harness only (Phase 3
// polish): /api/config and /api/exterior-manifest for each seeded car, in the
// configurator's own shape, and its pictures on a local "CDN" path. The Studio
// server reaches it at CONFIGURATOR_API_ORIGIN (this machine only; the harness
// allows no other network). Synthetic cars, drawn here; no real brand.
import http from 'node:http';
import sharp from 'sharp';

const COLOURS = { suv: '#2f6f8f', saloon: '#8f2f3f', hatch: '#c9d100', pickup: '#5a5f66' };
// Cars with no frames: the Studio shows a neutral placeholder for them.
const NO_FRAMES = new Set(['sample/coupe']);

function frameSvg(colour) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9dee2"/><stop offset="1" stop-color="#f4f5f2"/></linearGradient></defs>
  <rect width="1600" height="900" fill="url(#sky)"/><rect y="640" width="1600" height="260" fill="#c8ccc6"/>
  <ellipse cx="800" cy="660" rx="520" ry="34" fill="#00000033"/>
  <path d="M330 600 Q340 520 470 500 L640 420 Q700 390 820 390 L1000 395 Q1080 400 1150 470 L1260 500 Q1300 515 1300 560 L1300 610 Q1290 630 1250 630 L350 630 Q325 625 330 600 Z" fill="${colour}"/>
  <path d="M660 430 L820 410 L990 415 Q1050 425 1100 480 L620 480 Z" fill="#1d2329" opacity="0.8"/>
  <circle cx="500" cy="630" r="72" fill="#1b1d1f"/><circle cx="500" cy="630" r="34" fill="#9aa1a6"/>
  <circle cx="1110" cy="630" r="72" fill="#1b1d1f"/><circle cx="1110" cy="630" r="34" fill="#9aa1a6"/>
  </svg>`;
}
const logoSvg = (word) => `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="96" viewBox="0 0 320 96"><text x="160" y="64" text-anchor="middle" font-family="Arial, sans-serif" font-size="52" font-weight="700" letter-spacing="6" fill="#141414">${word}</text></svg>`;

export async function startConfiguratorStandin(cars) {
  const pictures = new Map();
  for (const [brand, model] of cars) {
    pictures.set(`/cdn/${brand}/${model}/frame-01.png`, await sharp(Buffer.from(frameSvg(COLOURS[model] || '#44505a'))).png().toBuffer());
    pictures.set(`/cdn/${brand}/logo.png`, await sharp(Buffer.from(logoSvg(brand.toUpperCase()))).png().toBuffer());
  }
  let origin = '';
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://localhost');
    const brand = u.searchParams.get('brand'), model = u.searchParams.get('model');
    const known = cars.some(([b, m]) => b === brand && m === model);
    const json = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (u.pathname === '/api/config') {
      if (!known) return json(404, { error: 'unknown car' });
      return json(200, {
        grades: [{ id: 'std', folder: 'STD', colorIds: ['c1'], _colorCdnLinks: { c1: { Indoor: `${origin}/cdn/${brand}/${model}` } } }],
        colors: [{ id: 'c1', available: true, lightingFolders: { Indoor: 'C1' } }],
        defaults_lighting: 'Indoor', defaults: { gradeId: 'std', colorId: 'c1', frameIndex: 1 },
        availableIcons: { brandName: `${origin}/cdn/${brand}/logo.png` },
      });
    }
    if (u.pathname === '/api/exterior-manifest') {
      if (!known) return json(404, { error: 'unknown car' });
      return json(200, NO_FRAMES.has(`${brand}/${model}`) ? {} : { STD: { Indoor: { C1: ['frame-01.png'] } } });
    }
    const picture = pictures.get(u.pathname);
    if (picture) { res.writeHead(200, { 'content-type': 'image/png', 'content-length': picture.length }); return res.end(picture); }
    res.writeHead(404); res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://localhost:${server.address().port}`;
  return { origin, server };
}
