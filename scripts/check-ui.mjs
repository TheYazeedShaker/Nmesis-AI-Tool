// npm run check:ui
//
// Every Studio screen, in a real browser, at 1440 / 1280 / 1024 / 768 / 390 /
// 360, light and dark, for each kind of person (owner, creator, viewer, staff,
// and the plan and subscription states), against the production build with
// synthetic data (scripts/ui/seed.mjs) and stand-ins for Supabase Auth, S3 and
// every paid provider (scripts/ui/stack.mjs; the server cannot reach the
// network at all). docs/design-audit/harness.md explains each check and lists
// the mistakes the harness is known to make.
//
// Writes ui-report/report.json (every page, every finding), ui-report/summary.md
// and, with --shots, screenshots in ui-report/shots/ (never committed). Passes
// while the counts in scripts/ui-baseline.json do not go up: the totals for a
// full run, and each screen that ran against its own counts (scripts/ui/ratchet.mjs).
// The people and screens are in scripts/ui/screens.mjs.
//
//   npm run check:ui                        the full matrix (TEST_DATABASE_URL required)
//   npm run check:ui -- --quick             1440 and 390 only (not compared: other viewports)
//   npm run check:ui -- --only=usage,films  some screens (each compared with its own counts)
//   npm run check:ui -- --shard=2/4         one of four balanced parts (by screen and person);
//                                           compared after scripts/ui/merge.mjs joins the parts
//   npm run check:ui -- --shots             also save screenshots (1440, 1280, 1024 and 390)
//   npm run check:ui -- --perf              the performance baseline too (scripts/ui/perf.mjs)
//   npm run check:ui -- --update            write the baseline as it is now (a full run: totals
//                                           and every screen; with --only: those screens)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { startStack } from './ui/stack.mjs';
import { seedStudio, ORGS, PEOPLE, PASSWORD } from './ui/seed.mjs';
import { execFile } from 'node:child_process';
// Asynchronous: the S3 stand-in runs in this process and must keep answering while the backfill runs.
const backfill = (stack) => new Promise((resolve, reject) => execFile(process.execPath, ['scripts/backfill-library.mjs', '--env', 'preview', '--staff', PEOPLE.staff.id], { env: { ...stack.env, NODE_OPTIONS: '' }, encoding: 'utf8', timeout: 600_000, maxBuffer: 16 * 1024 * 1024 }, (e, out, err) => (e ? reject(new Error('The backfill failed: ' + (err || e.message).slice(-2000))) : resolve(String(out).trim().split(/\r?\n/).pop()))));
import { initScript, quietFor, vitals, layoutChecks, focusState, providerNamesOnPage } from './ui/checks.mjs';
import { PROVIDER_PATTERN } from '../lib/provider-words.ts';
import { runPerf } from './ui/perf.mjs';
import { ROLES, NO_PROVIDER_NAMES, SCREENS, STATES, ALL_VIEWPORTS, QUICK_VIEWPORTS, KEY_WIDTHS, SHOT_WIDTHS, THEMES, selectScreens, pageJobs, shardJobs } from './ui/screens.mjs';
import { finish } from './ui/ratchet.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const opt = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || '').slice(n.length + 3);
const OUT = path.resolve('ui-report');
const BASELINE = path.resolve('scripts/ui-baseline.json');
const QUICK = flag('quick'), SHOTS = flag('shots'), UPDATE = flag('update'), PERF = flag('perf');
const SELECTED = (() => { try { return selectScreens(opt('only')); } catch (e) { console.error(e instanceof Error ? e.message : e); process.exit(2); } })();
const SHARD = opt('shard') ? opt('shard').split('/').map(Number) : null;
const WORKERS = Number(opt('workers')) || 3;
const VIEWPORTS = QUICK ? QUICK_VIEWPORTS : ALL_VIEWPORTS;
// Every screen at every viewport: the totals mean something and are compared too.
const FULL = !QUICK && SELECTED.length === SCREENS.length;
if (UPDATE && (QUICK || SHARD)) { console.error('--update needs every viewport in one run (no --quick); for shards, merge them: node scripts/ui/merge.mjs <dir> --update.'); process.exit(2); }

// The page checks of this run (or of this shard).
const ALL_JOBS = pageJobs(SELECTED, { quick: QUICK });
const { jobs: JOBS, units: UNITS } = SHARD ? shardJobs(ALL_JOBS, SHARD[0], SHARD[1]) : { jobs: ALL_JOBS, units: null };
const inRun = (screen, role) => JOBS.some((j) => j.screen.id === screen && j.role === role);
const RUN_STATES = SHOTS ? STATES.filter((s) => inRun(s.screen, s.role)) : [];
// Sign in only the people this run needs: the seed uploads as Enterprise; --perf measures its own routes.
const NEEDED = new Set([...JOBS.map((j) => j.role), ...RUN_STATES.map((s) => s.role), 'enterprise', ...(PERF ? ['anon', 'owner', 'enterprise', 'scale'] : [])]);

// --plan: what this run would check, and nothing else (no database, no browser).
if (flag('plan')) {
  const per = new Map();
  for (const j of JOBS) per.set(`${j.screen.id}|${j.role}`, (per.get(`${j.screen.id}|${j.role}`) || 0) + 1);
  console.log(`${JOBS.length} page checks${SHARD ? ` in shard ${SHARD.join('/')}` : ''}; ${FULL ? `every screen${SHARD ? '' : ' (totals compared)'}` : 'screens: ' + SELECTED.map((s) => s.id).join(', ')}; people: ${[...NEEDED].join(', ')}; state screenshots: ${RUN_STATES.map((s) => s.id).join(', ') || 'none'}`);
  for (const [k, n] of per) console.log(`  ${k}: ${n}`);
  process.exit(0);
}

// ── Run ───────────────────────────────────────────────────────────────────
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
if (SHARD) console.log(`Shard ${SHARD.join('/')}: ${UNITS.length} screen and person pairs (${UNITS.join(', ')})`);
const stack = await startStack({ adminUrl: process.env.TEST_DATABASE_URL, log: (l) => console.log('  ' + l) });
console.log(`Studio ready in ${stack.readyMs} ms at ${stack.origin}`);
const browser = await chromium.launch();
const harnessMistakes = [];
const contexts = {};
let exitCode = 0;
try {
  // In parallel, one person at a time per account (staff signs in three times, as three sessions).
  const byPerson = new Map();
  for (const name of Object.keys(ROLES).filter((n) => NEEDED.has(n))) { const k = ROLES[name].person || name; if (!byPerson.has(k)) byPerson.set(k, []); byPerson.get(k).push(name); }
  await Promise.all([...byPerson.values()].map(async (names) => { for (const name of names) contexts[name] = await roleContexts(name, ROLES[name]); }));
  await seedStudio({ s3: stack.s3, adminUrl: stack.adminUrl, request: { enterprise: contexts.enterprise.desktop.request } });
  // The one-off backfill (Phase 3 group 2), as the owner runs it after 0007: the
  // library index and thumbnails for everything seeded above.
  console.log('  ' + await backfill(stack));
  // Performance first, so the first request to the heaviest route is a cold one.
  const perf = PERF ? await runPerf({ stack, contexts, browser }) : undefined;

  const jobs = JOBS;
  console.log(`${jobs.length} page checks, ${WORKERS} at a time`);
  const results = [];
  let done = 0;
  await pool(jobs, WORKERS, async (job) => {
    const r = job.pending ? { screen: job.screen.id, role: job.role, pending: job.screen.pending } : await check(job);
    results.push(r);
    if (++done % 25 === 0) console.log(`  ${done} / ${jobs.length}`);
  });
  const blocked = Object.fromEntries(stack.blocked);
  const scope = { screens: SELECTED.map((s) => s.id), quick: QUICK, ...(SHARD ? { shard: SHARD.join('/'), units: UNITS } : {}) };
  const report = { at: new Date().toISOString(), studioReadyMs: stack.readyMs, viewports: VIEWPORTS, roles: ROLES, scope, results: results.sort(byKey), blockedServerHosts: blocked, harnessMistakes };
  if (perf) report.perf = perf;
  // The library at scale (Phase 3 group 2): a hard limit, not a ratchet.
  if (perf?.libraryScale && !perf.libraryScale.ok) { console.log('✗ The library at 1,000 items: first paint 1.5 s or more on the phone profile, or storage read for work off screen: ' + JSON.stringify(perf.libraryScale)); exitCode = 1; }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  // Screens in a given state, for the PR (not counted): before/after sheets.
  if (RUN_STATES.length) await stateShots();
  if (SHARD) {
    // A screen can span shards: the counts are compared once the shards are merged.
    finish({ report, out: OUT, baselineFile: BASELINE, full: false, compareWith: false });
    console.log(`Shard ${SHARD.join('/')} done: ${results.length} page checks. The ratchet runs on the merged report (node scripts/ui/merge.mjs).`);
  } else if (QUICK) {
    finish({ report, out: OUT, baselineFile: BASELINE, full: false, compareWith: false });
    console.log('--quick checks 1440 and 390 only: not compared with the baseline (it counts every viewport).');
  } else {
    exitCode = Math.max(exitCode, finish({ report, out: OUT, baselineFile: BASELINE, update: UPDATE, full: FULL }));
  }
} catch (e) {
  console.error(e);
  console.error(stack.output.slice(-60).join('\n'));
  exitCode = 2;
} finally {
  await browser.close();
  await stack.stop();
}
process.exit(exitCode);

// ── Pieces ────────────────────────────────────────────────────────────────
async function roleContexts(name, role) {
  const make = (extra = {}) => browser.newContext({ baseURL: stack.origin, ...extra });
  const desktop = await make();
  if (role.person) {
    const p = PEOPLE[role.person];
    const r = await desktop.request.post('/api/auth/password', { data: { email: p.email, password: PASSWORD }, headers: { origin: stack.origin } });
    if (!r.ok()) throw new Error(`Sign-in for ${name} failed: ${r.status()} ${await r.text()}`);
    if (role.org) {
      const opened = await desktop.request.get('/?org=' + ORGS[role.org].id, { maxRedirects: 5 });
      if (opened.status() >= 400) harnessMistakes.push(`${name}: opening ${role.org} answered ${opened.status()}`);
    }
  }
  const state = await desktop.storageState();
  const phone = await make({ storageState: state, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  for (const ctx of [desktop, phone]) {
    await ctx.addInitScript(initScript);
    // The browser may load only the Studio and its stand-ins.
    await ctx.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (/^(localhost|127\.0\.0\.1)$/.test(u.hostname) || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
      ctx.__blocked = ctx.__blocked || new Set(); ctx.__blocked.add(u.hostname);
      return route.abort('blockedbyclient');
    });
  }
  return { desktop, phone };
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); }));
}

async function ready(page) {
  const start = Date.now();
  let quiet = false;
  while (Date.now() - start < 12_000) {
    await page.waitForTimeout(100);
    if (page.__inflight > 0) continue;
    const q = await page.evaluate(quietFor).catch(() => 0);
    if (q >= 400) { quiet = true; break; }
  }
  return { quiet, ms: Date.now() - start };
}

async function act(page, action) {
  const click = async (sel) => { const el = page.locator(sel).first(); if (!(await el.count())) return false; await el.scrollIntoViewIfNeeded().catch(() => {}); await el.click({ timeout: 3000 }).catch(() => {}); return true; };
  // The library's first picture, opened in the viewer.
  if (action === 'viewer') return click('.ds-tile:has(img) .ds-tile-open');
  if (action === 'settings') return click('summary[aria-label="Studio settings"]');
  // The switcher in the top bar; below 768px the companies are in the menu (Phase 2b).
  if (action === 'switcher') return (await page.locator('button.studio-switcher:visible').count()) ? click('button.studio-switcher:visible') : click('button[aria-label="Menu"]:visible');
  return false;
}

async function check({ screen, role, w, h, theme }) {
  const ctx = w <= 480 ? contexts[role].phone : contexts[role].desktop;
  const page = await ctx.newPage();
  page.__inflight = 0;
  const consoleErrors = [], httpErrors = [];
  page.on('request', () => { page.__inflight++; });
  const end = () => { page.__inflight = Math.max(0, page.__inflight - 1); };
  page.on('requestfinished', end); page.on('requestfailed', end);
  page.on('response', (r) => { const u = new URL(r.url()); if (r.status() >= 500 || (r.status() >= 400 && u.pathname.startsWith('/api/') && r.status() !== 401)) httpErrors.push(`${r.status()} ${r.request().method()} ${u.pathname}`); });
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_BLOCKED_BY_CLIENT|blockedbyclient/.test(m.text())) consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => consoleErrors.push('Uncaught: ' + String(e.message).slice(0, 300)));
  const out = { screen: screen.id, role, w, h, theme };
  try {
    await page.setViewportSize({ width: w, height: h });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const res = await page.goto(screen.path, { waitUntil: 'load', timeout: 30_000 });
    out.status = res?.status();
    out.finalPath = new URL(page.url()).pathname + new URL(page.url()).search;
    out.ready = await ready(page);
    if (screen.action) {
      out.action = (await act(page, screen.action)) ? 'done' : 'not found';
      if (out.action === 'not found') harnessMistakes.push(`${screen.id} (${role}, ${w}): could not find what to open for "${screen.action}"`);
      await ready(page);
    }
    // The screenshot shows the page as it opened (before the keyboard walk scrolls it).
    if (SHOTS && SHOT_WIDTHS.has(w)) await page.screenshot({ path: path.join(OUT, 'shots', `${screen.id}--${role}--${w}--${theme}.png`) }).catch(() => {});
    Object.assign(out, await page.evaluate(layoutChecks, { phone: w <= 480 }));
    out.vitals = await page.evaluate(vitals);
    if (NO_PROVIDER_NAMES.has(role)) out.providerNames = await page.evaluate(providerNamesOnPage, { source: PROVIDER_PATTERN.source });
    if (KEY_WIDTHS.has(w)) {
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
      out.axe = axe.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) }));
      out.focus = await keyboardWalk(page);
    }
  } catch (e) {
    out.error = String(e.message || e).slice(0, 300);
    harnessMistakes.push(`${screen.id} (${role}, ${w}, ${theme}): ${out.error}`);
  } finally {
    out.consoleErrors = [...new Set(consoleErrors)];
    out.httpErrors = [...new Set(httpErrors)];
    out.blockedInBrowser = [...(ctx.__blocked || [])];
    await page.close().catch(() => {});
  }
  return out;
}

// A real keyboard: Tab through the page, and for each stop ask whether the
// focus can be seen and whether a fixed or sticky bar hides it (2.4.11).
async function keyboardWalk(page) {
  await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  const stops = [], seen = new Set();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const s = await page.evaluate(focusState).catch(() => null);
    if (!s) continue;
    if (seen.has(s.el) && stops.length > 3) break;
    seen.add(s.el);
    stops.push(s);
  }
  return {
    stops: stops.length,
    noIndicator: stops.filter((s) => !s.indicator).map((s) => s.el),
    hidden: stops.filter((s) => s.points > 0 && s.covered === s.points).map((s) => `${s.el} under ${s.coveredBy}`),
    partly: stops.filter((s) => s.covered > 0 && s.covered < s.points).map((s) => `${s.el} under ${s.coveredBy}`),
  };
}

function byKey(a, b) { return `${a.screen}|${a.role}|${a.w}|${a.theme}`.localeCompare(`${b.screen}|${b.role}|${b.w}|${b.theme}`); }

// Screens in a given state (Phase 3 polish), screenshots only (scripts/ui/screens.mjs
// STATES): taken in the run or shard that checks their screen as their person.
// Saved as shots/state-<id>--<width>--<theme>.png; nothing here is counted.
async function stateShots() {
  let n = 0;
  for (const s of RUN_STATES) for (const [w, h] of s.sizes) for (const theme of THEMES) {
    const page = await (w <= 480 ? contexts[s.role].phone : contexts[s.role].desktop).newPage();
    try {
      await page.setViewportSize({ width: w, height: h });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      if (s.generation) await page.route('**/api/status', async (route) => { const res = await route.fetch(); const body = await res.json().catch(() => ({})); await route.fulfill({ response: res, json: { ...body, generation: true, storage: true } }); });
      await page.goto(s.path, { waitUntil: 'load', timeout: 30_000 });
      await ready(page);
      for (const step of s.steps || []) {
        if (step === 'switcher') await act(page, 'switcher');
        // The settings are a sheet on phones: open it first.
        else if (step === 'settings') { const b = page.locator('.ds-phone-generate button:visible', { hasText: 'Settings' }).first(); if (await b.count()) await b.click({ timeout: 3000 }).catch(() => {}); }
        else if (step.startsWith('button:')) { const t = page.getByRole('button', { name: step.slice(7) }).locator('visible=true').first(); if (await t.count()) await t.click({ timeout: 3000 }).catch(() => {}); }
        else if (step.startsWith('text:')) { const t = page.getByText(step.slice(5), { exact: false }).locator('visible=true').first(); if (await t.count()) await t.click({ timeout: 3000 }).catch(() => {}); }
        else if (step.startsWith('radio:')) { const t = page.getByRole('radio', { name: step.slice(6) }).first(); if (await t.count()) await t.check({ force: true, timeout: 3000 }).catch(() => {}); }
        else if (step.startsWith('scroll:')) { const t = page.getByRole('heading', { name: step.slice(7) }).locator('visible=true').first(); if (await t.count()) await t.scrollIntoViewIfNeeded().catch(() => {}); }
        await ready(page);
      }
      await page.screenshot({ path: path.join(OUT, 'shots', `state-${s.id}--${w}--${theme}.png`) });
      n++;
    } catch (e) { console.log(`  state shot ${s.id} ${w} ${theme}: ${e instanceof Error ? e.message.slice(0, 120) : e}`); }
    finally { await page.close().catch(() => {}); }
  }
  console.log(`  ${n} state screenshots`);
}
