// node scripts/fonts/build-catalogue.mjs [--only=Cairo,Inter] [--cache=<dir>]
//
// Builds the editor's self-hosted font catalogue from the official open font
// repository (github.com/google/fonts: each family's own folder with its
// METADATA.pb, its font files as the designers released them, and its licence
// file). Only families under the SIL Open Font Licence or the Apache Licence
// 2.0 are taken; anything else stops the build.
//
// For every family in scripts/fonts/families.mjs it writes, under
// public/fonts/<id>/:
//   <id>-normal.woff2 / <id>-italic.woff2      a variable family: its weight axis kept whole,
//                                              every other axis pinned to its default;
//   <id>-<weight>-<style>.woff2                a family with fixed weights: one file each;
//   preview.woff2                              only the glyphs of the family's own name (and,
//                                              for Arabic families, a short Arabic sample), so
//                                              the font list shows each name in its font for
//                                              a few kilobytes;
//   OFL.txt or LICENSE.txt                     the family's licence, shipped with its fonts.
// Each file keeps the Latin set (and the Arabic set for families that write it),
// without hinting (the canvas draws at design sizes and exports at full size).
// Then lib/editor/font-catalogue.json: family, id, kind, scripts, weights,
// styles, the variable weight range, licence, source and files (the manifest).
//
// The build is run by a developer, never by CI or a browser: its output is
// committed, and the Studio serves the files from its own address.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import subsetFont from 'subset-font';
import { FAMILIES } from './families.mjs';

const args = process.argv.slice(2);
const opt = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || '').slice(n.length + 3);
const ONLY = new Set(opt('only').split(',').map((s) => s.trim()).filter(Boolean));
const CACHE = path.resolve(opt('cache') || 'node_modules/.cache/nmesis-fonts');
const OUT = path.resolve('public/fonts');
const MANIFEST = path.resolve('lib/editor/font-catalogue.json');
const LIST = path.resolve('docs/fonts.md');
const REPO = 'https://raw.githubusercontent.com/google/fonts/main';
const TREE = 'https://github.com/google/fonts/tree/main';
const LICENCES = { OFL: { dir: 'ofl', name: 'OFL-1.1', file: 'OFL.txt' }, APACHE2: { dir: 'apache', name: 'Apache-2.0', file: 'LICENSE.txt' } };

// The characters kept (Unicode ranges): Latin with its Western and Central European letters,
// punctuation and the euro; Arabic with its supplements, presentation forms and joiners.
const LATIN = [[0x20, 0x7e], [0xa0, 0x17f], [0x18f, 0x18f], [0x192, 0x192], [0x1a0, 0x1a1], [0x1af, 0x1b0], [0x218, 0x21b], [0x237, 0x237], [0x259, 0x259],
  [0x2bb, 0x2bc], [0x2c6, 0x2c7], [0x2c9, 0x2c9], [0x2d8, 0x2dd], [0x300, 0x304], [0x306, 0x308], [0x30a, 0x30c], [0x312, 0x312], [0x326, 0x328],
  [0x1e9e, 0x1e9e], [0x2000, 0x206f], [0x20ac, 0x20ac], [0x20b9, 0x20ba], [0x20bd, 0x20bd], [0x2113, 0x2113], [0x2116, 0x2116], [0x2122, 0x2122],
  [0x2190, 0x2193], [0x2212, 0x2212], [0x2215, 0x2215], [0xfeff, 0xfeff], [0xfffd, 0xfffd]];
const ARABIC = [[0x600, 0x6ff], [0x750, 0x77f], [0x8a0, 0x8ff], [0x200c, 0x200f], [0xfb50, 0xfdff], [0xfe70, 0xfeff]];
const ARABIC_SAMPLE = 'أبجد';
const chars = (ranges) => ranges.map(([a, b]) => { let s = ''; for (let c = a; c <= b; c++) s += String.fromCodePoint(c); return s; }).join('');
const KIND = { SANS_SERIF: 'sans', SERIF: 'serif', DISPLAY: 'display', HANDWRITING: 'script', MONOSPACE: 'mono' };

const idOf = (family) => family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const dirOf = (family) => family.toLowerCase().replace(/[^a-z0-9]/g, '');

async function get(url, binary) {
  const key = path.join(CACHE, url.replace(/^https:\/\//, '').replace(/[^a-zA-Z0-9._-]/g, '_'));
  if (fs.existsSync(key)) return binary ? fs.readFileSync(key) : fs.readFileSync(key, 'utf8');
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const body = Buffer.from(await r.arrayBuffer());
      fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(key, body);
      return binary ? body : body.toString('utf8');
    } catch (e) {
      if (attempt >= 3) throw new Error(`${url}: ${e instanceof Error ? e.message : e}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
}

/** The parts of METADATA.pb (protobuf text) the catalogue needs. */
function parseMetadata(text) {
  const one = (src, key) => { const m = new RegExp(`^\\s*${key}:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'm').exec(src); return m ? m[1] : null; };
  const num = (src, key) => { const m = new RegExp(`^\\s*${key}:\\s*(-?[0-9.]+)`, 'm').exec(src); return m ? Number(m[1]) : null; };
  const blocks = (key) => { const out = []; const re = new RegExp(`^${key} \\{([\\s\\S]*?)^\\}`, 'gm'); let m; while ((m = re.exec(text))) out.push(m[1]); return out; };
  return {
    name: one(text, 'name'), designer: one(text, 'designer'), license: one(text, 'license'), category: one(text, 'category'),
    fonts: blocks('fonts').map((b) => ({ style: one(b, 'style'), weight: num(b, 'weight'), filename: one(b, 'filename') })),
    axes: blocks('axes').map((b) => ({ tag: one(b, 'tag'), min: num(b, 'min_value'), max: num(b, 'max_value') })),
    subsets: [...text.matchAll(/^subsets:\s*"([^"]+)"/gm)].map((m) => m[1]),
    repository: (/repository_url:\s*"([^"]+)"/.exec(text) || [])[1] || null,
  };
}

/** Every variation axis of a font file with its default (the fvar table), so all but the weight can be pinned there. */
function axesOf(buf) {
  const tables = buf.readUInt16BE(4);
  for (let i = 0; i < tables; i++) {
    const rec = 12 + i * 16;
    if (buf.toString('latin1', rec, rec + 4) !== 'fvar') continue;
    const at = buf.readUInt32BE(rec + 8), first = at + buf.readUInt16BE(at + 4), count = buf.readUInt16BE(at + 8), size = buf.readUInt16BE(at + 10);
    const fixed = (o) => buf.readInt32BE(o) / 65536;
    return Array.from({ length: count }, (_, k) => { const o = first + k * size; return { tag: buf.toString('latin1', o, o + 4), min: fixed(o + 4), def: fixed(o + 8), max: fixed(o + 12) }; });
  }
  return [];
}

const STOPS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
async function buildFamily(family, group) {
  const dir = dirOf(family);
  let meta = null, licence = null;
  for (const [key, l] of Object.entries(LICENCES)) {
    const text = await get(`${REPO}/${l.dir}/${dir}/METADATA.pb`, false);
    if (text) { meta = parseMetadata(text); licence = LICENCES[meta.license] || null; if (!licence) throw new Error(`${family}: licence ${meta.license} is not OFL or Apache 2.0`); if (licence !== l) licence = l; void key; break; }
  }
  if (!meta) throw new Error(`${family}: not in the repository (looked for ${dir})`);
  if (meta.name !== family) throw new Error(`${family}: the repository calls it ${meta.name}`);
  const id = idOf(family), out = path.join(OUT, id);
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const licenceText = await get(`${REPO}/${licence.dir}/${dir}/${licence.file}`, false) || await get(`${REPO}/${licence.dir}/${dir}/LICENSE.txt`, false);
  if (!licenceText) throw new Error(`${family}: no licence file`);
  fs.writeFileSync(path.join(out, licence.file), licenceText.replace(/\r\n/g, '\n'));
  const arabic = meta.subsets.includes('arabic');
  const keep = chars(LATIN) + (arabic ? chars(ARABIC) : '');
  const files = [];
  const byFile = new Map();
  for (const f of meta.fonts) if (f.filename && !byFile.has(f.filename)) byFile.set(f.filename, f);
  let previewSource = null;
  for (const [filename, f] of byFile) {
    const src = await get(`${REPO}/${licence.dir}/${dir}/${encodeURIComponent(filename)}`, true);
    if (!src) throw new Error(`${family}: ${filename} is missing`);
    const style = f.style === 'italic' ? 'italic' : 'normal';
    const axes = axesOf(src);
    const variable = axes.length > 0;
    const pin = {};
    for (const a of axes) if (a.tag !== 'wght') pin[a.tag] = a.tag === 'ital' ? (style === 'italic' ? a.max : a.min) : a.def;
    const woff2 = await subsetFont(src, keep, { targetFormat: 'woff2', noHinting: true, ...(variable && Object.keys(pin).length ? { variationAxes: pin } : {}) });
    const w = variable ? axes.find((a) => a.tag === 'wght') : null;
    const name = variable ? `${id}-${style}.woff2` : `${id}-${f.weight}-${style}.woff2`;
    fs.writeFileSync(path.join(out, name), woff2);
    files.push({ style, weight: w ? [Math.round(w.min), Math.round(w.max)] : f.weight, file: name, bytes: woff2.length });
    if (style === 'normal' && (!previewSource || (!previewSource.variable && Math.abs(f.weight - 400) < Math.abs(previewSource.weight - 400)))) previewSource = { src, axes, variable, weight: f.weight };
  }
  if (!files.length) throw new Error(`${family}: no font files`);
  // The preview: the name's own glyphs (and an Arabic sample) at the regular weight, every axis pinned.
  const ps = previewSource || { src: await get(`${REPO}/${licence.dir}/${dir}/${encodeURIComponent([...byFile.keys()][0])}`, true), axes: [], variable: false };
  const pinAll = {};
  for (const a of ps.axes) pinAll[a.tag] = a.tag === 'wght' ? Math.min(a.max, Math.max(a.min, 400)) : a.tag === 'ital' ? a.min : a.def;
  const preview = await subsetFont(ps.src, family + (arabic ? ' ' + ARABIC_SAMPLE : ''), { targetFormat: 'woff2', noHinting: true, ...(ps.variable ? { variationAxes: pinAll } : {}) });
  fs.writeFileSync(path.join(out, 'preview.woff2'), preview);
  const range = files.find((f) => Array.isArray(f.weight))?.weight || null;
  const weights = range ? STOPS.filter((s) => s >= range[0] && s <= range[1]) : [...new Set(files.filter((f) => f.style === 'normal').map((f) => f.weight))].sort((a, b) => a - b);
  const kind = group === 'arabic' ? (KIND[meta.category] || 'sans') : group;
  return {
    id, family, kind, arabic, weights, variable: range ? { min: range[0], max: range[1] } : null,
    italic: files.some((f) => f.style === 'italic'),
    licence: licence.name, licenceFile: licence.file, designer: meta.designer || '',
    source: `${TREE}/${licence.dir}/${dir}`, upstream: meta.repository,
    files: files.sort((a, b) => (a.style < b.style ? -1 : a.style > b.style ? 1 : (Array.isArray(a.weight) ? a.weight[0] : a.weight) - (Array.isArray(b.weight) ? b.weight[0] : b.weight))),
    preview: { file: 'preview.woff2', bytes: preview.length },
  };
}

/** docs/fonts.md: every family, its kind, scripts, weights, licence and the folder it was built from. */
export function fontList(families) {
  const kinds = { sans: 'Sans serif', serif: 'Serif', display: 'Display', script: 'Script', mono: 'Monospace' };
  const bytes = families.reduce((s, f) => s + f.files.reduce((t, x) => t + x.bytes, 0) + f.preview.bytes, 0);
  const weights = (f) => (f.variable ? `${f.variable.min}–${f.variable.max} (variable)` : f.weights.join(', ')) + (f.italic ? ', italic' : '');
  const rows = families.map((f) => `| ${f.family} | ${kinds[f.kind]} | ${f.arabic ? 'Latin, Arabic' : 'Latin'} | ${weights(f)} | ${f.licence} | [folder](${f.source}) |`);
  return [
    "# The editor's fonts",
    '',
    `The canvas editor's font catalogue: ${families.length} families, ${(bytes / 1024 / 1024).toFixed(1)} MB of WOFF2, every one under the SIL Open Font Licence 1.1 or the Apache Licence 2.0. The Studio serves the files itself (\`public/fonts/<id>/\`, each family's licence file beside its fonts), so no person's browser asks a font service for anything, and \`check:ui\` fails on any request to one. Built by \`node scripts/fonts/build-catalogue.mjs\` from the official open font repository (the families are listed in \`scripts/fonts/families.mjs\`); the manifest is \`lib/editor/font-catalogue.json\`. This list is written by the same build.`,
    '',
    '| Family | Kind | Writes | Weights | Licence | Source |',
    '|---|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

async function main() {
  const todo = Object.entries(FAMILIES).flatMap(([group, list]) => list.map((family) => ({ family, group })))
    .filter((t) => !ONLY.size || ONLY.has(t.family));
  const old = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { families: [] };
  const done = new Map(old.families.map((f) => [f.family, f]));
  const failed = [];
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < todo.length) {
      const t = todo[next++];
      try { const entry = await buildFamily(t.family, t.group); done.set(t.family, entry); console.log(`ok   ${t.family} (${entry.files.length} files, ${Math.round(entry.files.reduce((s, f) => s + f.bytes, 0) / 1024)} KB)`); }
      catch (e) { failed.push(t.family); console.error(`FAIL ${e instanceof Error ? e.message : e}`); }
    }
  }));
  const order = Object.values(FAMILIES).flat();
  const families = [...done.values()].filter((f) => order.includes(f.family)).sort((a, b) => order.indexOf(a.family) - order.indexOf(b.family));
  fs.writeFileSync(MANIFEST, JSON.stringify({ about: 'Built by scripts/fonts/build-catalogue.mjs from the official open font repository. Every family is OFL-1.1 or Apache-2.0; its licence file ships beside its fonts in public/fonts/<id>/.', families }, null, 1) + '\n');
  fs.writeFileSync(LIST, fontList(families));
  const bytes = families.reduce((s, f) => s + f.files.reduce((t, x) => t + x.bytes, 0) + f.preview.bytes, 0);
  console.log(`\n${families.length} families, ${(bytes / 1024 / 1024).toFixed(1)} MB${failed.length ? `; failed: ${failed.join(', ')}` : ''}`);
  if (failed.length) process.exitCode = 1;
}
// Run as a script (node scripts/fonts/build-catalogue.mjs); imported, it only lends fontList.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
