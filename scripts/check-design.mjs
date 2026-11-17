// npm run check:design
//
// Holds the Studio to its design system (app/tokens.css, app/design-system.css,
// docs/design-system.md). It counts five kinds of mechanical mistake that a
// person reading a diff does not catch:
//
//   unknown-class     a class in a className that no stylesheet (ours, or the
//                     Tailwind utilities the build would generate) defines;
//   browser-dialog    confirm(), alert() or prompt(): they cannot name what is
//                     about to be lost and put OK on Enter;
//   raw-colour        a colour written out instead of taken from a token;
//   raw-size          a text size, padding, margin, gap or corner written as a
//                     number instead of a token (CSS, style={{…}}, and Tailwind
//                     arbitrary values such as p-[7px]);
//   unstyled-control  a <button>, <input>, <select> or <textarea> with no class,
//                     which the browser then draws in its own style.
//
// HOW IT RATCHETS. What is wrong today is written down, with counts, in
// scripts/design-baseline.json. The check passes while every count stays the
// same or goes down, and fails the moment one goes up or a new file has one.
// Lower the numbers by fixing screens; never raise one to make the check pass.
//
//   npm run check:design               did anything get worse?
//   npm run check:design -- --list     every violation, with its line
//   npm run check:design -- --update   write the baseline as it is now (only after
//                                      deliberately fixing things; say so in the PR)
//
// Uses @tailwindcss/node (already installed with Tailwind) to ask the real
// Tailwind compiler which utilities exist. No network, no other dependency.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const BASELINE = path.join(HERE, 'design-baseline.json');
const args = new Set(process.argv.slice(2));
const LIST = args.has('--list');
const UPDATE = args.has('--update');

function walk(dir, test, out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const r = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(r, test, out);
    else if (test(r)) out.push(r);
  }
  return out.sort();
}
const read = (r) => fs.readFileSync(path.join(ROOT, r), 'utf8');

// ── What is checked ──────────────────────────────────────────────────────
const CSS_FILES = walk('app', (f) => f.endsWith('.css'));
const TSX_FILES = [...walk('app', (f) => f.endsWith('.tsx')), ...walk('components', (f) => f.endsWith('.tsx'))];
const TS_FILES = [...walk('app', (f) => /\.(ts|mts)$/.test(f)), ...walk('lib', (f) => /\.(ts|tsx|mts)$/.test(f)), ...walk('hooks', (f) => /\.(ts|tsx)$/.test(f))];
// The tokens file is where numbers are supposed to live.
const TOKENS = 'app/tokens.css';

// ── Helpers ──────────────────────────────────────────────────────────────
const lineAt = (src, index) => src.slice(0, index).split('\n').length;
function blank(s) { return s.replace(/[^\n]/g, ' '); }
function stripCssComments(src) { return src.replace(/\/\*[\s\S]*?\*\//g, blank); }
function stripJsComments(src) {
  // Block comments, then line comments that are not inside a URL ("https://").
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, p1) => p1 + blank(m.slice(p1.length)));
}
// CSS.escape, for looking a Tailwind class up in compiled CSS.
function cssEscape(name) {
  let out = '';
  for (let i = 0; i < name.length; i++) {
    const ch = name[i];
    if (/[A-Za-z0-9_-]/.test(ch) || ch.charCodeAt(0) >= 0x80) out += (i === 0 && /[0-9]/.test(ch)) ? `\\3${ch} ` : ch;
    else out += `\\${ch}`;
  }
  return out;
}

// ── Class names used in a .tsx file ──────────────────────────────────────
// className="a b", className='a b', and the string literals inside
// className={…} (cn(…), dsClass(…), ternaries). Parts of a template literal
// next to ${…} are skipped: part of that word is a variable.
function balanced(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
    else if (c === '"' || c === "'" || c === '`') {
      const q = c;
      for (i++; i < src.length && src[i] !== q; i++) if (src[i] === '\\') i++;
    }
  }
  return src.length;
}
// Every string literal in a JS expression, as class lists. A quoted value right
// after a comparison (x === 'a') is a value, not a class. Template literals give
// their static text; a word glued to a ${…} is skipped, and the ${…} is read
// for literals of its own.
function literalsIn(expr) {
  const out = [];
  let i = 0;
  const closeOfInterpolation = (from) => {
    let depth = 1, j = from;
    for (; j < expr.length && depth > 0; j++) {
      const c = expr[j];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '"' || c === "'") { const q = c; for (j++; j < expr.length && expr[j] !== q; j++) if (expr[j] === '\\') j++; }
      else if (c === '`') { j = skipTemplate(j); }
    }
    return j - 1;
  };
  const skipTemplate = (start) => {
    let j = start + 1;
    for (; j < expr.length && expr[j] !== '`'; j++) {
      if (expr[j] === '\\') j++;
      else if (expr[j] === '$' && expr[j + 1] === '{') j = closeOfInterpolation(j + 2);
    }
    return j;
  };
  while (i < expr.length) {
    const c = expr[i];
    if (c === '"' || c === "'") {
      let j = i + 1, text = '';
      for (; j < expr.length && expr[j] !== c; j++) { if (expr[j] === '\\') j++; text += expr[j]; }
      // Not a class: a value compared against (x === 'a'), or a variant's
      // name in a cva() table (size: "sm", defaultVariants: { variant: "default" }).
      const before = expr.slice(Math.max(0, i - 24), i);
      if (!/(===|!==|==|!=|case)\s*$/.test(before) && !/\b(variant|size|orientation|align|side|position|type|kind|spacing|inset)\s*:\s*$/.test(before)) out.push(text);
      i = j + 1;
    } else if (c === '`') {
      const parts = [''];
      let j = i + 1;
      for (; j < expr.length && expr[j] !== '`'; j++) {
        if (expr[j] === '\\') { j++; parts[parts.length - 1] += expr[j]; }
        else if (expr[j] === '$' && expr[j + 1] === '{') {
          const end = closeOfInterpolation(j + 2);
          out.push(...literalsIn(expr.slice(j + 2, end)));
          parts.push('');
          j = end;
        } else parts[parts.length - 1] += expr[j];
      }
      parts.forEach((p, k) => {
        const words = p.split(/\s+/);
        if (k > 0 && !/^\s/.test(p)) words.shift();                      // glued to the ${…} before it
        if (k < parts.length - 1 && !/\s$/.test(p)) words.pop();          // glued to the ${…} after it
        out.push(words.join(' '));
      });
      i = j + 1;
    } else i++;
  }
  return out;
}
const CLASS_TOKEN = /^-?[A-Za-z_!@[*&>:.][^\s'"`{}]*$/;
function classesUsedIn(src) {
  const used = [];
  const add = (list, index) => {
    for (const one of list.split(/\s+/)) {
      if (!one || !CLASS_TOKEN.test(one) || /^(true|false|undefined|null)$/.test(one)) continue;
      if (one.endsWith('-')) continue;                       // a prefix joined to a variable ('status-' + x)
      if (/^(group|peer)(\/[\w-]+)?$/.test(one)) continue;    // Tailwind markers: no rule of their own by design
      used.push({ name: one, line: lineAt(src, index) });
    }
  };
  for (const m of src.matchAll(/\bclassName\s*=\s*(["'])([^"']*)\1/g)) add(m[2], m.index);
  for (const m of src.matchAll(/\bclassName\s*=\s*\{/g)) {
    const open = m.index + m[0].length - 1;
    const expr = src.slice(open + 1, balanced(src, open));
    for (const lit of literalsIn(expr)) add(lit, m.index);
  }
  // cn(…) / cva(…) / dsClass(…) outside a className= (shadcn builds variants).
  for (const m of src.matchAll(/\b(cn|cva|dsClass|clsx)\(/g)) {
    let depth = 0, i = m.index + m[0].length - 1;
    for (; i < src.length; i++) { if (src[i] === '(') depth++; else if (src[i] === ')' && --depth === 0) break; }
    for (const lit of literalsIn(src.slice(m.index + m[0].length, i))) add(lit, m.index);
  }
  return used;
}

// ── Which classes exist ──────────────────────────────────────────────────
const ourCss = [...CSS_FILES.map(read), ...walk('vendor', (f) => f.endsWith('.css')).map(read)].map(stripCssComments).join('\n');
const ourClasses = new Set([...ourCss.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]));

async function tailwindKnows(candidates) {
  const { compile } = await import('@tailwindcss/node');
  const base = path.join(ROOT, 'app');
  const compiler = await compile(read('app/globals.css'), { base, onDependency() {} });
  const out = compiler.build([...candidates]);
  return (name) => out.includes(`.${cssEscape(name)}`);
}

// ── Values that may be written out ───────────────────────────────────────
const SIZE_PROP = /^(font-size|padding(-(top|right|bottom|left|inline|block)(-(start|end))?)?|margin(-(top|right|bottom|left|inline|block)(-(start|end))?)?|gap|row-gap|column-gap|border(-(top|bottom)-(left|right))?-radius|border-(start|end)-(start|end)-radius)$/;
const COLOUR_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/;
function sizeIsFine(value) {
  // Strip var(…) (and any fallback inside it); what is left may not hold a length.
  let s = value.replace(/!important/, '').trim().toLowerCase();
  for (let k = 0; k < 5 && s.includes('var('); k++) s = s.replace(/var\([^()]*(\([^()]*\)[^()]*)*\)/g, ' ');
  s = s.trim();
  if (!s || /^(0|0px|auto|inherit|initial|unset|revert|normal|none)$/.test(s)) return true;
  return !/(^|[^\w.#-])-?\d*\.?\d+(px|rem|em|pt|vh|vw|vmin|vmax|ch|ex|svh|dvh|lvh)(?![\w-])/.test(s);
}

// ── The checks ───────────────────────────────────────────────────────────
function checkCss(r) {
  const src = stripCssComments(read(r));
  const found = [];
  for (const m of src.matchAll(/(^|[;{])\s*(-{0,2}[a-zA-Z-]+)\s*:\s*([^;{}]+)/g)) {
    const [, , prop, value] = m;
    if (prop.startsWith('--')) continue;            // declaring a token
    const at = lineAt(src, m.index + m[1].length);
    if (r !== TOKENS && COLOUR_RE.test(value) && !/^\s*var\(/.test(value)) found.push({ rule: 'raw-colour', line: at, text: `${prop}: ${value.trim()}` });
    if (r !== TOKENS && SIZE_PROP.test(prop.toLowerCase()) && !sizeIsFine(value)) found.push({ rule: 'raw-size', line: at, text: `${prop}: ${value.trim()}` });
  }
  return found;
}

const camel = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const TW_SIZE = /(?:^|[\s"'`:])(-?(?:text|p[xytblrse]?|m[xytblrse]?|gap(?:-[xy])?|rounded(?:-[a-z]{1,2})?)-\[(?!var\()[^\]\s]*\d[^\]\s]*\])/g;
const TW_COLOUR = /(?:^|[\s"'`:])((?:bg|text|border|ring|fill|stroke|from|to|via|outline|shadow|decoration|caret|accent)-\[(?:#|rgb|hsl|oklch)[^\]\s]*\])/g;

function checkTsx(r, known) {
  const raw = read(r);
  const src = stripJsComments(raw);
  const found = [];

  // 1 · classes nothing defines
  const seen = new Set();
  for (const { name, line } of classesUsedIn(src)) {
    if (seen.has(name)) continue;
    seen.add(name);
    if (ourClasses.has(name) || known(name)) continue;
    found.push({ rule: 'unknown-class', line, text: `class "${name}": no stylesheet has a rule for it` });
  }

  // 3/4 · style={{…}} written out
  for (const m of src.matchAll(/\bstyle\s*=\s*\{\{/g)) {
    const open = m.index + m[0].length - 2;
    const body = src.slice(open + 2, balanced(src, open) - 1);
    for (const p of body.matchAll(/([A-Za-z]+)\s*:\s*((?:'[^']*'|"[^"]*"|`[^`]*`|[^,{}])+)/g)) {
      const prop = camel(p[1]);
      let value = p[2].trim();
      const quoted = /^['"`]/.test(value);
      value = value.replace(/^['"`]|['"`]$/g, '');
      if (!quoted && !/^-?\d*\.?\d+$/.test(value)) continue;   // an expression: not a literal
      if (/^-?\d*\.?\d+$/.test(value) && value !== '0') value += 'px';
      const at = lineAt(src, m.index);
      if (COLOUR_RE.test(value) || /^(white|black)$/i.test(value)) found.push({ rule: 'raw-colour', line: at, text: `style ${p[1]}: ${value}` });
      if (SIZE_PROP.test(prop) && !sizeIsFine(value)) found.push({ rule: 'raw-size', line: at, text: `style ${p[1]}: ${value}` });
    }
  }
  // Tailwind arbitrary values
  for (const m of src.matchAll(TW_SIZE)) found.push({ rule: 'raw-size', line: lineAt(src, m.index), text: `${m[1]}: a size off the scale` });
  for (const m of src.matchAll(TW_COLOUR)) found.push({ rule: 'raw-colour', line: lineAt(src, m.index), text: `${m[1]}: a colour written out` });

  // 2 · browser dialogs
  found.push(...dialogs(src));

  // 5 · native controls wearing nothing
  for (const m of src.matchAll(/<(button|input|select|textarea)\b((?:[^>{}]|\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})*)>/g)) {
    const attrs = m[2];
    if (/\bclassName\s*=/.test(attrs)) continue;
    if (/\btype\s*=\s*["'](hidden|file)["']/.test(attrs)) continue;   // never drawn / always behind a styled label
    if (/\{\s*\.\.\./.test(attrs)) continue;                          // props spread: the caller passes the class
    const before = src.slice(Math.max(0, m.index - 300), m.index);
    // Dressed by a component around it (label.ds-check, span.ds-affix …) that
    // opened just before it.
    if (WRAPPERS.some((w) => before.includes(w))) continue;
    found.push({ rule: 'unstyled-control', line: lineAt(src, m.index), text: `<${m[1]}> with no class: the browser draws its own` });
  }
  return found;
}

function dialogs(src) {
  const out = [];
  for (const m of src.matchAll(/(?:^|[^.\w$])((?:window\.|globalThis\.)?(?:confirm|alert|prompt))\s*\(/g)) {
    out.push({ rule: 'browser-dialog', line: lineAt(src, m.index), text: `${m[1]}(): use useConfirm() or useToast() (components/ds)` });
  }
  return out;
}

// Components that dress the control inside them (the rules hang off the label).
const WRAPPERS = ['ds-upsell', 'ds-check', 'ds-radio', 'ds-switch', 'ds-affix', 'ds-search', 'ds-slider', 'ds-tile-select', 'ds-ask', 'ds-segmented'];

const RULES = ['unknown-class', 'browser-dialog', 'raw-colour', 'raw-size', 'unstyled-control'];
const WORDS = {
  'unknown-class': 'classes nothing styles',
  'browser-dialog': 'confirm() / alert() / prompt()',
  'raw-colour': 'colours written out',
  'raw-size': 'sizes off the scale',
  'unstyled-control': 'controls with no class',
};

// ── Run ──────────────────────────────────────────────────────────────────
const candidates = new Set();
for (const r of TSX_FILES) for (const { name } of classesUsedIn(stripJsComments(read(r)))) if (!ourClasses.has(name)) candidates.add(name);
let known = () => false;
try { known = await tailwindKnows(candidates); }
catch (e) { console.error(`Could not ask Tailwind which utilities exist (${e instanceof Error ? e.message : e}). Run npm ci.`); process.exit(2); }

const detail = {};
const now = {};
const record = (r, found) => {
  if (!found.length) return;
  detail[r] = found;
  now[r] = {};
  for (const rule of RULES) { const n = found.filter((f) => f.rule === rule).length; if (n) now[r][rule] = n; }
};
for (const r of CSS_FILES) record(r, checkCss(r));
for (const r of TSX_FILES) record(r, checkTsx(r, known));
for (const r of TS_FILES) record(r, dialogs(stripJsComments(read(r))));

const total = (counts) => Object.values(counts).reduce((n, f) => n + Object.values(f).reduce((a, b) => a + b, 0), 0);

if (UPDATE) {
  const sorted = Object.fromEntries(Object.keys(now).sort().map((k) => [k, now[k]]));
  fs.writeFileSync(BASELINE, `${JSON.stringify({
    note: 'What is wrong today, so nothing can get worse tomorrow. npm run check:design -- --list shows each one. Lower these by fixing screens; never raise one to make the check pass.',
    measured: new Date().toISOString().slice(0, 10),
    counts: sorted,
  }, null, 2)}\n`);
  console.log(`Baseline written: ${Object.keys(now).length} files, ${total(now)} things to fix.`);
  process.exit(0);
}

let base;
try { base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); }
catch { console.error('No baseline yet. Run: npm run check:design -- --update'); process.exit(2); }

const worse = [], better = [];
for (const r of new Set([...Object.keys(now), ...Object.keys(base.counts)])) {
  for (const rule of RULES) {
    const had = base.counts[r]?.[rule] || 0, has = now[r]?.[rule] || 0;
    if (has > had) worse.push({ r, rule, had, has });
    else if (has < had) better.push({ r, rule, had, has });
  }
}

console.log('\n  The Studio against its design system');
console.log('  ─────────────────────────────────────────────────────────');
for (const rule of RULES) {
  const had = Object.values(base.counts).reduce((n, f) => n + (f[rule] || 0), 0);
  const has = Object.values(now).reduce((n, f) => n + (f[rule] || 0), 0);
  const move = has === had ? '' : has < had ? `  ↓ ${had - has} fewer` : `  ↑ ${has - had} MORE`;
  console.log(`  ${String(has).padStart(5)}  ${WORDS[rule].padEnd(36)}${move}`);
}
console.log('  ─────────────────────────────────────────────────────────');
console.log(`  ${String(total(now)).padStart(5)}  in total, against a baseline of ${total(base.counts)}\n`);

if (LIST) {
  for (const r of Object.keys(detail).sort()) {
    console.log(`  ${r}`);
    for (const f of detail[r].sort((a, b) => a.line - b.line)) console.log(`    ${String(f.line).padStart(5)}  ${f.rule.padEnd(17)} ${f.text.slice(0, 140)}`);
    console.log('');
  }
}
if (better.length) {
  console.log('  Better than the baseline:');
  for (const b of better) console.log(`    ${b.r}: ${WORDS[b.rule]} ${b.had} → ${b.has}`);
  console.log('\n  Lock the improvement in with: npm run check:design -- --update\n');
}
if (worse.length) {
  console.log('  ✗ Something got worse, so this fails:');
  for (const w of worse) {
    console.log(`    ${w.r}: ${WORDS[w.rule]} ${w.had} → ${w.has}`);
    for (const f of (detail[w.r] || []).filter((f) => f.rule === w.rule).slice(0, 6)) console.log(`        line ${f.line}: ${f.text.slice(0, 140)}`);
  }
  console.log('\n  /design-system shows one of everything; docs/design-system.md says which to use when.\n');
  process.exit(1);
}
console.log('  ✓ Nothing got worse.\n');
