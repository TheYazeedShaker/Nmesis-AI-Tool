// npm run design:inventory
//
// Counts every distinct value the Studio's own CSS and components use, per
// kind (text sizes, weights, paddings, gaps, corners, shadows, colours,
// durations, layers, breakpoints, line heights, letter spacing), so the token
// scales in app/tokens.css can be checked against what is really there.
// It reads app/**/*.css (not vendor/), `style={{…}}` in .tsx files and
// Tailwind arbitrary values such as `text-[13px]`. No dependencies.
//
//   npm run design:inventory            the summary table
//   npm run design:inventory -- --all   every value with its count
//   npm run design:inventory -- --json  the same as JSON

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const ALL = process.argv.includes('--all');
const JSON_OUT = process.argv.includes('--json');

function walk(dir, test, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, test, out);
    else if (test(rel)) out.push(rel);
  }
  return out;
}

// The tokens file declares the scale; counting it would count the answer.
const CSS = walk('app', (f) => f.endsWith('.css') && !f.endsWith('/tokens.css') && !f.endsWith('/design-system.css'));
// The design system itself (and its gallery) takes every value from the tokens.
const TSX = [...walk('app', (f) => f.endsWith('.tsx') && !f.startsWith('app/design-system/')), ...walk('components', (f) => f.endsWith('.tsx') && !/^components\/ds(-gallery)?\//.test(f))];

const KINDS = {
  'font-size': /^font-size$/,
  'font-weight': /^font-weight$/,
  'line-height': /^line-height$/,
  'letter-spacing': /^letter-spacing$/,
  padding: /^padding(-.+)?$/,
  margin: /^margin(-.+)?$/,
  gap: /^(gap|row-gap|column-gap)$/,
  radius: /^border(-[a-z]+)*-radius$/,
  shadow: /^box-shadow$/,
  duration: /^(transition|transition-duration|animation|animation-duration)$/,
  'z-index': /^z-index$/,
  height: /^(height|min-height)$/,
};
const tally = Object.fromEntries([...Object.keys(KINDS), 'colour', 'breakpoint'].map((k) => [k, new Map()]));
const add = (kind, value, where) => {
  const m = tally[kind];
  const v = value.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!v) return;
  const e = m.get(v) || { n: 0, files: new Set() };
  e.n += 1;
  e.files.add(where);
  m.set(v, e);
};

const COLOUR = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|\b(?:white|black)\b/gi;
const lengths = (v) => v.match(/-?\d*\.?\d+(?:px|rem|em)\b/g) || [];

function declarations(css, where) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const m of clean.matchAll(/@media[^{]*\((?:min|max)-width:\s*([\d.]+)px\)/g)) add('breakpoint', `${m[1]}px`, where);
  for (const m of clean.matchAll(/(?:^|[;{])\s*(-{0,2}[a-z-]+)\s*:\s*([^;{}]+)/g)) {
    const [, prop, value] = m;
    if (prop.startsWith('--')) {
      for (const c of value.match(COLOUR) || []) add('colour', c, where);
      continue;
    }
    for (const c of value.match(COLOUR) || []) add('colour', c, where);
    for (const [kind, re] of Object.entries(KINDS)) {
      if (!re.test(prop)) continue;
      if (kind === 'padding' || kind === 'margin' || kind === 'gap') for (const l of lengths(value)) add(kind, l, where);
      else if (kind === 'duration') for (const d of value.match(/\d*\.?\d+m?s\b/g) || []) add(kind, d.endsWith('ms') ? d : `${Math.round(parseFloat(d) * 1000)}ms`, where);
      else add(kind, value.replace(/!important/, ''), where);
    }
  }
}

for (const f of CSS) declarations(fs.readFileSync(path.join(ROOT, f), 'utf8'), f);

// Inline styles: style={{fontSize:12,margin:'20px 0',…}} → CSS declarations.
const camel = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
for (const f of TSX) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of src.matchAll(/style=\{\{([^}]*)\}\}/g)) {
    const css = m[1].split(',').map((p) => {
      const [k, ...rest] = p.split(':');
      if (!rest.length) return '';
      let v = rest.join(':').trim().replace(/^['"]|['"]$/g, '');
      if (/^\d+(\.\d+)?$/.test(v) && !/weight|z-?index|opacity|flex|line/i.test(k)) v += 'px';
      return `${camel(k.trim())}:${v}`;
    }).join(';');
    declarations(`{${css}}`, f);
  }
  // Tailwind arbitrary values written into a class list.
  const tw = { text: 'font-size', p: 'padding', px: 'padding', py: 'padding', pt: 'padding', pb: 'padding', pl: 'padding', pr: 'padding', m: 'margin', mx: 'margin', my: 'margin', mt: 'margin', mb: 'margin', gap: 'gap', rounded: 'radius', z: 'z-index', shadow: 'shadow' };
  for (const m of src.matchAll(/\b(text|p[xytblr]?|m[xytblr]?|gap|rounded|z|shadow)-\[([^\]\s]+)\]/g)) {
    const kind = tw[m[1]];
    if (m[1] === 'text' && /^#|rgb|hsl/.test(m[2])) add('colour', m[2], f);
    else if (kind) add(kind, m[2], f);
  }
  for (const c of (src.match(/["'`](#[0-9a-fA-F]{3,8})["'`]/g) || [])) add('colour', c.slice(1, -1), f);
}

const order = (a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0) || a.localeCompare(b);
const result = {};
for (const [kind, m] of Object.entries(tally)) {
  const values = [...m.entries()].sort((a, b) => order(a[0], b[0])).map(([v, e]) => ({ value: v, uses: e.n, files: e.files.size }));
  result[kind] = { distinct: values.length, uses: values.reduce((n, v) => n + v.uses, 0), values };
}

if (JSON_OUT) {
  console.log(JSON.stringify({ files: { css: CSS.length, tsx: TSX.length }, result }, null, 2));
} else {
  console.log(`\n  The Studio's values, measured across ${CSS.length} stylesheets and ${TSX.length} components\n`);
  console.log('  kind              distinct   uses');
  for (const [kind, r] of Object.entries(result)) console.log(`  ${kind.padEnd(16)} ${String(r.distinct).padStart(8)} ${String(r.uses).padStart(6)}`);
  if (ALL) {
    for (const [kind, r] of Object.entries(result)) {
      console.log(`\n  ${kind}`);
      for (const v of r.values) console.log(`    ${String(v.uses).padStart(5)}  ${v.value}`);
    }
  }
  console.log('');
}
