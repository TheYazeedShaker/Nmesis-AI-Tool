// Synthetic pictures for the design-system proposals: a sky, a road and a car
// shape, drawn as an SVG data URL. Nothing here is a real car or photograph.
const SKIES: [string, string][] = [
  ['#1d2b4a', '#f2a65a'], // dusk
  ['#0b1020', '#39408a'], // night
  ['#e9ecef', '#c9d1d9'], // studio
  ['#7fb3d5', '#f6e7c1'], // coast
  ['#5d7b6f', '#cfd8dc'], // mountain
];
const BODIES = ['#d9ff00', '#e5e7eb', '#1f2937', '#b91c1c', '#2563eb', '#0f766e'];

export function thumb(seed: number, w = 640, h = 400): string {
  const [top, bottom] = SKIES[seed % SKIES.length];
  const body = BODIES[(seed * 7) % BODIES.length];
  const x = 120 + ((seed * 53) % 200);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 400" width="${w}" height="${h}">
<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2f33"/><stop offset="1" stop-color="#111315"/></linearGradient></defs>
<rect width="640" height="400" fill="url(#s)"/><rect y="270" width="640" height="130" fill="url(#g)"/>
<ellipse cx="${x + 140}" cy="318" rx="170" ry="14" fill="#000" opacity=".35"/>
<path d="M${x} 300 q10-46 70-52 l50-34 q30-18 80-18 l60 0 q40 2 70 40 l40 12 q20 6 22 30 l0 22 z" fill="${body}"/>
<path d="M${x + 125} 222 l40-6 l55 0 q25 2 42 30 l-150 2 z" fill="#0b0d0f" opacity=".75"/>
<circle cx="${x + 75}" cy="302" r="26" fill="#0b0d0f"/><circle cx="${x + 75}" cy="302" r="12" fill="#9ca3af"/>
<circle cx="${x + 290}" cy="302" r="26" fill="#0b0d0f"/><circle cx="${x + 290}" cy="302" r="12" fill="#9ca3af"/>
</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
