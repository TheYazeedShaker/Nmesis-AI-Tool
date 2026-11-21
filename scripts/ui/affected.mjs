// Which check:ui screens a change can affect (CI's pull requests run only those).
//
//   node scripts/ui/affected.mjs                        against origin/development (git diff base...HEAD)
//   node scripts/ui/affected.mjs --base=origin/main     another base
//   node scripts/ui/affected.mjs --diff=A..B            git diff --name-only A B (CI: the PR's merge commit)
//   node scripts/ui/affected.mjs app/usage/page.tsx …   these files
//   … --github                                          CI: mode, only, shards, total for $GITHUB_OUTPUT
//   … --all / --sweep                                   CI: every screen sharded / the full sweep job
//
// How a file maps (docs/design-audit/harness.md, "Which screens a pull request checks"):
//  1. The shell, the design system, the database, the harness itself and the
//     build's configuration (FULL below): every screen.
//  2. Docs, tests and tooling that never reaches a page (NONE below): no screen.
//  3. App code (app/, components/, lib/, hooks/, public/, integration/): the
//     screens that reach it. A screen reaches its page and layouts, everything
//     they import (followed through `@/` and relative imports, CSS included),
//     and every API route its code calls (`/api/<name>`, with what those
//     routes import); a file under a screen's own route folder is that screen's.
//     A URL built at run time (`/api/${…}`) counts as calling every route.
//  4. Anything else, and app code no screen reaches: every screen (when in
//     doubt, check everything). If git cannot list the change: every screen.
// No dependency: CI's plan job runs this before `npm ci`.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { SCREENS, pageJobs, selectScreens, shardCount } from './screens.mjs';

export const FULL = [
  // The shell and the design system: every screen draws them.
  /^app\/layout\.tsx$/, /^app\/(not-found|error|global-error|loading|template)\.tsx$/,
  /^app\/(tokens|design-system|studio-shell|workspace|globals)\.css$/,
  /^components\/ds\//, /^components\/(studio-topbar|studio-account|credits|studio-providers)\.tsx$/, /^components\/workspace\/frame\.tsx$/,
  // Who is signed in, which company, its plan; the database and storage every request uses.
  /^lib\/accounts\//, /^lib\/studio-context\.ts$/, /^lib\/studio-server\.ts$/, /^lib\/portable\//, /^lib\/provider-words\.ts$/,
  /^proxy\.ts$/, /^middleware\.ts$/, /^app\/api\/auth\//,
  // The build and its configuration.
  /^next\.config\./, /^package(-lock)?\.json$/, /^\.npmrc$/, /^\.nvmrc$/, /^tsconfig\.json$/, /^postcss\.config\./, /^vendor\//,
  // The harness, its stand-ins, its database and its CI job.
  /^scripts\/check-ui\.mjs$/, /^scripts\/ui\//, /^scripts\/ui-baseline\.json$/, /^scripts\/verify\//, /^scripts\/backfill-library\.mjs$/, /^scripts\/migrate\.mjs$/,
  /^supabase\//, /^docs\/supabase-setup\.sql$/, /^tests\/fixtures\/accounts-schema\.sql$/, /^\.github\/workflows\//,
];
export const NONE = [
  /\.md$/, /^docs\//, /^tests\//, /^\.github\//, /^archive\//,
  /^scripts\/(check-design|design-inventory|check-setup)\.mjs$/, /^scripts\/design-baseline\.json$/,
  /^\.(gitignore|gitattributes|vercelignore)$/, /^\.env\.example$/, /^vercel\.json$/, /^eslint\.config\.mjs$/, /^components\.json$/, /^EXPORT-MANIFEST\.json$/,
];
const APP_CODE = /^(app|components|lib|hooks|public|integration)\//;
const SOURCE = /\.(tsx?|mts|cts|jsx?|mjs|cjs|css)$/;
const EXTENSIONS = ['', '.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.css', '.json', '/index.ts', '/index.tsx', '/index.js'];
const BOUNDARIES = ['layout', 'template', 'loading', 'error', 'not-found', 'default'];
const PAGE = /^app\/(?!api\/)(.*\/)?page\.(tsx|ts|jsx|js)$/;
const ROUTE = /^app\/api\/([^/]+)\/(.*\/)?route\.(ts|js)$/;

/** The imports of one source file (static, dynamic, re-exports, CSS @import, new URL(…, import.meta.url)). */
export function importsOf(source) {
  const specs = new Set();
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'"`;]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /@import\s+(?:url\()?\s*['"]([^'"]+)['"]/g,
    /new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g,
  ];
  for (const re of patterns) for (const m of source.matchAll(re)) specs.add(m[1]);
  return [...specs];
}

/** Resolve an import from `from` to a repository path in `files`, or null (a package). */
export function resolveImport(spec, from, files) {
  let base;
  if (spec.startsWith('@/')) base = spec.slice(2);
  else if (spec.startsWith('./') || spec.startsWith('../')) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  else return null;
  const tries = [];
  for (const ext of EXTENSIONS) tries.push(base + ext);
  // TypeScript's bundler resolution: './x.mjs' may be x.mts, './x.js' may be x.ts.
  const swap = { '.mjs': ['.mts'], '.js': ['.ts', '.tsx'], '.jsx': ['.tsx'] };
  const ext = path.posix.extname(base);
  for (const alt of swap[ext] || []) tries.push(base.slice(0, -ext.length) + alt);
  return tries.find((t) => files.has(t)) || null;
}

/** Which app/ page serves a URL path, by Next's file conventions (null: none, the not-found page). */
export function pageFor(urlPath, files) {
  const want = urlPath.split('?')[0].split('/').filter(Boolean);
  const pages = [...files.keys()].filter((f) => PAGE.test(f));
  // -1: no match; otherwise higher is more specific (a fixed segment beats [id], which beats [...rest]).
  const score = (f) => {
    const segs = path.posix.dirname(f).split('/').slice(1).filter((s) => !/^\(.*\)$/.test(s));
    let n = 0;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (s.startsWith('[[...')) return n + 1;
      if (s.startsWith('[...')) return want.length > i ? n + 1 : -1;
      if (want[i] === undefined) return -1;
      if (s.startsWith('[')) { n += 2; continue; }
      if (s !== want[i]) return -1;
      n += 3;
    }
    return segs.length === want.length ? n : -1;
  };
  let best = null, bestScore = -1;
  for (const f of pages) { const s = score(f); if (s > bestScore) { best = f; bestScore = s; } }
  return best;
}

/** What each screen reaches: { id: { files: Set, folder } }. `files` maps repository paths to their text. */
export function reachOfScreens(files, screens = SCREENS) {
  const graph = new Map();
  const depsOf = (f) => {
    if (!graph.has(f)) graph.set(f, SOURCE.test(f) ? importsOf(files.get(f) || '').map((s) => resolveImport(s, f, files)).filter(Boolean) : []);
    return graph.get(f);
  };
  const closure = (entries) => {
    const seen = new Set(), todo = [...entries];
    while (todo.length) { const f = todo.pop(); if (seen.has(f) || !files.has(f)) continue; seen.add(f); todo.push(...depsOf(f)); }
    return seen;
  };
  const routesBy = new Map();
  for (const f of files.keys()) { const m = ROUTE.exec(f); if (m) { if (!routesBy.has(m[1])) routesBy.set(m[1], []); routesBy.get(m[1]).push(f); } }
  const apiReach = new Map([...routesBy].map(([seg, entries]) => [seg, closure(entries)]));
  const quoted = (text, name) => new RegExp(`['"\`]${name}['"\`]`).test(text);
  const apiCalls = (reached) => {
    const segs = new Set();
    for (const f of reached) {
      if (!SOURCE.test(f)) continue;
      const text = files.get(f) || '';
      for (const m of text.matchAll(/\/api\/([A-Za-z0-9_-]+)/g)) if (routesBy.has(m[1])) segs.add(m[1]);
      // A URL built at run time (`/api/${PATH[kind]}/…`, '/api/' + name): the
      // routes whose names this file or what it imports spells out ('films');
      // when it spells out none, every route.
      if (/\/api\/\$\{/.test(text) || /['"`]\/api\/?['"`]\s*\+/.test(text)) {
        const near = [text, ...depsOf(f).map((d) => files.get(d) || '')];
        const named = [...routesBy.keys()].filter((seg) => near.some((t) => quoted(t, seg)));
        for (const seg of named.length ? named : routesBy.keys()) segs.add(seg);
      }
    }
    return [...segs];
  };
  const out = {};
  for (const s of screens) {
    const page = pageFor(s.path, files);
    const dirs = ['app'];
    if (page) { const parts = path.posix.dirname(page).split('/'); for (let i = 2; i <= parts.length; i++) dirs.push(parts.slice(0, i).join('/')); }
    const entries = [];
    for (const d of dirs) for (const b of BOUNDARIES) for (const ext of ['.tsx', '.ts', '.jsx', '.js']) if (files.has(`${d}/${b}${ext}`)) entries.push(`${d}/${b}${ext}`);
    if (page) entries.push(page);
    const reached = closure(entries);
    const apis = apiCalls(reached);
    for (const seg of apis) for (const f of apiReach.get(seg)) reached.add(f);
    out[s.id] = { files: reached, folder: page && path.posix.dirname(page) !== 'app' ? path.posix.dirname(page) : null, apis };
  }
  return out;
}

/**
 * The screens a list of changed files can affect.
 * Returns { full, screens: [ids], why: { file: 'every screen: …' | [ids] | 'no screen' } }.
 */
export function affected(changed, files, screens = SCREENS) {
  const why = {};
  let full = false;
  const hit = new Set();
  let reach = null;
  for (const raw of changed) {
    const f = raw.replace(/\\/g, '/').replace(/^\.\//, '');
    if (!f) continue;
    if (FULL.some((re) => re.test(f))) { why[f] = 'every screen: the shell, design system, database, build or harness'; full = true; continue; }
    if (NONE.some((re) => re.test(f))) { why[f] = 'no screen'; continue; }
    if (!APP_CODE.test(f)) { why[f] = 'every screen: not a file the map knows'; full = true; continue; }
    reach = reach || reachOfScreens(files, screens);
    const ids = new Set();
    for (const [id, r] of Object.entries(reach)) {
      if (r.files.has(f)) ids.add(id);
      // Under a screen's own route folder (the deepest one wins: /projects/[id] is the folder, not /projects).
      if (r.folder && f.startsWith(r.folder + '/')) {
        const deeper = Object.values(reach).some((o) => o.folder && o.folder !== r.folder && o.folder.startsWith(r.folder + '/') && f.startsWith(o.folder + '/'));
        if (!deeper) ids.add(id);
      }
      // A file in public/ is reached by its URL.
      if (f.startsWith('public/')) { const url = f.slice('public'.length); for (const g of r.files) if (SOURCE.test(g) && (files.get(g) || '').includes(url)) { ids.add(id); break; } }
    }
    if (!ids.size) { why[f] = files.has(f) ? 'every screen: app code no screen reaches' : 'every screen: app code not in the tree (deleted or renamed)'; full = true; continue; }
    why[f] = [...ids].sort();
    for (const id of ids) hit.add(id);
  }
  const ids = full ? screens.map((s) => s.id) : screens.map((s) => s.id).filter((id) => hit.has(id));
  return { full, screens: ids, why };
}

/** Every tracked file under the app code folders, with its text. */
export function readTree(root = process.cwd()) {
  let list;
  try { list = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean); }
  catch (e) { throw new Error('git ls-files failed: ' + (e instanceof Error ? e.message : e)); }
  const files = new Map();
  for (const f of list) {
    if (!APP_CODE.test(f)) continue;
    const p = path.join(root, f);
    // Listed by git but deleted in the working tree: not part of the tree.
    if (!fs.existsSync(p)) continue;
    files.set(f, SOURCE.test(f) ? fs.readFileSync(p, 'utf8') : '');
  }
  return files;
}

/** The changed files: git diff --name-only, or null when git cannot say (then: every screen). */
export function changedFiles({ diff, base }, root = process.cwd()) {
  const args = diff ? ['diff', '--name-only', ...diff.split('..').slice(0, 2)] : ['diff', '--name-only', `${base}...HEAD`];
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).split(/\r?\n/).filter(Boolean); }
  catch (e) { console.error(`git ${args.join(' ')} failed (${e instanceof Error ? e.message.split('\n')[0] : e}): every screen.`); return null; }
}

/**
 * CI's plan ($GITHUB_OUTPUT lines): mode (full, subset or none), only, shards, total. `only` always
 * names the screens, every one of them when the change reaches every screen: the Safari job runs when
 * `only` contains the editor or the settings grid, and an empty `only` hid them (feat/editor-panel-rules).
 * `--only=<every id>` selects every screen, exactly as an empty one did (the totals are compared too).
 */
export function githubPlan(result, { sweep = false, shards: n = 0 } = {}) {
  const mode = sweep ? 'full' : result.screens.length ? 'subset' : 'none';
  const only = result.screens.join(',');
  // The shard matrix is never empty (GitHub refuses an empty matrix); the shard job runs only when mode=subset.
  const shards = mode === 'subset' ? Array.from({ length: n }, (_, i) => i + 1) : [0];
  return `mode=${mode}\nonly=${only}\nshards=${JSON.stringify(shards)}\ntotal=${mode === 'subset' ? n : 0}\n`;
}

function main() {
  const args = process.argv.slice(2);
  const opt = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || '').slice(n.length + 3);
  const flag = (n) => args.includes('--' + n);
  const listed = args.filter((a) => !a.startsWith('--'));
  let result;
  if (flag('sweep') || flag('all')) result = { full: true, screens: SCREENS.map((s) => s.id), why: { '(asked)': flag('sweep') ? 'the full sweep' : 'every screen' } };
  else {
    const changed = listed.length ? listed : changedFiles({ diff: opt('diff'), base: opt('base') || 'origin/development' });
    result = changed ? affected(changed, readTree()) : { full: true, screens: SCREENS.map((s) => s.id), why: { '(git)': 'every screen: the change could not be listed' } };
  }
  const checks = result.screens.length ? pageJobs(selectScreens(result.screens)).length : 0;
  const n = checks ? shardCount(checks) : 0;
  const explain = [
    flag('sweep') ? 'The full sweep (every screen, --perf --shots), in one job.'
      : !checks ? 'No screen is affected: check:ui does not run.'
        : `${result.full ? 'Every screen' : result.screens.join(', ')}: ${checks} page checks in ${n} shard(s).`,
    '', ...Object.entries(result.why).map(([f, w]) => `- ${f}: ${Array.isArray(w) ? w.join(', ') : w}`),
  ];
  if (flag('github')) {
    process.stdout.write(githubPlan(result, { sweep: flag('sweep'), shards: n }));
    console.error(explain.join('\n'));
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, ['## check:ui plan', '', ...explain.slice(0, 200)].join('\n') + '\n');
  } else {
    console.log(explain.join('\n'));
    if (flag('json')) console.log(JSON.stringify(result, null, 1));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main();
