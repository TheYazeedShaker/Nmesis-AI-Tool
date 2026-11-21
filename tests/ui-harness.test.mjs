// The UI harness's planning pieces (no browser): which screens a change can
// affect (scripts/ui/affected.mjs), how a run is cut into shards
// (scripts/ui/screens.mjs), the ratchet (scripts/ui/ratchet.mjs) and the merge
// of CI's shards (scripts/ui/merge.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { affected, importsOf, resolveImport, pageFor, readTree } from '../scripts/ui/affected.mjs';
import { SCREENS, SCREEN_IDS, selectScreens, pageJobs, shardJobs, shardCount } from '../scripts/ui/screens.mjs';
import { RATCHETED, PER_SCREEN, countsOf, countsByScreen, compare, updatedBaseline, formatBaseline } from '../scripts/ui/ratchet.mjs';
import { mergeReports, isFullRun } from '../scripts/ui/merge.mjs';

// A small synthetic app, laid out as the Studio is.
const tree = (extra = {}) => new Map(Object.entries({
  'app/layout.tsx': "import './globals.css';\nimport { Providers } from '@/components/studio-providers';",
  'app/globals.css': '',
  'app/page.tsx': "import { Home } from '@/components/workspace/home';",
  'app/usage/page.tsx': "import { Meter } from '../../components/meter';\nimport './usage.css';",
  'app/usage/usage.css': '',
  'app/usage/notes.txt': '',
  'app/films/page.tsx': "import { Films } from '@/components/editor/films-parts';",
  'app/projects/page.tsx': "import { Projects } from '@/components/workspace/projects';",
  'app/projects/[id]/page.tsx': "import { Projects } from '@/components/workspace/projects';",
  'app/api/films/route.ts': "import { listFilms } from '@/lib/films';",
  'app/api/films/[id]/route.ts': "import { oneFilm } from '@/lib/films';",
  'app/api/swaps/route.ts': "import { listSwaps } from '@/lib/swaps';",
  'app/api/unused/route.ts': "import { x } from '@/lib/only-unused';",
  'components/studio-providers.tsx': '',
  'components/meter.tsx': "export const Meter = () => null; // reads /api/usage-free",
  'components/workspace/home.tsx': "import { remove } from './data';",
  'components/workspace/data.ts': "const PATH = { swap: 'swaps' }; await send(`/api/${PATH[kind]}/${id}`);",
  'components/workspace/projects.tsx': "export const Projects = () => fetch('/api/films?x=1');",
  'components/editor/films-parts.tsx': "import worker from './w.mjs';\nconst w = new Worker('/object.worker.js');",
  'components/editor/w.mts': '',
  'components/dead.tsx': '',
  'lib/films.ts': "import { db } from './db';",
  'lib/db.ts': '',
  'lib/swaps.ts': '',
  'lib/only-unused.ts': '',
  'public/object.worker.js': '',
  'public/unused.svg': '',
  ...extra,
}));
const SCR = [
  { id: 'home', path: '/', roles: ['owner'] },
  { id: 'usage', path: '/usage', roles: ['owner'] },
  { id: 'films', path: '/films', roles: ['owner'] },
  { id: 'projects', path: '/projects', roles: ['owner'] },
  { id: 'folder', path: '/projects/0000', roles: ['owner'] },
  { id: 'not-found', path: '/nothing-here', roles: ['owner'] },
];
const map = (files, extra) => affected(files, tree(extra), SCR);

test('affected: imports are read in every form and resolved through @/ and relative paths', () => {
  assert.deepEqual(importsOf("import a from './a';\nimport type { B } from \"@/b\";\nexport * from './c';\nimport './d.css';\nconst e = await import('./e');\n@import url('./f.css');\nnew URL('./g.js', import.meta.url);\nimport {\n x,\n y,\n} from '../h';").sort(),
    ['./a', './c', './d.css', './e', './f.css', './g.js', '../h', '@/b'].sort());
  const files = tree();
  assert.equal(resolveImport('@/lib/films', 'app/api/films/route.ts', files), 'lib/films.ts');
  assert.equal(resolveImport('../../components/meter', 'app/usage/page.tsx', files), 'components/meter.tsx');
  assert.equal(resolveImport('./w.mjs', 'components/editor/films-parts.tsx', files), 'components/editor/w.mts');
  assert.equal(resolveImport('react', 'app/page.tsx', files), null);
  assert.equal(pageFor('/', files), 'app/page.tsx');
  assert.equal(pageFor('/projects/0000', files), 'app/projects/[id]/page.tsx');
  assert.equal(pageFor('/projects', files), 'app/projects/page.tsx');
  assert.equal(pageFor('/nothing-here', files), null);
});

test('affected: a page, its route folder and what it imports map to that screen', () => {
  assert.deepEqual(map(['app/usage/page.tsx']).screens, ['usage']);
  assert.deepEqual(map(['app/usage/usage.css', 'app/usage/notes.txt']).screens, ['usage']);
  assert.deepEqual(map(['components/meter.tsx']).screens, ['usage']);
  // The deepest route folder: /projects/[id] is the folder screen, not projects.
  assert.deepEqual(map(['app/projects/[id]/page.tsx']).screens, ['folder']);
  assert.deepEqual(map(['app/projects/page.tsx']).screens, ['projects']);
  assert.deepEqual(map(['components/workspace/projects.tsx']).screens, ['projects', 'folder']);
  assert.deepEqual(map(['components/editor/w.mts']).screens, ['films']);
  assert.equal(map(['app/usage/page.tsx']).full, false);
});

test('affected: an API route maps to the screens that call it, with what the route imports', () => {
  // projects.tsx fetches /api/films (projects, folder).
  assert.deepEqual(map(['app/api/films/[id]/route.ts']).screens, ['projects', 'folder']);
  assert.deepEqual(map(['lib/db.ts']).screens, ['projects', 'folder']);
  // A URL built at run time: the routes its file spells out ('swaps').
  assert.deepEqual(map(['lib/swaps.ts']).screens, ['home']);
  // "/api/usage-free" is not a route: nothing calls /api/usage.
  assert.equal(map(['app/api/unused/route.ts']).full, true);
  // A URL built at run time that names no route: every route.
  const dyn = map(['lib/only-unused.ts'], { 'components/workspace/data.ts': 'await send(`/api/${kind}`);' });
  assert.deepEqual(dyn.screens, ['home']);
});

test('affected: public files by their URL', () => {
  assert.deepEqual(map(['public/object.worker.js']).screens, ['films']);
  assert.equal(map(['public/unused.svg']).full, true);
});

test('affected: the shell and the design system mean every screen; docs and tests none', () => {
  for (const f of ['app/layout.tsx', 'app/tokens.css', 'app/design-system.css', 'app/studio-shell.css', 'app/workspace.css', 'app/globals.css', 'components/ds/button.tsx',
    'components/studio-topbar.tsx', 'components/studio-account.tsx', 'components/credits.tsx', 'components/studio-providers.tsx', 'components/workspace/frame.tsx',
    'lib/accounts/plan.ts', 'lib/studio-context.ts', 'proxy.ts', 'next.config.ts', 'package.json', 'package-lock.json', 'scripts/check-ui.mjs', 'scripts/ui/checks.mjs',
    'scripts/ui-baseline.json', 'supabase/migrations/0009_x.sql', 'docs/supabase-setup.sql', '.github/workflows/ci.yml', 'app/api/auth/password/route.ts']) {
    const r = map([f]);
    assert.equal(r.full, true, f);
    assert.deepEqual(r.screens, SCR.map((s) => s.id), f);
  }
  for (const f of ['docs/design-audit/harness.md', 'README.md', 'tests/films.test.mjs', 'PROGRESS.md', '.github/dependabot.yml', 'scripts/check-design.mjs', 'eslint.config.mjs']) {
    assert.deepEqual(map([f]), { full: false, screens: [], why: { [f]: 'no screen' } }, f);
  }
  assert.deepEqual(map(['docs/a.md', 'tests/b.test.mjs']).screens, []);
  // Unknown files, app code no screen reaches, and deleted app code: every screen.
  assert.equal(map(['some-new-config.yaml']).full, true);
  assert.equal(map(['components/dead.tsx']).full, true);
  assert.equal(map(['components/gone.tsx']).full, true);
  // One full file in the change is enough.
  assert.equal(map(['app/usage/page.tsx', 'app/tokens.css']).full, true);
  // Windows paths are read too.
  assert.deepEqual(map(['app\\usage\\page.tsx']).screens, ['usage']);
});

test('affected: on this repository, the tools and the workspace map as expected', () => {
  const files = readTree();
  const on = (f) => affected([f], files);
  assert.deepEqual(on('app/usage/page.tsx').screens, ['usage']);
  assert.deepEqual(on('app/signin/page.tsx').screens, ['signin']);
  assert.deepEqual(on('app/signin/forgot/page.tsx').screens, ['forgot-password']);
  assert.deepEqual(on('app/projects/[id]/page.tsx').screens, ['folder']);
  const editor = on('components/editor/editor-screen.tsx').screens;
  for (const id of ['workspace', 'settings', 'lineup', 'films', 'swap', 'storyboard']) assert.ok(editor.includes(id), id);
  assert.ok(!editor.includes('usage') && !editor.includes('signin'));
  const films = on('components/editor/films-parts.tsx').screens;
  assert.ok(films.includes('films') && !films.includes('lineup'));
  const home = on('components/workspace/home.tsx').screens;
  for (const id of ['home', 'library', 'projects', 'folder', 'viewer']) assert.ok(home.includes(id), id);
  assert.ok(!home.includes('films') && !home.includes('usage'));
  assert.equal(on('app/tokens.css').full, true);
  assert.equal(on('components/ds/button.tsx').full, true);
  assert.deepEqual(on('docs/design-audit/harness.md').screens, []);
  // Every screen's path is served by a page, except the one that checks the not-found page.
  for (const s of SCREENS) assert.equal(pageFor(s.path, files) === null, s.id === 'not-found', s.id);
});

test('screens: shards cut the checks by screen and person, completely, once each, balanced', () => {
  const jobs = pageJobs(SCREENS);
  const key = (j) => `${j.screen.id}|${j.role}|${j.w}|${j.theme}`;
  for (let n = 1; n <= 5; n++) {
    const parts = Array.from({ length: n }, (_, i) => shardJobs(jobs, i + 1, n));
    const all = parts.flatMap((p) => p.jobs.map(key));
    assert.equal(all.length, jobs.length, `n=${n}`);
    assert.equal(new Set(all).size, jobs.length, `n=${n}`);
    // A screen and person never split.
    const owner = new Map();
    parts.forEach((p, i) => p.units.forEach((u) => { assert.ok(!owner.has(u), u); owner.set(u, i); }));
    // Balanced: the heaviest and lightest shard differ by at most the heaviest unit.
    const heaviestUnit = Math.max(...parts.flatMap((p) => p.units.map((u) => jobs.filter((j) => `${j.screen.id}|${j.role}` === u).reduce((s, j) => s + ([1440, 390].includes(j.w) ? 3 : 1), 0))));
    const w = parts.map((p) => p.weight);
    assert.ok(Math.max(...w) - Math.min(...w) <= heaviestUnit, `n=${n}: ${w}`);
    // The same cut every time.
    assert.deepEqual(shardJobs(jobs, 1, n).units, parts[0].units);
  }
  assert.throws(() => shardJobs(jobs, 0, 3));
  assert.throws(() => shardJobs(jobs, 4, 3));
  assert.equal(shardCount(10), 1);
  assert.equal(shardCount(jobs.length), 4);
});

test('screens: --only selects screens by id, and an unknown id is an error', () => {
  assert.equal(selectScreens('').length, SCREENS.length);
  assert.deepEqual(selectScreens('usage,films').map((s) => s.id), ['films', 'usage']);
  assert.throws(() => selectScreens('usage,nope'), /Unknown screen id: nope/);
  // The quick matrix is 1440 and 390 only.
  assert.ok(pageJobs(selectScreens('usage'), { quick: true }).every((j) => [1440, 390].includes(j.w)));
});

// ── The ratchet ─────────────────────────────────────────────────────────
const page = (screen, extra = {}) => ({ screen, role: 'owner', w: 1440, theme: 'light', consoleErrors: [], httpErrors: [], ...extra });
const baseline = {
  counts: Object.fromEntries(RATCHETED.map((k) => [k, 0])),
  byScreen: { usage: { consoleErrors: 1 }, films: {} },
};
baseline.counts.consoleErrors = 3;
baseline.counts.focusWithoutIndicator = 10;

test('ratchet: the list of ratcheted counts keeps every check', () => {
  for (const k of ['pagesZoomedOutOnPhones', 'editorBand', 'fixedOverSettings', 'controlsSpilling', 'providerNamesShown', 'axeSerious', 'focusWithoutIndicator', 'serverHostsBlocked', 'ellipsisWithoutFullText']) assert.ok(RATCHETED.includes(k), k);
  assert.ok(!PER_SCREEN.includes('serverHostsBlocked'));
  assert.match(fs.readFileSync('scripts/ui/ratchet.mjs', 'utf8'), /export const RATCHETED = \['pagesZoomedOutOnPhones', 'editorBand', 'fixedOverSettings', 'controlsSpilling',/);
});

test('ratchet: counts per run and per screen', () => {
  const results = [page('usage', { consoleErrors: ['a', 'b'], overflowX: 3 }), page('usage'), page('films', { focus: { noIndicator: ['x'], hidden: [] }, zoomedBy: 20 })];
  const totals = countsOf(results, { 'example.test': 2 });
  assert.equal(totals.pages, 3);
  assert.equal(totals.consoleErrors, 2);
  assert.equal(totals.pagesWithSidewaysScroll, 1);
  assert.equal(totals.pagesZoomedOutOnPhones, 1);
  assert.equal(totals.serverHostsBlocked, 1);
  const by = countsByScreen(results);
  assert.deepEqual(Object.keys(by), ['films', 'usage']);
  assert.equal(by.usage.consoleErrors, 2);
  assert.equal(by.films.focusWithoutIndicator, 1);
  assert.equal(by.films.serverHostsBlocked, undefined);
});

test('ratchet: a subset compares each screen with its own counts', () => {
  const run = (results) => ({ totals: countsOf(results), byScreen: countsByScreen(results), full: false });
  assert.equal(compare(baseline, run([page('usage', { consoleErrors: ['a'] })])).ok, true);
  const worse = compare(baseline, run([page('usage', { consoleErrors: ['a', 'b'] })]));
  assert.equal(worse.ok, false);
  assert.deepEqual(worse.worse, ['usage: consoleErrors']);
  // Moving a count from one screen to another fails, though the total is the same.
  assert.equal(compare(baseline, run([page('usage'), page('films', { consoleErrors: ['a'] })])).ok, false);
  // The keyboard walk's noise is allowed per screen too.
  assert.equal(compare(baseline, run([page('films', { focus: { noIndicator: ['1', '2', '3', '4', '5'], hidden: [] } })])).ok, true);
  assert.equal(compare(baseline, run([page('films', { focus: { noIndicator: ['1', '2', '3', '4', '5', '6'], hidden: [] } })])).ok, false);
});

test('ratchet: a screen with no counts of its own is compared leniently with the totals, with a note', () => {
  const run = (results) => ({ totals: countsOf(results), byScreen: countsByScreen(results), full: false });
  const ok = compare(baseline, run([page('home', { consoleErrors: ['a', 'b', 'c'] })]));
  assert.equal(ok.ok, true);
  assert.ok(ok.lines.some((l) => /no per-screen baseline yet for home/.test(l) && /lenient/.test(l)));
  const bad = compare(baseline, run([page('home', { consoleErrors: ['a', 'b'] }), page('company', { consoleErrors: ['c', 'd'] })]));
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.worse, ['company+home: consoleErrors']);
  // No baseline at all: nothing to compare.
  assert.equal(compare(null, run([page('home')])).ok, true);
});

test('ratchet: a full run compares the totals as well', () => {
  const results = [page('usage', { consoleErrors: ['a'] }), page('films'), page('home', { consoleErrors: ['b', 'c', 'd'] })];
  const r = compare(baseline, { totals: countsOf(results), byScreen: countsByScreen(results), full: true });
  assert.equal(r.ok, false);
  assert.deepEqual(r.worse, ['total: consoleErrors']);
});

test('ratchet: --update writes the totals and every screen from a full run, only its screens from a subset', () => {
  const results = [page('usage', { consoleErrors: ['a'] }), page('home')];
  const full = updatedBaseline(null, { totals: countsOf(results), byScreen: countsByScreen(results), full: true }, '2026-11-17');
  assert.equal(full.counts.consoleErrors, 1);
  assert.equal(full.measured, '2026-11-17');
  assert.deepEqual(Object.keys(full.byScreen), ['home', 'usage']);
  assert.throws(() => updatedBaseline(null, { totals: {}, byScreen: {}, full: false }));
  const sub = updatedBaseline({ ...baseline, measured: 'then' }, { totals: countsOf([page('films', { consoleErrors: ['x'] })]), byScreen: countsByScreen([page('films', { consoleErrors: ['x'] })]), full: false });
  assert.equal(sub.counts, baseline.counts);
  assert.equal(sub.measured, 'then');
  assert.equal(sub.byScreen.films.consoleErrors, 1);
  assert.deepEqual(sub.byScreen.usage, { consoleErrors: 1 });
  // The file: valid JSON, one line per screen, zero counts left out.
  const text = formatBaseline(full);
  const back = JSON.parse(text);
  assert.deepEqual(back.counts, full.counts);
  assert.deepEqual(back.byScreen, { home: {}, usage: { consoleErrors: 1 } });
  assert.match(text, /\n {4}"usage": \{"consoleErrors":1\}\n/);
  assert.deepEqual(JSON.parse(formatBaseline({ note: 'n', measured: 'm', counts: {}, byScreen: {} })).byScreen, {});
});

test('ratchet: the committed baseline is valid and holds every ratcheted total', () => {
  const b = JSON.parse(fs.readFileSync('scripts/ui-baseline.json', 'utf8'));
  for (const k of RATCHETED) assert.equal(typeof b.counts[k], 'number', k);
  for (const id of Object.keys(b.byScreen || {})) assert.ok(SCREEN_IDS.includes(id), id);
});

test('merge: shard reports join into one, and a page in two shards is refused', () => {
  const shard = (results, extra = {}) => ({ at: '2026-11-17T00:00:00Z', studioReadyMs: 900, results, blockedServerHosts: {}, harnessMistakes: [], scope: { screens: ['usage', 'films'], quick: false, shard: '1/2' }, ...extra });
  const m = mergeReports([shard([page('usage')], { blockedServerHosts: { 'a.test': 1 } }), shard([page('films')], { studioReadyMs: 1200, blockedServerHosts: { 'a.test': 2 }, scope: { screens: ['usage', 'films'], quick: false, shard: '2/2' } })]);
  assert.equal(m.results.length, 2);
  assert.equal(m.studioReadyMs, 1200);
  assert.deepEqual(m.blockedServerHosts, { 'a.test': 3 });
  assert.deepEqual(m.scope.shards, ['1/2', '2/2']);
  assert.equal(isFullRun(m), false);
  assert.throws(() => mergeReports([shard([page('usage')]), shard([page('usage')])]), /two shard reports/);
  assert.throws(() => mergeReports([]));
  assert.equal(isFullRun({ scope: { screens: SCREEN_IDS, quick: false } }), true);
  assert.equal(isFullRun({ scope: { screens: SCREEN_IDS, quick: true } }), false);
});

test('ci: actions are pinned by commit, and the required checks keep their names', () => {
  const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
  for (const m of ci.matchAll(/uses:\s*(\S+)/g)) assert.match(m[1], /^actions\/[a-z-]+(\/[a-z-]+)?@[0-9a-f]{40}$/, m[1]);
  for (const job of ['verify', 'ui', 'secrets']) assert.match(ci, new RegExp(`\\n  ${job}:\\n    name: ${job}\\n`), job);
  assert.match(ci, /check:ui -- --only="\$ONLY" --shard="\$SHARD\/\$TOTAL" --shots/);
  assert.match(ci, /check:ui -- --perf --shots/);
  assert.match(ci, /cron: '30 2 \* \* \*'/);
  assert.match(ci, /update_baseline:/);
});

test('check:ui: nothing at the top level after the main block is a const or let', () => {
  // The main block awaits, then exits; a const or let declared after it is never initialised, so a
  // journey that reads one dies with "Cannot access … before initialization" (CI only, since check:ui
  // needs Postgres). Helpers below it are function declarations, which are hoisted.
  const src = fs.readFileSync('scripts/check-ui.mjs', 'utf8');
  const end = src.indexOf('\nprocess.exit(exitCode);');
  assert.ok(end > 0, 'the main block ends with process.exit(exitCode)');
  const late = [...src.slice(end).matchAll(/^(const|let|var|class)\s+([\w$]+)/gm)].map((m) => m[2]);
  assert.deepEqual(late, [], `declare these as functions, or above the main block: ${late.join(', ')}`);
});
