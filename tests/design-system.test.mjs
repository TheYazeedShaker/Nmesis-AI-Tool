// The design system's own rules (docs/design-system.md): the tokens, the
// component stylesheet, the components' markup and words, the gallery's access
// rule and the check:design guard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = new URL('../', import.meta.url);
const rootPath = path.resolve(new URL('.', ROOT).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const nodeRequire = createRequire(import.meta.url);

// A tiny CommonJS loader for the components: TypeScript → CJS, '@/…' and
// relative imports resolved inside the repository, packages from node_modules.
const cache = new Map();
function load(file) {
  const abs = path.resolve(file);
  if (cache.has(abs)) return cache.get(abs).exports;
  const mod = { exports: {} };
  cache.set(abs, mod);
  const code = ts.transpileModule(readFileSync(abs, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const req = (spec) => {
    const target = spec.startsWith('@/') ? path.join(rootPath, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(abs), spec) : null;
    if (!target) return nodeRequire(spec);
    if (target.endsWith('.json') && existsSync(target)) return JSON.parse(readFileSync(target, 'utf8'));
    for (const ext of ['', '.tsx', '.ts', '/index.ts']) if (existsSync(target + ext) && !target.endsWith('/') && (ext || /\.(tsx?|mjs|js)$/.test(target))) return load(target + ext);
    throw new Error(`Cannot resolve ${spec} from ${abs}`);
  };
  new Function('require', 'module', 'exports', code)(req, mod, mod.exports);
  return mod.exports;
}
const ds = (name) => load(path.join(rootPath, 'components', 'ds', `${name}.tsx`));
const h = React.createElement;
const html = (el) => renderToStaticMarkup(el);

const TOKENS = read('app/tokens.css');
const SYSTEM = read('app/design-system.css');
const definedClasses = new Set([...SYSTEM.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]));
function classesIn(markup) { return [...markup.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/).filter(Boolean)); }
function assertStyled(markup, label) {
  // lucide-react names its own icons (lucide, lucide-lock); they need no rule.
  const missing = [...new Set(classesIn(markup))].filter((c) => !definedClasses.has(c) && !/^lucide(-|$)/.test(c));
  assert.deepEqual(missing, [], `${label}: classes with no rule in app/design-system.css`);
}

// ── Tokens ────────────────────────────────────────────────────────────────
test('every colour token is a light-dark() pair or a fixed brand colour, declared on each theme scope', () => {
  assert.match(TOKENS, /^:root, \.ds-app, \[data-theme\] \{/m, 'colour tokens must be declared on :root, .ds-app and [data-theme]');
  const tokens = TOKENS.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of tokens.matchAll(/light-dark\(([^()]*(\([^()]*\)[^()]*)*)\)/g)) {
    const depth0 = m[1].replace(/\([^()]*\)/g, '');
    assert.equal(depth0.split(',').length, 2, `light-dark() needs exactly two values: ${m[0]}`);
  }
  for (const name of ['--ds-bg', '--ds-panel', '--ds-text', '--ds-muted', '--ds-accent', '--ds-accent-ink', '--ds-accent-text', '--ds-ring', '--ds-danger', '--ds-success', '--ds-warn', '--ds-info']) {
    assert.match(TOKENS, new RegExp(`${name}:`), `${name} is defined`);
  }
});

test('the scales are the documented steps', () => {
  const space = [...TOKENS.matchAll(/--ds-space-(\d+):\s*(\d+)px/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.deepEqual(space.map(([n]) => n), [2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64]);
  for (const [n, px] of space) { assert.equal(n, px, `--ds-space-${n} is ${n}px`); assert.ok(px === 2 || px % 4 === 0, `${px}px is on the 4px base`); }
  const text = [...TOKENS.matchAll(/--ds-text-[\w]+:\s*(\d+)px;\s*--ds-leading-[\w]+:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  assert.deepEqual(text, [10, 11, 12, 13, 14, 16, 20, 24, 32, 44]);
  assert.deepEqual([...TOKENS.matchAll(/--ds-weight-\w+:\s*(\d+)/g)].map((m) => Number(m[1])), [400, 500, 600, 700]);
  assert.deepEqual([...TOKENS.matchAll(/--ds-dur(?:-fast|-slow)?:\s*(\d+)ms/g)].map((m) => Number(m[1])).sort((a, b) => a - b), [120, 200, 320]);
  assert.match(TOKENS, /--ds-control-h:\s*36px/);
  assert.match(TOKENS, /@media \(pointer: coarse\)[\s\S]*--ds-control-h:\s*44px/);
  const z = [...TOKENS.matchAll(/--ds-z-[\w-]+:\s*(\d+)/g)].map((m) => Number(m[1]));
  assert.deepEqual(z, [...z].sort((a, b) => a - b), 'layers are declared lowest first');
});

test('Studio tokens never reuse a Tailwind theme name (that would restyle every shadcn component)', () => {
  const declared = [...TOKENS.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
  const tailwind = /^--(text|font|radius|shadow|leading|tracking|spacing|ease|animate|breakpoint|color|container|blur|inset-shadow|drop-shadow|perspective|aspect)(-|$)/;
  assert.deepEqual(declared.filter((n) => tailwind.test(n)), []);
});

// ── The component stylesheet ──────────────────────────────────────────────
test('design-system.css restyles nothing outside .ds- (no existing screen changes)', () => {
  const css = SYSTEM.replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = [];
  // Selectors of rules outside @keyframes.
  const noFrames = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');
  for (const m of noFrames.matchAll(/([^{};]+)\{/g)) {
    const sel = m[1].trim();
    if (!sel || sel.startsWith('@')) continue;
    // Split on commas outside parentheses (:where(a, b) is one selector).
    let depth = 0, cur = '';
    for (const ch of sel) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { selectors.push(cur.trim()); cur = ''; } else cur += ch; }
    selectors.push(cur.trim());
  }
  const bad = selectors.filter((s) => !/^(\.ds-|\[data-theme)/.test(s));
  assert.deepEqual(bad, []);
});

test('keyframes move only transform and opacity; nothing transitions a layout property', () => {
  for (const m of SYSTEM.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)) {
    for (const p of m[2].matchAll(/([a-z-]+)\s*:/g)) assert.ok(['transform', 'opacity'].includes(p[1]), `@keyframes ${m[1]} animates ${p[1]}`);
  }
  for (const m of SYSTEM.matchAll(/transition:\s*([^;]+);/g)) {
    assert.doesNotMatch(m[1], /\b(width|height|top|left|right|bottom|margin|padding|all)\b/, `transition: ${m[1]}`);
  }
  assert.match(SYSTEM, /@media \(prefers-reduced-motion: reduce\)/);
});

test('only the six breakpoints are used', () => {
  const widths = new Set([...SYSTEM.matchAll(/\((?:max|min)-width:\s*(\d+)px\)/g)].map((m) => Number(m[1])));
  for (const w of widths) assert.ok([1440, 1280, 1024, 768, 480, 360].includes(w), `${w}px is not a breakpoint`);
});

// ── Words ────────────────────────────────────────────────────────────────
test('job words tell the truth about progress, time and money', () => {
  const { jobWords, ordinal, duration } = load(path.join(rootPath, 'lib/ds/words.ts'));
  assert.equal(jobWords({ title: 't', state: 'queued', position: 2 }).status, 'Queued · 2nd in line');
  assert.equal(jobWords({ title: 't', state: 'queued', position: 1 }).status, 'Queued · next');
  assert.equal(jobWords({ title: 't', state: 'queued' }).detail, 'Starts when the provider has room');
  assert.equal(jobWords({ title: 't', state: 'running', stage: 'Rendering frames', progress: 0.624 }).status, 'Rendering frames · 62%');
  assert.equal(jobWords({ title: 't', state: 'running' }).detail, 'The provider has not said how long');
  assert.equal(jobWords({ title: 't', state: 'running', credits: 120 }).money, '120 credits held');
  assert.equal(jobWords({ title: 't', state: 'failed' }).money, 'Nothing was charged');
  assert.equal(jobWords({ title: 't', state: 'failed', charged: 3 }).money, '3 credits were charged for the part that ran');
  assert.equal(jobWords({ title: 't', state: 'done', charged: 1 }).money, 'Used 1 credit');
  assert.equal(jobWords({ title: 't', state: 'cancelled' }).money, 'Nothing was charged');
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 111].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st', '111th']);
  assert.equal(duration(150), 'about 3 minutes');
  assert.equal(duration(42), 'about 40 seconds');
  assert.equal(duration(0), 'less than a minute');
});

test('the credit meter warns at 80% and stops at 100%, with zero and huge numbers', () => {
  const { meterWords } = load(path.join(rootPath, 'lib/ds/words.ts'));
  assert.equal(meterWords({ used: 1599, total: 2000 }).level, 'ok');
  assert.equal(meterWords({ used: 1600, total: 2000 }).level, 'warn');
  assert.equal(meterWords({ used: 2000, total: 2000 }).level, 'out');
  assert.equal(meterWords({ used: 2500, total: 2000 }).left, '0');
  assert.equal(meterWords({ used: 0, total: 0 }).level, 'out');
  assert.equal(meterWords({ used: 98765432, total: 100000000 }).left, '1,234,568');
  assert.equal(meterWords({ used: 5, total: 0, unlimited: true }).left, 'no limit');
});

test('the gallery is open without sign-in only in a local next dev with the flag', () => {
  const { galleryOpenWithoutSignIn, GALLERY_PATH } = load(path.join(rootPath, 'lib/ds/gallery-access.ts'));
  assert.equal(galleryOpenWithoutSignIn({ NODE_ENV: 'development', STUDIO_DESIGN_GALLERY: 'open' }), true);
  assert.equal(galleryOpenWithoutSignIn({ NODE_ENV: 'production', STUDIO_DESIGN_GALLERY: 'open' }), false);
  assert.equal(galleryOpenWithoutSignIn({ NODE_ENV: 'test', STUDIO_DESIGN_GALLERY: 'open' }), false);
  assert.equal(galleryOpenWithoutSignIn({ NODE_ENV: 'development' }), false);
  assert.ok(GALLERY_PATH.test('/design-system') && GALLERY_PATH.test('/design-system/wireframes/home'));
  assert.ok(!GALLERY_PATH.test('/design-systems') && !GALLERY_PATH.test('/'));
  assert.match(read('app/design-system/access.ts'), /!r\.ok \|\| !r\.ctx\.staff\) notFound\(\)/, 'the gallery checks staff on the server');
  // A prerendered page would run the staff check once, at build time.
  for (const page of ['app/design-system/page.tsx', 'app/design-system/wireframes/[screen]/page.tsx']) {
    const src = read(page);
    assert.match(src, /export const dynamic = 'force-dynamic'/, `${page} renders per request`);
    assert.match(src, /await requireStaff\(\)/, `${page} checks staff`);
  }
});

// ── Components: markup, names, and every class styled ─────────────────────
test('a field joins its label, help or error, required and count to its control', () => {
  const { Field, Input } = ds('field');
  const ok = html(h(Field, { label: 'Folder name', help: 'Everybody sees it.', required: true, count: { value: 12, max: 60 }, id: 'name' }, h(Input)));
  assert.match(ok, /<label class="ds-label" for="name">Folder name<span class="ds-req"> \(required\)<\/span><\/label>/);
  assert.match(ok, /aria-describedby="name-help name-count"/);
  assert.doesNotMatch(ok, /aria-invalid/);
  const bad = html(h(Field, { label: 'Folder name', help: 'Everybody sees it.', error: 'A folder needs a name.', id: 'name' }, h(Input)));
  assert.match(bad, /aria-invalid="true"/);
  assert.match(bad, /aria-describedby="name-error"/);
  assert.doesNotMatch(bad, /Everybody sees it/, 'the error replaces the help');
  assertStyled(ok + bad, 'Field');
});

test('buttons: busy keeps the words; an icon alone has a name', () => {
  const { Button, IconButton } = ds('button');
  const busy = html(h(Button, { kind: 'primary', busy: true }, 'Saving'));
  assert.match(busy, /aria-busy="true"/);
  assert.match(busy, /Saving<\/button>/);
  assert.match(busy, /type="button"/);
  const icon = html(h(IconButton, { label: 'Settings' }, h('svg')));
  assert.match(icon, /aria-label="Settings"/);
  assertStyled(busy + icon + html(h(Button, { kind: 'danger', size: 'sm' }, 'x')) + html(h(Button, { kind: 'quiet', block: true }, 'x')), 'Button');
});

test('the job card: a progress bar only while live, Cancel only where allowed, money after a failure', () => {
  const { JobCard } = ds('job-card');
  const running = html(h(JobCard, { job: { title: 'Film', state: 'running', stage: 'Rendering', progress: 0.5, credits: 120, cancellable: true }, onCancel: () => {} }));
  assert.match(running, /role="progressbar"[^>]*aria-valuenow="50"/);
  assert.match(running, />Cancel</);
  const unknown = html(h(JobCard, { job: { title: 'Upscale', state: 'running', cancellable: false }, onCancel: () => {} }));
  assert.match(unknown, /data-indeterminate="true"/);
  assert.doesNotMatch(unknown, /aria-valuenow/);
  assert.doesNotMatch(unknown, />Cancel</, 'no Cancel where the provider does not allow it');
  const failed = html(h(JobCard, { job: { title: 'Line-up', state: 'failed', error: 'The picture could not be read.' }, onRetry: () => {} }));
  assert.doesNotMatch(failed, /progressbar/);
  assert.match(failed, /Nothing was charged/);
  assert.match(failed, />Try again</);
  assertStyled(running + unknown + failed, 'JobCard');
});

test('states, upsell, badges and skeletons', () => {
  const { State, Upsell, Badge, SkeletonTile, SkeletonRow, SkeletonPanel, Loading } = ds('feedback');
  const err = html(h(State, { kind: 'error', title: 'Could not load', actions: 'x' }, 'Nothing changed.'));
  assert.match(err, /role="alert"/);
  const upsellInTile = html(h('a', { href: '#ask' }, h(Upsell, { plan: 'Growth' })));
  assert.equal((upsellInTile.match(/<a /g) || []).length, 1, 'no link inside a link');
  assert.match(upsellInTile, /Available on Growth/);
  const all = err + upsellInTile + html(h(Upsell, { plan: 'Enterprise', href: '#ask' })) + html(h(Badge, { kind: 'warn' }, '85%')) +
    html(h(Loading, { label: 'Loading' }, h(SkeletonTile), h(SkeletonRow), h(SkeletonPanel))) + html(h(State, { kind: 'no-results', title: 'x' })) + html(h(State, { kind: 'empty', title: 'x' }));
  assertStyled(all, 'feedback');
});

test('the shell: meter, switcher, support status, viewing-as and navigation are named and styled', () => {
  const { TopBar, PhoneNav, CreditMeter, CompanySwitcher, SupportStatus, ViewingAs, Banner, DEFAULT_NAV, AppShell } = ds('shell');
  const meter = html(h(CreditMeter, { meter: { used: 1700, total: 2000 } }));
  assert.match(meter, /data-level="warn"/);
  assert.match(meter, /aria-label="Credits: 1,700 credits used, 300 credits left this period \(85%\)\. Open Usage\."/);
  const companies = [{ id: 'a', name: 'Demo Company' }, { id: 'b', name: 'Sample Auto' }];
  const markup = meter + html(h(CompanySwitcher, { current: companies[0], companies, onSwitch: () => {} })) + html(h(SupportStatus, { until: null })) +
    html(h(SupportStatus, { until: '21 Nov', href: '/company' })) + html(h(ViewingAs, { company: 'Demo Company', onLeave: () => {} })) + html(h(Banner, { kind: 'bad' }, 'Ended')) +
    html(h(AppShell, { nav: DEFAULT_NAV('home'), topEnd: null }, 'x')) + html(h(TopBar, { nav: DEFAULT_NAV('library'), end: null })) + html(h(PhoneNav, { nav: DEFAULT_NAV('home') }));
  assert.match(markup, /aria-current="page"/);
  assert.match(markup, /href="#main">Skip to content/);
  assertStyled(markup, 'shell');
});

test('media tiles: a real button opens, selection is a named tick box, Move to… is in the menu', () => {
  const { MediaTile, MediaGrid, BulkBar } = ds('media');
  const tile = html(h(MediaGrid, { label: 'Library' }, h(MediaTile, { item: { id: '1', name: 'Demo SUV', sub: 'Today', status: { kind: 'bad', label: 'Failed' } }, selected: true, onSelect: () => {}, onOpen: () => {}, onMove: () => {}, onDelete: () => {} })));
  assert.match(tile, /<button type="button" class="ds-tile-open"><span class="ds-sr-only">Open Demo SUV<\/span><\/button>/);
  assert.match(tile, /aria-label="Select Demo SUV"/);
  assert.match(tile, /aria-haspopup="menu"/);
  assert.doesNotMatch(tile, /aria-selected/, 'aria-selected is not allowed on a listitem');
  const bar = html(h(BulkBar, { count: 2, onClear: () => {} }, 'x'));
  assert.match(bar, /2 items selected/);
  assert.equal(html(h(BulkBar, { count: 0, onClear: () => {} }, 'x')), '');
  assertStyled(tile + bar, 'media');
});

test('tabs read the open tab from the address', () => {
  const { readTabFromHash, Tabs } = ds('tabs');
  assert.equal(readTabFromHash('#tab=tools', ['people', 'tools']), 'tools');
  assert.equal(readTabFromHash('#tab=nope', ['people', 'tools']), null);
  assert.equal(readTabFromHash('#x=1&tab=people', ['people', 'tools']), 'people');
  const markup = html(h(Tabs, { label: 'Usage', tabs: [{ id: 'a', label: 'A', panel: 'pa' }, { id: 'b', label: 'B', panel: 'pb' }] }));
  assert.match(markup, /role="tablist"/);
  assert.equal((markup.match(/tabindex="0"/g) || []).length, 3, 'one tab and the visible panels are focusable');
  assertStyled(markup, 'tabs');
});

test('forms controls, combobox, layout and editor render styled', () => {
  const { Checkbox, Radio, RadioGroup, Switch, Slider, Select, Textarea, AffixInput } = ds('field');
  const { Combobox } = ds('combobox');
  const { PageHeader, Section, Fold } = ds('layout');
  const { EditorLayout, GenerateButton } = ds('editor');
  const markup = [
    h(Checkbox, { label: 'Keep colour' }), h(RadioGroup, { legend: 'Orientation' }, h(Radio, { name: 'o', label: 'Landscape' })),
    h(Switch, { label: 'Allow', checked: true, onChange: () => {} }), h(Slider, { value: 6, onValueChange: () => {}, format: (v) => `${v} s` }),
    h(Select, null, h('option', null, 'a')), h(Textarea), h(AffixInput, { affix: 'seconds' }),
    h(Combobox, { options: [{ value: 'a', label: 'Demo SUV' }], value: 'a', onChange: () => {} }),
    h(PageHeader, { title: 'Library', lede: 'One line.', actions: 'x' }), h(Section, { title: 'Recent', count: '6 of 300' }, 'x'), h(Fold, { name: 'f', title: 'Advanced', summary: '2K' }, 'x'),
    h(EditorLayout, { name: 'kv', tools: [{ id: 's', label: 'Scene', icon: h('svg') }], tool: 's', onTool: () => {}, canvas: 'c', settings: 's', generate: h(GenerateButton, { cost: 4, onGenerate: () => {} }) }),
  ].map(html).join('');
  assert.match(markup, /role="switch"/);
  assert.match(markup, /aria-valuetext="6 s"/);
  assert.match(markup, /Generate<span class="ds-btn-meta">· 4 credits<\/span>/, 'Generate shows its cost before it is pressed');
  assert.match(markup, /role="combobox"/);
  assertStyled(markup, 'controls');
});

// ── No browser dialogs; the guard passes ──────────────────────────────────
test('the design system never calls confirm(), alert() or prompt()', () => {
  for (const dir of ['components/ds', 'components/ds-gallery']) {
    for (const f of readdirSync(new URL(`${dir}/`, ROOT))) {
      const src = read(`${dir}/${f}`).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
      assert.doesNotMatch(src, /(^|[^.\w$])(window\.)?(confirm|alert|prompt)\s*\(/, `${dir}/${f}`);
    }
  }
});

test('npm run check:design passes against its baseline', () => {
  const r = spawnSync(process.execPath, ['scripts/check-design.mjs'], { cwd: rootPath, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const base = JSON.parse(read('scripts/design-baseline.json'));
  for (const f of Object.keys(base.counts)) assert.ok(!/^(app\/(tokens|design-system)\.css|components\/ds(-gallery)?\/)/.test(f), `${f} is new and must have no violations`);
});
