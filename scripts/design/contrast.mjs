// Contrast of the Studio's colour tokens, read from app/tokens.css, in both
// themes: every text and background pair, every button label against its fill
// in every state, and the focus ring. tests/contrast.test.mjs fails on any pair
// under its minimum; `node scripts/design/contrast.mjs` prints the table
// (Markdown) for a pull request.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** The colour tokens: the declarations of the first block that sets them on every theme scope. */
export function readTokens(css = readFileSync(path.join(ROOT, 'app/tokens.css'), 'utf8')) {
  const start = css.indexOf(':root, .ds-app, [data-theme] {');
  if (start < 0) throw new Error('tokens.css: the colour block (:root, .ds-app, [data-theme]) is missing');
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('\n}', start));
  const tokens = {};
  for (const m of body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();
  return tokens;
}

/** Splits "a, b" at the top level (not inside parentheses). */
function splitTop(s) {
  const out = []; let depth = 0, from = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++; else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) { out.push(s.slice(from, i).trim()); from = i + 1; }
  }
  out.push(s.slice(from).trim());
  return out;
}

/** A token's colour in one theme, as [r, g, b, a] (0–255, alpha 0–1). */
export function resolve(tokens, name, theme, seen = new Set()) {
  if (seen.has(name)) throw new Error(`token loop at --${name}`);
  seen.add(name);
  const raw = tokens[name];
  if (raw === undefined) throw new Error(`unknown token --${name}`);
  return parseColour(tokens, raw, theme, seen);
}

function parseColour(tokens, value, theme, seen) {
  const v = value.trim();
  const ld = /^light-dark\((.*)\)$/s.exec(v);
  if (ld) { const [light, dark] = splitTop(ld[1]); return parseColour(tokens, theme === 'dark' ? dark : light, theme, seen); }
  const ref = /^var\(--([\w-]+)\)$/.exec(v);
  if (ref) return resolve(tokens, ref[1], theme, seen);
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1);
  }
  const rgba = /^rgba?\(([^)]+)\)$/.exec(v);
  if (rgba) { const p = rgba[1].split(',').map((x) => Number(x.trim())); return [p[0], p[1], p[2], p[3] ?? 1]; }
  throw new Error(`not a colour: ${value}`);
}

/** A translucent colour laid over an opaque one. */
const over = (top, base) => [0, 1, 2].map((i) => Math.round(top[i] * top[3] + base[i] * (1 - top[3]))).concat(1);
const lum = ([r, g, b]) => { const c = [r, g, b].map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
export const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

// [what, foreground token, background token, minimum, base under a translucent background]
const TEXT = 4.5, UI = 3;
export const PAIRS = [
  ['Text on the page', 'ds-text', 'ds-bg', TEXT],
  ['Text on a card', 'ds-text', 'ds-panel', TEXT],
  ['Text on a surface', 'ds-text', 'ds-panel-2', TEXT],
  ['Text on hover', 'ds-text', 'ds-panel-hover', TEXT],
  ['Strong text on the page', 'ds-text-strong', 'ds-bg', TEXT],
  ['Strong text on a card', 'ds-text-strong', 'ds-panel', TEXT],
  ['Muted text on the page', 'ds-muted', 'ds-bg', TEXT],
  ['Muted text on a card', 'ds-muted', 'ds-panel', TEXT],
  ['Muted text on a surface', 'ds-muted', 'ds-panel-2', TEXT],
  ['Muted text on hover', 'ds-muted', 'ds-panel-hover', TEXT],
  ['Placeholder on a card', 'ds-muted-2', 'ds-panel', TEXT],
  ['Placeholder on the page', 'ds-muted-2', 'ds-bg', TEXT],
  ['Placeholder on a surface', 'ds-muted-2', 'ds-panel-2', TEXT],
  ['Accent words on the page', 'ds-accent-text', 'ds-bg', TEXT],
  ['Accent words on a card', 'ds-accent-text', 'ds-panel', TEXT],
  ['Words on the lime', 'ds-accent-ink', 'ds-accent', TEXT],
  ['Selected item', 'ds-selected-text', 'ds-selected-bg', TEXT],
  ['Success on a card', 'ds-success', 'ds-panel', TEXT],
  ['Info on a card', 'ds-info', 'ds-panel', TEXT],
  ['Warning on a card', 'ds-warn', 'ds-panel', TEXT],
  ['Danger on a card', 'ds-danger', 'ds-panel', TEXT],
  ['Success on its tint', 'ds-success', 'ds-success-soft', TEXT, 'ds-panel'],
  ['Info on its tint', 'ds-info', 'ds-info-soft', TEXT, 'ds-panel'],
  ['Warning on its tint', 'ds-warn', 'ds-warn-soft', TEXT, 'ds-panel'],
  ['Danger on its tint', 'ds-danger', 'ds-danger-soft', TEXT, 'ds-panel'],
  ['Button', 'ds-btn-text', 'ds-btn-bg', TEXT],
  ['Button, hover', 'ds-btn-text', 'ds-btn-bg-hover', TEXT],
  ['Button, pressed', 'ds-btn-text', 'ds-btn-bg-active', TEXT],
  ['Primary button', 'ds-btn-primary-text', 'ds-btn-primary-bg', TEXT],
  ['Primary button, hover', 'ds-btn-primary-text', 'ds-btn-primary-bg-hover', TEXT],
  ['Primary button, pressed', 'ds-btn-primary-text', 'ds-btn-primary-bg-active', TEXT],
  ['Quiet button on a card', 'ds-btn-text', 'ds-panel', TEXT],
  ['Quiet button, hover', 'ds-btn-text', 'ds-btn-quiet-bg-hover', TEXT],
  ['Danger button', 'ds-btn-danger-text', 'ds-btn-danger-bg', TEXT],
  ['Danger button, hover', 'ds-btn-danger-text', 'ds-btn-danger-bg-hover', TEXT],
  ['Quiet danger button, hover', 'ds-danger', 'ds-danger-soft', TEXT, 'ds-panel'],
  ['Unavailable button', 'ds-btn-disabled-text', 'ds-btn-disabled-bg', TEXT],
  ['Unavailable field', 'ds-muted', 'ds-panel-2', TEXT],
  ['Focus ring on the page', 'ds-ring', 'ds-bg', UI],
  ['Focus ring on a card', 'ds-ring', 'ds-panel', UI],
];

/** Every pair in both themes: { what, fg, bg, theme, ratio, min, ok }. */
export function contrastRows(tokens = readTokens()) {
  const rows = [];
  for (const theme of ['light', 'dark']) {
    for (const [what, fg, bg, min, base] of PAIRS) {
      let back = resolve(tokens, bg, theme);
      if (back[3] < 1) back = over(back, resolve(tokens, base || 'ds-panel', theme));
      let front = resolve(tokens, fg, theme);
      if (front[3] < 1) front = over(front, back);
      const r = ratio(front, back);
      rows.push({ what, fg, bg, theme, ratio: Math.round(r * 100) / 100, min, ok: r >= min });
    }
  }
  return rows;
}

/** The table for a pull request: one row per pair, both themes side by side. */
export function contrastTable(rows = contrastRows()) {
  const light = rows.filter((r) => r.theme === 'light'), dark = rows.filter((r) => r.theme === 'dark');
  const lines = ['| Pair | Tokens | Light | Dark | Minimum |', '| --- | --- | ---: | ---: | ---: |'];
  light.forEach((l, i) => {
    const d = dark[i];
    if (l.min < 3) return;
    lines.push(`| ${l.what} | \`--${l.fg}\` on \`--${l.bg}\` | ${l.ratio.toFixed(2)}${l.ok ? '' : ' ✗'} | ${d.ratio.toFixed(2)}${d.ok ? '' : ' ✗'} | ${l.min}:1 |`);
  });
  return lines.join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rows = contrastRows();
  console.log(contrastTable(rows));
  const bad = rows.filter((r) => !r.ok);
  if (bad.length) { console.error(`\n${bad.length} pair(s) under the minimum`); process.exitCode = 1; }
}
