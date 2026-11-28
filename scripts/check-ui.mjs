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
//   npm run check:ui -- --browser=webkit --only=editor,settings
//                                           the same checks in WebKit (Safari's engine): reported,
//                                           not compared (the baseline is Chromium's); the band
//                                           (shellNotFilling), a page that errors and the journeys
//                                           still fail it. No --perf (it reads Chromium's DevTools).
import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { startStack } from './ui/stack.mjs';
import { seedStudio, ORGS, PEOPLE, PASSWORD } from './ui/seed.mjs';
import { execFile } from 'node:child_process';
// Asynchronous: the S3 stand-in runs in this process and must keep answering while the backfill runs.
const backfill = (stack) => new Promise((resolve, reject) => execFile(process.execPath, ['scripts/backfill-library.mjs', '--env', 'preview', '--staff', PEOPLE.staff.id], { env: { ...stack.env, NODE_OPTIONS: '' }, encoding: 'utf8', timeout: 600_000, maxBuffer: 16 * 1024 * 1024 }, (e, out, err) => (e ? reject(new Error('The backfill failed: ' + (err || e.message).slice(-2000))) : resolve(String(out).trim().split(/\r?\n/).pop()))));
import { initScript, quietFor, vitals, layoutChecks, shellOutsideProbe, focusState, providerNamesOnPage, editorRules } from './ui/checks.mjs';
import { PROVIDER_PATTERN } from '../lib/provider-words.ts';
import { runPerf } from './ui/perf.mjs';
import { VISUAL_ID } from '../lib/work-ref.ts';
import { EDITOR_JOURNEYS, EDITOR_VISUAL_ID, V1_DESIGN_ID, RULE_STATE_SIZES, TOAST_SIZES, TOOL_TOAST_SIZES, TOOL_TOAST_PAGES, PERF_DESIGN_ID, PERF_PICTURE_ID, PERF_LAYERS } from './ui/screens.mjs';
import { ROLES, NO_PROVIDER_NAMES, SCREENS, STATES, FLOWS, ALL_VIEWPORTS, QUICK_VIEWPORTS, KEY_WIDTHS, SHOT_WIDTHS, THEMES, selectScreens, pageJobs, shardJobs } from './ui/screens.mjs';
import { finish } from './ui/ratchet.mjs';
import { decode as decodePngFile } from 'fast-png';
import { PHOTO_HOSTS, standinPng } from './ui/photo-standin.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const opt = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || '').slice(n.length + 3);
const OUT = path.resolve('ui-report');
const BASELINE = path.resolve('scripts/ui-baseline.json');
const ENGINE = opt('browser') || 'chromium';
if (!['chromium', 'webkit'].includes(ENGINE)) { console.error('--browser is chromium (the default) or webkit.'); process.exit(2); }
const WEBKIT = ENGINE === 'webkit';
const QUICK = flag('quick'), SHOTS = flag('shots'), UPDATE = flag('update'), PERF = flag('perf') && !WEBKIT;
if (WEBKIT && UPDATE) { console.error('The baseline is Chromium\'s: --update runs without --browser=webkit.'); process.exit(2); }
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
const browser = await (WEBKIT ? webkit : chromium).launch();
if (WEBKIT) console.log('WebKit (Safari\'s engine): counts are reported, not compared with the Chromium baseline.');
const harnessMistakes = [];
// Every request a page makes to the font service (the owner's privacy rule: no font from it, ever). A hard check.
const FONT_SERVICE = /(^|\.)fonts\.googleapis\.com$|(^|\.)fonts\.gstatic\.com$/;
const fontServiceRequests = [];
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
  // Journeys across screens (Edit from Projects): a hard check, in the run or shard that checks where they start.
  // The editor's journeys also measure its panel in each kind of selection (the rule states, counted in the
  // ratchet under the editor screen) and time it with 50 layers on a 3840 x 2160 picture.
  const editor = await runEditorJourneys();
  if (editor.ruleStates.length) report.ruleStates = editor.ruleStates;
  if (editor.editorPerf) { report.editorPerf = editor.editorPerf; console.log('  editor performance: ' + JSON.stringify(editor.editorPerf)); }
  const flows = [...await runFlows(), ...editor.flows];
  if (flows.length) {
    report.flows = flows;
    for (const f of flows) console.log(`  flow ${f.id}: ${f.ok ? 'ok' : 'FAILED: ' + f.problems.join('; ')}`);
    if (flows.some((f) => !f.ok)) { console.log('✗ A journey across screens failed (report.flows).'); exitCode = 1; }
  }
  // No page may ask the font service for anything (fonts.googleapis.com, fonts.gstatic.com): the fonts are the Studio's own.
  report.fontServiceRequests = fontServiceRequests;
  if (fontServiceRequests.length) { console.log('✗ Requests to the font service: ' + JSON.stringify(fontServiceRequests.slice(0, 10))); exitCode = 1; }
  else console.log('  no request to the font service (fonts.googleapis.com, fonts.gstatic.com) from any page');
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  // Screens in a given state, for the PR (not counted): before/after sheets.
  if (RUN_STATES.length) await stateShots();
  report.engine = ENGINE;
  if (WEBKIT) {
    // Safari: what breaks there. The counts are not Chromium's, so they are listed, not compared;
    // a band under the app, a page that errors and a failed journey still fail the run.
    finish({ report, out: OUT, baselineFile: BASELINE, full: false, compareWith: false });
    const band = results.filter((r) => r.shellShort?.length), broken = results.filter((r) => r.consoleErrors?.some((e) => e.startsWith('Uncaught')) || r.error);
    for (const r of band) console.log(`✗ WebKit: the app does not fill the window on ${r.screen} as ${r.role} at ${r.w} x ${r.h}${r.zoom ? ` (zoom ${r.zoom})` : ''}: ${JSON.stringify(r.shellShort).slice(0, 300)}`);
    for (const r of broken) console.log(`✗ WebKit: ${r.screen} as ${r.role} at ${r.w} x ${r.h}${r.zoom ? ` (zoom ${r.zoom})` : ''} threw: ${String(r.error || r.consoleErrors.find((e) => e.startsWith('Uncaught'))).slice(0, 300)}`);
    if (band.length || broken.length) exitCode = 1;
    console.log(`WebKit done: ${results.length} page checks, ${band.length} with a band, ${broken.length} with page errors.`);
  } else if (SHARD) {
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
    // The Studio runs as production, so its session cookies are Secure. Chromium keeps a Secure cookie on
    // http://localhost; WebKit drops it, and every page would open signed out. The run's own cookies go
    // back into the WebKit context without the flag (only here, on the run's local address).
    if (WEBKIT) {
      const jar = await desktop.cookies();
      if (jar.length) { await desktop.clearCookies(); await desktop.addCookies(jar.map((c) => ({ ...c, secure: false }))); }
    }
  }
  const state = await desktop.storageState();
  const phone = await make({ storageState: state, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  for (const ctx of [desktop, phone]) await prepareContext(ctx);
  // A laptop at another pixel ratio (the Retina pass, RETINA_ZOOMS): one context per ratio, made when first needed.
  const ratios = new Map();
  const atRatio = (dsf) => {
    if (!ratios.has(dsf)) ratios.set(dsf, make({ storageState: state, deviceScaleFactor: dsf }).then(async (ctx) => { await prepareContext(ctx); return ctx; }));
    return ratios.get(dsf);
  };
  return { desktop, phone, atRatio };
}

async function prepareContext(ctx) {
  await ctx.addInitScript(initScript);
  // The browser may load only the Studio and its stand-ins.
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (/^(localhost|127\.0\.0\.1)$/.test(u.hostname) || u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
    // The photo library's pictures in the Photos panel's grid: the stand-in's (scripts/ui/photo-standin.mjs).
    if (u.protocol === 'https:' && PHOTO_HOSTS.test(u.hostname)) return route.fulfill({ status: 200, contentType: 'image/png', body: standinPng() });
    if (FONT_SERVICE.test(u.hostname)) fontServiceRequests.push({ host: u.hostname, from: (() => { try { return new URL(route.request().frame().url()).pathname; } catch { return '?'; } })() });
    ctx.__blocked = ctx.__blocked || new Set(); ctx.__blocked.add(u.hostname);
    return route.abort('blockedbyclient');
  });
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
  // References open, then the account menu (on phones: the menu drawer, opened again over the panel sheet).
  if (action === 'account-over-panel') {
    const settle = () => page.waitForTimeout(400);
    if (await page.locator('nav[aria-label="Main"] button:has-text("References"):visible').count()) {
      if (!(await click('nav[aria-label="Main"] button:has-text("References"):visible'))) return false;
      await settle();
      return click('.studio-account-button:visible');
    }
    if (!(await click('button[aria-label="Menu"]:visible'))) return false;
    await settle();
    if (!(await click('dialog[open] button:has-text("References")'))) return false;
    await settle();
    return click('button[aria-label="Menu"]:visible');
  }
  return false;
}

async function check({ screen, role, w, h, theme, dsf, zoom }) {
  const ctx = dsf ? await contexts[role].atRatio(dsf) : w <= 480 ? contexts[role].phone : contexts[role].desktop;
  const page = await ctx.newPage();
  page.__inflight = 0;
  const consoleErrors = [], httpErrors = [];
  page.on('request', () => { page.__inflight++; });
  const end = () => { page.__inflight = Math.max(0, page.__inflight - 1); };
  page.on('requestfinished', end); page.on('requestfailed', end);
  page.on('response', (r) => { const u = new URL(r.url()); if (r.status() >= 500 || (r.status() >= 400 && u.pathname.startsWith('/api/') && r.status() !== 401)) httpErrors.push(`${r.status()} ${r.request().method()} ${u.pathname}`); });
  // The not-found screen answers its own address with 404 on purpose: the browser's line about that
  // one document is expected, not an error of the page (any other 404 still counts).
  const ownNotFound = (m) => screen.id === 'not-found' && /status of 404/.test(m.text()) && (() => { try { return new URL(m.location().url).pathname === new URL(screen.path, 'http://x').pathname; } catch { return false; } })();
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_BLOCKED_BY_CLIENT|blockedbyclient/.test(m.text()) && !ownNotFound(m)) consoleErrors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => consoleErrors.push('Uncaught: ' + String(e.message).slice(0, 300)));
  const out = { screen: screen.id, role, w, h, theme, ...(dsf ? { dsf, zoom } : {}) };
  try {
    await page.setViewportSize({ width: w, height: h });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const res = await page.goto(screen.path, { waitUntil: 'load', timeout: 30_000 });
    out.status = res?.status();
    out.finalPath = new URL(page.url()).pathname + new URL(page.url()).search;
    // A signed-in person sent to sign in means the run lost its session: its checks would be of the
    // sign-in page, not the screen (how the WebKit job once checked nothing it meant to).
    if (ROLES[role]?.person && out.finalPath.startsWith('/signin') && !screen.path.startsWith('/signin') && !screen.path.startsWith('/auth')) harnessMistakes.push(`${screen.id} (${role}, ${w}): signed out, sent to ${out.finalPath}`);
    out.ready = await ready(page);
    if (screen.action) {
      out.action = (await act(page, screen.action)) ? 'done' : 'not found';
      if (out.action === 'not found') harnessMistakes.push(`${screen.id} (${role}, ${w}): could not find what to open for "${screen.action}"`);
      await ready(page);
    }
    // The screenshot shows the page as it opened (before the keyboard walk scrolls it).
    if (SHOTS && SHOT_WIDTHS.has(w)) await page.screenshot({ path: path.join(OUT, 'shots', `${screen.id}--${role}--${w}--${theme}.png`) }).catch(() => {});
    Object.assign(out, await page.evaluate(layoutChecks, { phone: w <= 480 }));
    // The editor rules that can be measured (docs/editor-rules.md), wherever the canvas editor is open.
    out.editorRules = await page.evaluate(editorRules);
    out.vitals = await page.evaluate(vitals);
    // After the vitals (it adds and removes nodes): nothing outside the shell may make a tool page's document taller.
    out.shellShort = [...(out.shellShort || []), ...await page.evaluate(shellOutsideProbe)];
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

// Journeys across screens (scripts/ui/screens.mjs FLOWS). Edit from Projects: the filters pick the
// picture, the first tile with a picture opens the viewer, Edit opens the canvas editor, and the editor
// must show that picture (its title, the canvas), not a "can't open" state.
async function runFlows() {
  const out = [];
  for (const flow of FLOWS.filter((f) => inRun(f.from, f.role))) {
    const page = await contexts[flow.role].desktop.newPage();
    const problems = [], result = { id: flow.id, role: flow.role };
    page.on('pageerror', (e) => problems.push('Uncaught: ' + String(e.message).slice(0, 200)));
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await page.goto('/library', { waitUntil: 'load', timeout: 30_000 });
      await ready(page);
      for (const [label, option] of Object.entries(flow.filters)) { await page.getByLabel(label, { exact: true }).selectOption({ label: option }, { timeout: 5000 }); await ready(page); }
      const open = page.locator('.ds-tile:has(img) .ds-tile-open').first();
      await open.waitFor({ timeout: 10_000 });
      result.picture = (await open.innerText()).replace(/^Open\s+/, '').trim();
      await open.click({ timeout: 5000 });
      await page.locator('dialog[open]').getByRole('button', { name: 'Edit', exact: true }).click({ timeout: 5000 });
      await page.waitForURL(/\/editor\?/,{ timeout: 10_000 });
      const id = new URL(page.url()).searchParams.get('visual') || '';
      result.editor = '/editor?visual=' + id;
      if (!VISUAL_ID.test(id)) problems.push(`Edit sent the editor "${id}", not a picture id`);
      if (flow.expect && id !== flow.expect) problems.push(`Edit opened ${id}, not ${flow.expect}`);
      await page.locator('.canvas-editor-state, .canvas-editor .canvas-box canvas').first().waitFor({ timeout: 20_000 });
      if (await page.locator('.canvas-editor-state').count()) problems.push('the editor showed: ' + (await page.locator('.canvas-editor-state').innerText()).replace(/\s+/g, ' ').slice(0, 200));
      else {
        const title = ((await page.locator('.canvas-title').textContent()) || '').trim();
        if (title !== result.picture) problems.push(`the editor opened "${title}", not "${result.picture}"`);
      }
    } catch (e) { problems.push(String(e.message || e).split('\n')[0].slice(0, 200)); }
    finally { await page.close().catch(() => {}); }
    out.push({ ...result, ok: !problems.length, problems });
  }
  return out;
}

// The canvas editor's journeys (scripts/ui/screens.mjs EDITOR_JOURNEYS): what a person does, checked
// through what the page shows (the canvas's layer count and its undo steps, the address, the title, the
// save status), not the editor's internals.
async function runEditorJourneys() {
  const out = [], run = { ruleStates: [], editorPerf: null };
  for (const j of EDITOR_JOURNEYS.filter((f) => inRun(f.from, f.role))) {
    const page = await contexts[j.role].desktop.newPage();
    const problems = [];
    page.on('pageerror', (e) => problems.push('Uncaught: ' + String(e.message).slice(0, 200)));
    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
      await editorSteps()[j.id](page, problems, run);
    } catch (e) { problems.push(errorLine(e)); }
    finally { await page.close().catch(() => {}); }
    out.push({ id: j.id, role: j.role, ok: !problems.length, problems });
  }
  return { flows: out, ...run };
}
// Helpers below the main block are function declarations: the main block runs (and exits) before any
// top-level const after it is initialised (tests/ui-harness.test.mjs holds this).
function canvasOf(page) { return page.locator('.canvas-box[data-editable="true"]'); }
async function openEditor(page, id) {
  await page.goto('/editor?visual=' + id, { waitUntil: 'load', timeout: 30_000 });
  await canvasOf(page).locator('canvas').first().waitFor({ timeout: 20_000 });
  await ready(page);
  await drawn(page);
}
async function layersOf(page) { return Number((/(\d+) layers?/.exec((await canvasOf(page).getAttribute('aria-label')) || '') || [])[1]); }
async function stepsOf(page) { return Number(await canvasOf(page).getAttribute('data-undo-steps')); }
function savedWithin(page, ms) { return page.waitForFunction(() => document.querySelector('.canvas-bar [data-save-status]')?.getAttribute('data-save-status') === 'saved', null, { timeout: ms }); }
// The journeys wait for what the Studio says, never for a guessed time: the canvas says when it has drawn what it
// holds now (data-render, data-text-drawn: lib/editor/render-signal.ts), and every other wait is for the very thing the
// check after it reads. A wait that runs out says nothing itself; the check after it reports, as before.
/** Until `test` (run in the page, with `arg`) holds; false after `ms`. */
function until(page, test, arg = null, ms = 5000) { return page.waitForFunction(test, arg, { timeout: ms }).then(() => true, () => false); }
/** What the canvas says about its drawing: "drawing" or "ready", and each text layer as it was last drawn. */
async function drawnState(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.canvas-box [data-render]');
    if (!el) return null;
    const texts = (el.getAttribute('data-text-drawn') || '').split(' ').filter(Boolean).map((t) => { const [id, effect, drawer, font, marks] = t.split(':'); return { id, effect, drawer, font, marks: Number(marks) }; });
    return { render: el.getAttribute('data-render'), texts };
  }).catch(() => null);
}
/** Until the canvas has drawn what it holds now, every text's font settled ("ready"); with `match`, until a text layer
 *  was drawn so too (its effect, drawer and font, as data-text-drawn says). False after `ms`. */
function drawn(page, match = null, ms = 10_000) {
  return until(page, (m) => {
    const el = document.querySelector('.canvas-box [data-render]');
    if (!el || el.getAttribute('data-render') !== 'ready') return false;
    if (!m) return true;
    return (el.getAttribute('data-text-drawn') || '').split(' ').some((t) => { const [id, effect, drawer, font] = t.split(':'), p = { id, effect, drawer, font }; return Object.entries(m).every(([k, v]) => p[k] === v); });
  }, match, ms);
}
/** Until the undo history has moved from `from` steps, then until the canvas has drawn it. */
async function stepped(page, from, ms = 5000) {
  await until(page, (n) => Number(document.querySelector('.canvas-box[data-editable="true"]')?.getAttribute('data-undo-steps')) !== n, from, ms);
  await drawn(page);
}
/** Until the canvas says it holds `n` layers, then until it has drawn them. */
async function layersReach(page, n, ms = 10_000) {
  await until(page, (k) => { const l = /(\d+) layers?/.exec(document.querySelector('.canvas-box[data-editable="true"]')?.getAttribute('aria-label') || ''); return !!l && Number(l[1]) === k; }, n, ms);
  await drawn(page);
}
/** The browser's next drawn frame. */
function nextFrame(page) { return page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r()))); }
async function press(page, key) { await canvasOf(page).focus(); await page.keyboard.press(key); await drawn(page); }
// The rebuilt panel (feat/editor-panel-rules): its two tabs, the layers list's rows, the selection, the fields.
function panelOf(page) { return page.locator('aside.canvas-inspector'); }
async function tab(page, name) {
  await panelOf(page).getByRole('tab', { name, exact: true }).click({ timeout: 5000 });
  await until(page, (n) => [...document.querySelectorAll('aside.canvas-inspector [role="tab"]')].some((t) => t.textContent.trim() === n && t.getAttribute('aria-selected') === 'true'), name);
}
async function selectedOf(page) { return Number(await canvasOf(page).getAttribute('data-selected-count')) || 0; }
/** A row's own name button (a group's row comes before the rows inside it). */
function rowName(page, id) { return panelOf(page).locator(`li.canvas-layer-row[data-layer-id="${id}"]`).first().locator('.canvas-layer-name').first(); }
/** The layer ids of the list's top level (not the rows inside a group), top of the list first. */
async function topRowIds(page) {
  return page.evaluate(() => [...document.querySelectorAll('aside.canvas-inspector li.canvas-layer-row[data-layer-id]')].filter((li) => !li.parentElement?.closest('li.canvas-layer-row')).map((li) => li.getAttribute('data-layer-id')));
}
/** What has the keyboard focus: a tab (its words), a layer row's name (its layer), a field (its label), or inside the list at all. */
async function focusOf(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return {};
    return {
      tab: el.getAttribute('role') === 'tab' && el.closest('aside.canvas-inspector') ? el.textContent.trim() : null, selected: el.getAttribute('aria-selected'),
      layer: el.matches('.canvas-layer-name') ? el.closest('li.canvas-layer-row')?.getAttribute('data-layer-id') : null, pressed: el.getAttribute('aria-pressed'),
      field: el.matches('input, textarea') ? ([...(el.labels || [])].map((l) => l.textContent.trim()).join(' ') || el.getAttribute('aria-label') || '') : null,
      inList: !!el.closest('ol.canvas-layers'), canvas: el.matches('.canvas-box'),
    };
  });
}
/** Until the focus is where the check after it looks: the panel's tab named `arg` ("tab"), a selected tab ("selected"),
 *  a layer row's name ("layer"), another layer's row than `arg` ("another-layer"), or the "Layer name" field ("name-field"). */
function focusIs(page, kind, arg = null) {
  return until(page, ([k, a]) => {
    const el = document.activeElement;
    if (!el || el === document.body) return false;
    const row = el.matches('.canvas-layer-name') ? el.closest('li.canvas-layer-row')?.getAttribute('data-layer-id') : null;
    if (k === 'tab') return el.getAttribute('role') === 'tab' && !!el.closest('aside.canvas-inspector') && el.textContent.trim() === a;
    if (k === 'selected') return el.getAttribute('aria-selected') === 'true';
    if (k === 'layer') return !!row;
    if (k === 'another-layer') return !!row && row !== a;
    if (k === 'name-field') return el.matches('input, textarea') && (([...(el.labels || [])].map((l) => l.textContent.trim()).join(' ') || el.getAttribute('aria-label') || '') === 'Layer name');
    return false;
  }, [kind, arg], 3000);
}
/** A journey's thrown error in one line: its first line and, for a browser action, what it waited for and the last thing
 *  that stopped it (from the action's call log: an element over it, not visible, not enabled, not stable). */
function errorLine(e) {
  const lines = String(e?.message || e).split('\n').map((l) => l.trim());
  const waited = lines.find((l) => /^- waiting for /.test(l));
  const stopped = [...lines].reverse().find((l) => /intercepts pointer events|not visible|not enabled|not stable|not attached|outside of the viewport|not editable/.test(l));
  return [lines[0], waited, stopped].filter(Boolean).join(' ').slice(0, 600);
}
/** Clicks a control once a person could: a toast lying over it (each stays 6 s, components/ds/toast.tsx) is waited out,
 *  up to 10 s, and the harness's log says it was there. */
async function clickWhenFree(loc, what) {
  const over = await loc.evaluate((el) => { const r = el.getBoundingClientRect(), top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return top?.closest('.ds-toast') ? (top.closest('.ds-toast').textContent || '').trim().slice(0, 60) : null; }, null, { timeout: 5000 }).catch(() => null);
  if (over) console.log(`  (${what} was under a toast, "${over}": waiting until it can be clicked)`);
  await loc.click({ timeout: 10_000 });
}
/** Until the focus is inside an open dialog (it takes it once shown), so a key such as Escape goes to it. */
function focusInDialog(page) { return until(page, () => !!document.activeElement?.closest('[role="dialog"]'), null, 3000); }
/** Tab (only the Tab key) until the focus is what `want` accepts; false after `max` presses. */
async function tabUntil(page, want, max = 80) {
  // Tab moves the focus as part of the key press (the browser's own action), so it is read straight after.
  for (let i = 0; i < max; i++) { await page.keyboard.press('Tab'); if (want(await focusOf(page))) return true; }
  return false;
}
/** The selected layer's centre, read from the X, Y, W and H fields of Position & size (picture pixels). */
async function centreOf(page) {
  const section = panelOf(page).locator('[data-editor-section="position"]');
  const read = async (label) => Number(await section.getByLabel(label).first().inputValue({ timeout: 3000 }));
  const [x, y, w, h] = [await read(/^X$/), await read(/^Y$/), await read(/^(W|Width)$/), await read(/^(H|Height)$/)];
  return { x: x + w / 2, y: y + h / 2, ok: [x, y, w, h].every(Number.isFinite) };
}
/** One drag of the mouse in steps; `hold` (a key) is held from the first move to the drop. */
async function dragOn(page, from, to, hold) {
  await page.mouse.move(from[0], from[1]); await page.mouse.down();
  await page.mouse.move(from[0] + (to[0] - from[0]) * 0.1, from[1] + (to[1] - from[1]) * 0.1);
  if (hold) await page.keyboard.down(hold);
  for (let i = 2; i <= 10; i++) await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 10, from[1] + ((to[1] - from[1]) * i) / 10);
  await page.mouse.up();
  if (hold) await page.keyboard.up(hold);
  await drawn(page);
}
/** The layers in the Studio's draft of the editor's picture (-1: no draft), read with the context's own sign-in. */
async function studioLayers(context, origin) {
  const r = await context.request.get(`${origin}/api/edits/${EDITOR_VISUAL_ID}/draft`, { timeout: 10_000, failOnStatusCode: false });
  const d = await r.json().catch(() => ({}));
  return d?.draft?.doc?.layers ? Object.keys(d.draft.doc.layers).length : -1;
}
/** The Studio's draft of the editor's picture, as a failure message says it: its layers, change count and session. */
async function studioDraftOf(context, origin) {
  const r = await context.request.get(`${origin}/api/edits/${EDITOR_VISUAL_ID}/draft`, { timeout: 10_000, failOnStatusCode: false }).catch(() => null);
  if (!r) return 'unreachable';
  const d = await r.json().catch(() => ({}));
  return d?.draft?.doc?.layers ? { layers: Object.keys(d.draft.doc.layers).length, rev: d.draft.rev, session: d.draft.session ?? null } : { status: r.status() };
}
/** This device's copy of a picture's design (what the next opening may restore): its layers, change count and session. */
function deviceCopyOf(page, id) {
  return page.evaluate((k) => { try { const c = JSON.parse(localStorage.getItem('nmesis.editor.draft.' + k) || 'null'); return c ? { layers: Object.keys(c.doc?.layers || {}).length, rev: c.rev, session: c.session ?? null } : null; } catch { return 'unreadable'; } }, id).catch(() => 'unreadable');
}
/** Until the Studio's draft holds `want` layers (a request leaving with a closed page is on its own time). */
async function studioHas(context, origin, want, ms = 10_000) {
  for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 250))) if (await studioLayers(context, origin) === want) return true;
  return false;
}
/** Closes the tab as a person does: its beforeunload and pagehide run; resolves once it is closed. */
async function closeTab(page) { const closed = page.waitForEvent('close', { timeout: 15_000 }); await page.close({ runBeforeUnload: true }); await closed; }
/** Another tab in the same context, set up as the journeys' own. */
async function journeyPage(context, problems) {
  const p = await context.newPage();
  p.on('pageerror', (e) => problems.push('Uncaught: ' + String(e.message).slice(0, 200)));
  await p.setViewportSize({ width: 1440, height: 900 });
  await p.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  return p;
}
// Editor Phase 3's helpers (fonts, colour, effects).
/** The owner's company gets a brand kit with two fonts and two colours (the font list's first section). */
async function setBrandKit(page, problems) {
  const r = await page.request.put('/api/brand-kit', { data: { headingFont: 'Montserrat', bodyFont: 'Lato', colours: [{ hex: '#0A84FF', name: 'Demo blue' }, { hex: '#111111', name: 'Demo ink' }] }, headers: { origin: stack.origin }, failOnStatusCode: false });
  if (!r.ok()) problems.push(`the brand kit could not be set (${r.status()})`);
}
/** Opens the font list from the Text section's Font row; its listbox, or null. */
async function openFontList(page, problems) {
  await panelOf(page).locator('button.ds-font-button').first().click({ timeout: 5000 });
  const dialog = page.getByRole('dialog', { name: 'Fonts' });
  if (!(await dialog.count())) { problems.push('the Font row did not open the font list'); return null; }
  if (!(await page.evaluate(() => document.activeElement?.getAttribute('role') === 'combobox'))) problems.push('the font list did not put the focus in its search');
  return dialog.getByRole('listbox');
}
async function fontButtonText(page) { return ((await panelOf(page).locator('button.ds-font-button > span').first().textContent().catch(() => '')) || '').trim(); }
/** The canvas's text drawers in plain words (data-text-drawn, lib/editor/render-signal.ts). */
function drawerName(d) { return { shaped: 'shaping', path: 'letter-by-letter (text on a path)', text: 'straight text' }[d]; }
/** Until the font list's active row (the one Enter picks) is a family starting with `name`: the search has filtered it. */
function activeFont(page, name) { return until(page, (n) => (document.querySelector('[role="listbox"][aria-label="Fonts"] [role="option"][data-active]')?.getAttribute('data-font') || '').startsWith(n), name); }
/** Until the Text section's Font row names `name`. */
function fontButtonSays(page, name) { return until(page, (n) => (document.querySelector('aside.canvas-inspector button.ds-font-button > span')?.textContent || '').trim() === n, name); }
/** Until the page has loaded a face of this family (the catalogue's own file), up to 10 s. */
async function fontReady(page, family) {
  return page.waitForFunction((f) => [...document.fonts].some((x) => x.family.replace(/"/g, '') === f && x.status === 'loaded'), family, { timeout: 10_000 }).then(() => true, () => false);
}
/** The selected layer's box (picture pixels), from Position & size. */
async function selectedBox(page) {
  const section = panelOf(page).locator('[data-editor-section="position"]');
  const read = async (label) => Number(await section.getByLabel(label).first().inputValue({ timeout: 3000 }).catch(() => 'x'));
  const [x, y, width, height] = [await read(/^X$/), await read(/^Y$/), await read(/^(W|Width)$/), await read(/^(H|Height)$/)];
  return [x, y, width, height].every(Number.isFinite) ? { x, y, width, height } : null;
}
/** Download → PNG of the page, the file's bytes. */
async function downloadPng(page) {
  await page.locator('.canvas-bar').getByRole('button', { name: 'Download' }).click({ timeout: 5000 });
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.getByRole('menuitem', { name: /PNG/ }).first().click({ timeout: 5000 })]);
  return fs.readFileSync(await dl.path());
}
function decodePng(buf) { const p = decodePngFile(buf); return { width: p.width, height: p.height, channels: p.channels, data: p.data }; }
/** A picture's colour around (x, y) in another picture's pixels: the average of the pixels that fall in it. */
function sampleAt(img, x0, y0, k) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = Math.floor(y0 * k); y < Math.min(img.height, Math.floor((y0 + 1) * k)); y++) for (let x = Math.floor(x0 * k); x < Math.min(img.width, Math.floor((x0 + 1) * k)); x++) {
    const i = (y * img.width + x) * img.channels; r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
  }
  return n ? [r / n, g / n, b / n] : [0, 0, 0];
}
/**
 * The export against the canvas: the canvas's own pixels as shown (its drawing layer, without the handles), and
 * the export scaled down to them, compared around the text (its box and a margin for shadows and glows). Also how
 * far the export is from the one with no effect, so an effect that never reached the file fails too.
 */
async function compareWithCanvas(page, exported, none, box) {
  const shown = await page.evaluate(() => { const cv = window.Konva?.stages?.[0]?.getLayers()[0]?.getCanvas()._canvas; return cv ? cv.toDataURL('image/png').split(',')[1] : null; });
  if (!shown || !box) return null;
  const canvas = decodePng(Buffer.from(shown, 'base64')), k = exported.width / canvas.width, per = canvas.width / exported.width;
  const m = box.height * 0.6, x1 = Math.max(0, Math.floor((box.x - m) * per)), y1 = Math.max(0, Math.floor((box.y - m) * per));
  const x2 = Math.min(canvas.width - 1, Math.ceil((box.x + box.width + m) * per)), y2 = Math.min(canvas.height - 1, Math.ceil((box.y + box.height + m) * per));
  let vsCanvas = 0, vsNone = 0, n = 0;
  for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) {
    const e = sampleAt(exported, x, y, k), o = sampleAt(none, x, y, k), i = (y * canvas.width + x) * canvas.channels;
    for (let c = 0; c < 3; c++) { vsCanvas += Math.abs(e[c] - canvas.data[i + c]); vsNone += Math.abs(e[c] - o[c]); }
    n += 3;
  }
  return n ? { vsCanvas: vsCanvas / n, vsNone: vsNone / n } : null;
}
function pct(xs, p) { const s = [...xs].sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))] * 10) / 10 : 0; }
function editorSteps() { return {
  // Editor Phase 3 (feat/editor-fonts-colour-effects). The font list from the Text section's Font row: the brand
  // kit's fonts come first; a brand font, then an Arabic one, load from the Studio's own files (never the font
  // service) and draw; Arabic typed in the Words field is drawn right to left in one run (its letters join). A font
  // that can't load says "Missing font" on its layer, in the Layers list and in the panel.
  'editor-font-picker': async (page, problems) => {
    await setBrandKit(page, problems);
    await openEditor(page, EDITOR_VISUAL_ID);
    // The other journeys' layers out of the way (one step: everything on the page, deleted).
    await press(page, 'Control+a'); await press(page, 'Delete');
    await press(page, 't');
    await tab(page, 'Design');
    const list = await openFontList(page, problems);
    if (!list) return;
    const titles = await list.locator('.ds-font-group-title').allTextContents();
    if (titles[0] !== 'Brand fonts') problems.push(`the font list starts with ${JSON.stringify(titles.slice(0, 2))}, not Brand fonts`);
    for (const t of ['In this design', 'All fonts']) if (!titles.includes(t)) problems.push(`the font list has no "${t}" section (${titles.join(', ')})`);
    const all = await list.locator('[role="option"]').count();
    if (all < 140) problems.push(`the font list shows ${all} names`);
    // Each name in its own font from its tiny preview file, and only the rows on screen: counted once the previews the
    // list asked for have arrived (none still loading).
    await until(page, () => { const p = [...document.fonts].filter((f) => f.family.replace(/"/g, '').startsWith('nm-preview-')); return p.length >= 4 && p.every((f) => f.status === 'loaded' || f.status === 'error'); }, null, 10_000);
    const previews = await page.evaluate(() => [...document.fonts].filter((f) => f.family.replace(/"/g, '').startsWith('nm-preview-') && f.status === 'loaded').length);
    if (previews < 4) problems.push(`only ${previews} names show in their own font`);
    if (previews > 60) problems.push(`${previews} previews loaded at once: the list should load only the rows on screen`);
    if (SHOTS) await page.screenshot({ path: path.join(OUT, 'shots', 'phase3-font-picker--1440--light.png') }).catch(() => {});
    const s0 = await stepsOf(page);
    await list.locator('[role="group"]').first().locator('[role="option"][data-font="Montserrat"]').click({ timeout: 5000 });
    await stepped(page, s0);
    if (await stepsOf(page) !== s0 + 1) problems.push(`picking a font made ${(await stepsOf(page)) - s0} undo steps, not 1`);
    if (!(await fontReady(page, 'nm-montserrat'))) problems.push('the brand font Montserrat did not load from the Studio’s files');
    if ((await fontButtonText(page)) !== 'Montserrat') problems.push(`the Font row says ${await fontButtonText(page)}, not Montserrat`);
    // An Arabic font, found by search and picked with the keyboard (Enter on the first match).
    const again = await openFontList(page, problems);
    if (!again) return;
    await page.keyboard.type('Noto Kufi');
    await activeFont(page, 'Noto Kufi');
    await page.keyboard.press('Enter');
    await fontButtonSays(page, 'Noto Kufi Arabic');
    if ((await fontButtonText(page)) !== 'Noto Kufi Arabic') problems.push(`Enter on the search picked ${await fontButtonText(page)}, not Noto Kufi Arabic`);
    const words = panelOf(page).locator('[data-editor-section="text"] textarea').first();
    await words.fill('سيارة جديدة للعائلة');
    await drawn(page);
    if (!(await fontReady(page, 'nm-noto-kufi-arabic'))) problems.push('Noto Kufi Arabic did not load');
    const arabic = await page.evaluate(() => {
      const stage = window.Konva?.stages?.[0];
      const t = stage?.find('Text').find((n) => /[؀-ۿ]/.test(n.text()));
      if (!t) return null;
      return { direction: t.direction(), family: t.fontFamily(), shaped: document.fonts.check(`400 40px "nm-noto-kufi-arabic"`, 'س') };
    });
    if (!arabic) problems.push('no text on the canvas holds the Arabic words');
    else {
      if (arabic.direction !== 'rtl') problems.push(`the Arabic text is drawn ${arabic.direction}, not right to left`);
      if (!arabic.family.startsWith('"nm-noto-kufi-arabic"')) problems.push(`the Arabic text is drawn in ${arabic.family}`);
      if (!arabic.shaped) problems.push('the Arabic font has no face for Arabic letters');
    }
    if (SHOTS) await canvasOf(page).screenshot({ path: path.join(OUT, 'shots', 'phase3-arabic-rtl--1440--light.png') }).catch(() => {});
    // A font whose file can't load: "Missing font" on the layer, in the Layers list and in the panel; never a silent swap.
    await page.route('**/fonts/lobster/**', (r) => r.abort('failed'));
    const third = await openFontList(page, problems);
    if (!third) return;
    await page.keyboard.type('Lobster'); await activeFont(page, 'Lobster'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('[data-missing-font]').length >= 2, null, { timeout: 15_000 }).catch(() => {});
    if (!(await panelOf(page).locator('[data-editor-section="text"] [data-missing-font]').count())) problems.push('the panel does not say "Missing font" for a font that couldn’t load');
    if (!(await canvasOf(page).locator('[data-missing-font]').count())) problems.push('the layer on the canvas does not say "Missing font"');
    if (!(await page.locator('[data-missing-fonts]').count())) problems.push('no notice says a font is missing');
    await tab(page, 'Layers');
    if (!(await panelOf(page).locator('[data-missing-font]').count())) problems.push('the Layers list does not say "Missing font"');
    await tab(page, 'Design');
    await page.unroute('**/fonts/lobster/**');
  },
  // The company's own fonts (editor Phase 4): uploaded on the Brand page by an owner (the licence first; two files
  // chosen at once, a third dropped on the area), joined into families by their own names; picked first under Brand
  // fonts; typed, weighted and exported in their own face (from a short-lived signed link); curved Arabic with its
  // letters joined (the canvas's own drawing, laid flat, shows the same ink shapes as the line drawn whole in this
  // browser); and removed, after which the design says "Missing font" and is never drawn in another font without saying so.
  'editor-brand-fonts': async (page, problems) => {
    const fx = await import('../tests/support/font-fixtures.mjs');
    const demo = await fx.demoSans(), arabic = await fx.demoArabic();
    await page.goto('/company/brand', { waitUntil: 'load', timeout: 30_000 });
    const section = page.locator('[data-brand-fonts]');
    await section.waitFor({ timeout: 15_000 });
    // The section shows itself before the company's fonts are listed ("Loading your fonts"): what an owner may do is known after.
    await section.locator('[aria-busy="true"]').first().waitFor({ state: 'detached', timeout: 20_000 }).catch(() => problems.push('Brand → Your fonts was still loading after 20 s'));
    const input = section.locator('[data-brand-font-upload] input[type="file"]');
    if (!(await input.count())) { problems.push(`Brand → Your fonts has no upload for an owner (it says ${JSON.stringify(((await section.textContent()) || '').replace(/\s+/g, ' ').trim().slice(0, 160))})`); return; }
    const zone = section.locator('[data-brand-font-upload] .ds-drop-zone');
    if (!(await zone.locator('button').first().isDisabled())) problems.push('fonts can be added before the licence is confirmed');
    await section.locator('input[data-licence]').check({ timeout: 5000 });
    const readyFonts = (n) => page.waitForFunction((k) => document.querySelectorAll('[data-brand-font][data-status="ready"]').length >= k, n, { timeout: 60_000 }).then(() => true, () => false);
    await input.setInputFiles([
      { name: 'DemoSans-Regular.ttf', mimeType: 'font/ttf', buffer: Buffer.from(demo.regular) },
      { name: 'DemoArabic.ttf', mimeType: 'font/ttf', buffer: Buffer.from(arabic) },
    ]);
    if (!(await readyFonts(2))) problems.push('two fonts chosen at once were not both added');
    // Dropped on the area, as from the desktop: the area takes the drag (it lights up) and adds the file.
    const dropped = await page.evaluateHandle(([name, b64]) => {
      const dt = new DataTransfer();
      dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], name, { type: 'font/ttf' }));
      return dt;
    }, ['DemoSans-Bold.ttf', Buffer.from(demo.bold).toString('base64')]);
    await zone.dispatchEvent('dragenter', { dataTransfer: dropped });
    await zone.dispatchEvent('dragover', { dataTransfer: dropped });
    if ((await zone.getAttribute('data-drag')) !== 'true') problems.push('the upload area does not take a font file dragged over it');
    await zone.dispatchEvent('drop', { dataTransfer: dropped });
    if (!(await readyFonts(3))) problems.push('a font dropped on the upload area was not added');
    const families = await section.locator('.brand-font-card').evaluateAll((cards) => cards.map((c) => [c.querySelector('.brand-font-family')?.textContent, c.querySelectorAll('[data-brand-font]').length]));
    if (JSON.stringify(families) !== JSON.stringify([['Demo Arabic', 1], ['Demo Sans', 2]])) problems.push(`the uploads are listed as ${JSON.stringify(families)}, not Demo Arabic (1 file) and Demo Sans (Regular and Bold)`);
    if (SHOTS) await section.screenshot({ path: path.join(OUT, 'shots', 'phase4-brand-fonts--1440--light.png') }).catch(() => {});
    // Pick, type and weigh in the editor.
    await openEditor(page, EDITOR_VISUAL_ID);
    await press(page, 'Control+a'); await press(page, 'Delete');
    await press(page, 't');
    await tab(page, 'Design');
    const list = await openFontList(page, problems);
    if (!list) return;
    // The list says it is busy until the company's fonts are listed (they come first, so the rows would move).
    await page.waitForFunction(() => !document.querySelector('[role="listbox"][aria-label="Fonts"][aria-busy="true"]'), null, { timeout: 15_000 }).catch(() => problems.push('the font list was still listing the company’s fonts after 15 s'));
    const brand = await list.locator('[role="group"]').first().locator('[role="option"]').evaluateAll((os) => os.map((o) => o.getAttribute('data-font')));
    if (brand[0] !== 'brand:Demo Arabic' || brand[1] !== 'brand:Demo Sans') problems.push(`Brand fonts start with ${JSON.stringify(brand.slice(0, 3))}, not the uploads`);
    if (!(await page.getByRole('dialog', { name: 'Fonts' }).getByRole('button', { name: 'Upload a font' }).count())) problems.push('the font list has no "Upload a font" for an owner');
    const s0 = await stepsOf(page);
    await list.locator('[role="option"][data-font="brand:Demo Sans"]').first().click({ timeout: 5000 });
    await stepped(page, s0);
    if (await stepsOf(page) !== s0 + 1) problems.push(`picking an uploaded font made ${(await stepsOf(page)) - s0} undo steps, not 1`);
    if ((await fontButtonText(page)) !== 'Demo Sans') problems.push(`the Font row says ${await fontButtonText(page)}, not Demo Sans`);
    await panelOf(page).locator('[data-editor-section="text"] textarea').first().fill('DEMO SUV');
    const loaded = await page.waitForFunction(() => [...document.fonts].some((f) => f.family.replace(/"/g, '').startsWith('nm-brand-') && f.status === 'loaded'), null, { timeout: 15_000 }).then(() => true, () => false);
    if (!loaded) problems.push('the uploaded font did not load from its signed link');
    const weights = await panelOf(page).locator('[data-editor-section="text"]').getByRole('radio').allTextContents().catch(() => []);
    if (!weights.includes('Bold') || !weights.includes('Regular')) problems.push(`the Weight row offers ${JSON.stringify(weights)}, not the family's Regular and Bold`);
    const drawnIn = await page.evaluate(() => window.Konva?.stages?.[0]?.find('Text').find((n) => n.text() === 'DEMO SUV')?.fontFamily() || '');
    if (!drawnIn.startsWith('"nm-brand-')) problems.push(`the text is drawn in ${drawnIn}, not the uploaded font`);
    // The export waits for the font and says nothing is missing.
    const png = decodePng(await downloadPng(page));
    if (!(png.width > 0)) problems.push('the export made no picture');
    if (await page.getByText(/Made with Inter in place of/).count()) problems.push('the export was made with the fallback, not the uploaded font');
    // Curved Arabic in the uploaded Arabic font: drawn shaped, letters joined.
    await press(page, 't');
    const again = await openFontList(page, problems);
    if (!again) return;
    await again.locator('[role="option"][data-font="brand:Demo Arabic"]').first().click({ timeout: 5000 });
    await panelOf(page).locator('[data-editor-section="text"] textarea').first().fill('محمد سيارة');
    const effects = panelOf(page).locator('[data-editor-section="effects"]');
    await effects.locator('[role="radio"][data-effect="curve"]').click({ timeout: 5000 });
    // The canvas says when it has drawn the curved text, its font settled (data-render and data-text-drawn,
    // lib/editor/render-signal.ts); only then is the drawer read. Drawn by another drawer, or by the shaping drawer with
    // nothing placed, is the Studio's own drawing in this browser, not the journey's timing.
    const curvedDrawn = await drawn(page, { effect: 'curve' });
    const curvedSaid = await drawnState(page), arcs = (curvedSaid?.texts || []).filter((t) => t.effect === 'curve');
    if (!curvedDrawn) problems.push(`the canvas never said it had drawn the curved text, its font settled, within 10 s (it says ${JSON.stringify(curvedSaid)})`);
    else for (const arc of arcs) {
      if (arc.drawer !== 'shaped') problems.push(`curved Arabic was drawn by the ${drawerName(arc.drawer) || arc.drawer} drawer, not the shaping drawer (its font ${arc.font})`);
      else if (!(arc.marks > 0)) problems.push(`the shaping drawer drew nothing for curved Arabic (its font ${arc.font})`);
      if (arc.font !== 'loaded') problems.push(`curved Arabic was drawn with its font ${arc.font}, not in the uploaded Arabic font`);
    }
    const shapedDrawer = () => page.evaluate(() => (window.Konva?.stages?.[0]?.find((n) => n.getClassName() === 'Shape' && n.getAttr('data-curve-shaped')) || []).length);
    if (!(await shapedDrawer())) problems.push('curved Arabic is not drawn by the shaping drawer');
    if (SHOTS) await canvasOf(page).screenshot({ path: path.join(OUT, 'shots', 'phase4-curved-arabic--1440--light.png') }).catch(() => {});
    // Laid flat (Curve 0), the drawer's letters must show exactly what this browser draws for the line whole, in the same
    // font and size: the same number of separate ink shapes. A letter drawn alone, or in another font, breaks a join.
    const curve = effects.getByRole('spinbutton', { name: /^Curve/ });
    const sFlat = await stepsOf(page);
    await curve.fill('0'); await curve.blur();
    await stepped(page, sFlat);
    await drawn(page, { effect: 'curve', drawer: 'shaped' });
    const flat = await page.evaluate((line) => {
      const shape = window.Konva?.stages?.[0]?.find((n) => n.getClassName() === 'Shape' && n.getAttr('data-curve-shaped'))[0];
      if (!shape) return null;
      const inkShapes = (c) => {
        const W = c.width, H = c.height, d = c.getContext('2d').getImageData(0, 0, W, H).data, seen = new Uint8Array(W * H); let n = 0;
        for (let i = 0; i < seen.length; i++) {
          if (seen[i] || d[i * 4 + 3] < 128) continue; n++; const stack = [i]; seen[i] = 1;
          while (stack.length) { const k = stack.pop(), px = k % W, py = (k - px) / W; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const qx = px + dx, qy = py + dy, q = qy * W + qx; if (qx >= 0 && qx < W && qy >= 0 && qy < H && !seen[q] && d[q * 4 + 3] >= 128) { seen[q] = 1; stack.push(q); } } }
        }
        return n;
      };
      // Both at about 96 px type (thin strokes at the editor's zoom would decide by a pixel), with room round the box.
      const font = shape.getAttr('data-font'), size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] || '0'), scale = shape.getAbsoluteScale().x;
      const k = Math.max(1, 96 / (size * scale)), r = shape.getClientRect();
      const drawn = shape.toCanvas({ x: r.x - r.width, y: r.y - r.height, width: r.width * 3, height: r.height * 3, pixelRatio: k });
      const whole = document.createElement('canvas'); whole.width = drawn.width; whole.height = drawn.height;
      const x = whole.getContext('2d'); x.setTransform(scale * k, 0, 0, scale * k, r.width * k, r.height * k);
      x.font = font; x.textBaseline = 'middle'; x.textAlign = 'center'; x.direction = 'rtl'; x.fillStyle = '#000';
      x.fillText(line, shape.width() / 2, size / 2);
      return { drawn: inkShapes(drawn), whole: inkShapes(whole), size: [drawn.width, drawn.height] };
    }, 'محمد سيارة');
    if (!flat) problems.push('curved Arabic laid flat is not drawn by the shaping drawer');
    else if (!flat.whole || flat.drawn !== flat.whole) problems.push(`curved Arabic letters don't join in this browser: laid flat they make ${flat.drawn} separate ink shapes, the line drawn whole ${flat.whole} (${flat.size.join(' x ')} px)`);
    await savedWithin(page, 15_000).catch(() => problems.push('the design was not saved before removing the font'));
    // Remove Demo Sans (both files, as an owner on the Brand page would): the design says "Missing font".
    const listed = await page.request.get('/api/brand-fonts', { failOnStatusCode: false }).then((r) => r.json()).catch(() => ({ fonts: [] }));
    for (const f of (listed.fonts || []).filter((x) => x.family === 'Demo Sans')) {
      const r = await page.request.delete('/api/brand-fonts/' + f.id, { headers: { origin: stack.origin }, failOnStatusCode: false });
      if (!r.ok()) problems.push(`removing ${f.style} answered ${r.status()}`);
    }
    await openEditor(page, EDITOR_VISUAL_ID);
    await page.waitForFunction(() => document.querySelectorAll('[data-missing-fonts]').length > 0, null, { timeout: 15_000 }).catch(() => {});
    const notice = (await page.locator('[data-missing-fonts]').first().textContent().catch(() => '')) || '';
    if (!/Missing font: Demo Sans/.test(notice)) problems.push(`after removing Demo Sans the editor says ${JSON.stringify(notice.slice(0, 80))}, not "Missing font: Demo Sans"`);
    if (!(await canvasOf(page).locator('[data-missing-font]').count())) problems.push('the layer using the removed font does not say "Missing font"');
    // Clean up for the next run: the Arabic font too.
    for (const f of (listed.fonts || []).filter((x) => x.family !== 'Demo Sans')) await page.request.delete('/api/brand-fonts/' + f.id, { headers: { origin: stack.origin }, failOnStatusCode: false }).catch(() => {});
  },
  // Each text effect, one at a time: a tile replaces the effect in one undo step; a slider's drag is one step;
  // the canvas and the exported PNG at full size draw the same picture (the export, scaled to the canvas, is
  // compared with what the canvas shows, around the text); curved text still types on a double-click.
  'editor-text-effects': async (page, problems) => {
    await openEditor(page, EDITOR_VISUAL_ID);
    await press(page, 'Control+a'); await press(page, 'Delete');
    await press(page, 't');
    await tab(page, 'Design');
    await panelOf(page).locator('[data-editor-section="text"] textarea').first().fill('DEMO SUV');
    await drawn(page);
    const box = await selectedBox(page);
    const exportOf = async () => decodePng(await downloadPng(page));
    const none = await exportOf();
    for (const kind of ['shadow', 'outline', 'lift', 'neon', 'background', 'curve']) {
      const s0 = await stepsOf(page);
      await clickWhenFree(panelOf(page).locator(`[data-editor-section="effects"] [role="radio"][data-effect="${kind}"]`), `the ${kind} tile`);
      await stepped(page, s0);
      if (await stepsOf(page) !== s0 + 1) problems.push(`${kind}: picking the tile made ${(await stepsOf(page)) - s0} undo steps, not 1`);
      const checked = await panelOf(page).locator('[data-editor-section="effects"] [role="radio"][aria-checked="true"]').getAttribute('data-effect');
      if (checked !== kind) problems.push(`${kind}: the tile chosen is ${checked}`);
      const controls = await panelOf(page).locator('[data-editor-section="effects"] [data-editor-row]').count() - 1;
      if (controls < 1 || controls > 5) problems.push(`${kind}: ${controls} controls`);
      if (kind === 'shadow') {
        // One drag of the Blur slider is one undo step.
        const range = panelOf(page).locator('[data-editor-section="effects"] [data-editor-row]', { hasText: 'Blur' }).locator('input[type="range"]').first();
        // Until the slider is still (the same box two frames running), so the drag starts where it is drawn.
        await range.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {}); await range.hover({ trial: true, timeout: 3000 }).catch(() => {});
        const r = await range.boundingBox(), s1 = await stepsOf(page);
        if (!r) problems.push("the Blur slider is not on screen");
        if (r) { await page.mouse.move(r.x + r.width * 0.2, r.y + r.height / 2); await page.mouse.down(); for (let i = 3; i <= 9; i++) await page.mouse.move(r.x + r.width * i / 10, r.y + r.height / 2); await page.mouse.up(); await stepped(page, s1); }
        if (await stepsOf(page) !== s1 + 1) problems.push(`one drag of the Blur slider made ${(await stepsOf(page)) - s1} undo steps, not 1`);
      }
      await drawn(page);
      const after = await selectedBox(page) || box;
      const file = await downloadPng(page);
      if (SHOTS) {
        fs.writeFileSync(path.join(OUT, 'shots', `phase3-effect-${kind}--export.png`), file);
        await canvasOf(page).screenshot({ path: path.join(OUT, 'shots', `phase3-effect-${kind}--canvas.png`) }).catch(() => {});
      }
      const cmp = await compareWithCanvas(page, decodePng(file), none, after);
      if (!cmp) { problems.push(`${kind}: the export could not be compared with the canvas`); continue; }
      if (cmp.vsCanvas > 14) problems.push(`${kind}: the export differs from the canvas around the text by ${cmp.vsCanvas.toFixed(1)} (of 255) on average`);
      if (cmp.vsNone < 1.5) problems.push(`${kind}: the export looks the same as with no effect (${cmp.vsNone.toFixed(2)})`);
    }
    // Curved text still types: a double-click on it opens the text box.
    const b = await selectedBox(page);
    if (b) {
      const c = await canvasOf(page).boundingBox(), s = c.width / 1536;
      await page.mouse.dblclick(c.x + (b.x + b.width / 2) * s, c.y + (b.y + b.height / 2) * s);
      // Until the text box is open and has the focus (it takes it once shown), so Escape goes to it, not to the canvas.
      await until(page, () => !!document.activeElement?.matches('.canvas-text-editor'));
      if (!(await page.locator('.canvas-text-editor').count())) problems.push('a double-click on curved text did not open the text box');
      await page.keyboard.press('Escape');
    }
    // None takes the effect off, in one step.
    const s2 = await stepsOf(page);
    await clickWhenFree(panelOf(page).locator('[data-editor-section="effects"] [role="radio"][data-effect="none"]'), 'the None tile');
    await stepped(page, s2);
    if (await stepsOf(page) !== s2 + 1) problems.push('None did not take the effect off in one step');
  },
  // The eyedropper where the browser has none (as in Safari and Firefox): "From the canvas", then a click on the
  // canvas, and the shape's fill is the colour under the click; one undo step.
  'editor-eyedropper': async (page, problems) => {
    await page.addInitScript(() => { try { delete window.EyeDropper; } catch { window.EyeDropper = undefined; } });
    await openEditor(page, V1_DESIGN_ID);
    const fixture = JSON.parse(fs.readFileSync('tests/fixtures/editor-v1/every-kind.json', 'utf8'));
    const shape = fixture.layers.find((l) => l.kind === 'shape');
    await tab(page, 'Layers');
    await rowName(page, shape.id).click({ timeout: 5000 });
    await tab(page, 'Design');
    const fill = panelOf(page).locator('[data-editor-section="appearance"] button.ds-colour-button').first();
    const before = (await fill.textContent()).trim();
    await fill.click({ timeout: 5000 });
    const pop = page.getByRole('dialog', { name: 'Fill' });
    if (!(await pop.count())) { problems.push('the Fill colour picker did not open'); return; }
    if (SHOTS) await page.screenshot({ path: path.join(OUT, 'shots', 'phase3-colour-popover--1440--light.png') }).catch(() => {});
    await pop.getByRole('button', { name: 'From the canvas' }).click({ timeout: 5000 });
    if (!(await page.locator('[data-picking]').count())) problems.push('no line says to click the canvas');
    const c = await canvasOf(page).boundingBox(), at = [c.x + c.width * 0.03, c.y + c.height * 0.97];
    const want = await page.evaluate(([x, y]) => {
      const stage = window.Konva?.stages?.[0], layer = stage?.getLayers()[0], cv = layer?.getCanvas()._canvas, r = cv?.getBoundingClientRect();
      if (!cv) return null;
      const px = cv.getContext('2d').getImageData(Math.round((x - r.left) * cv.width / r.width), Math.round((y - r.top) * cv.height / r.height), 1, 1).data;
      return '#' + [px[0], px[1], px[2]].map((n) => n.toString(16).padStart(2, '0').toUpperCase()).join('');
    }, at);
    const s0 = await stepsOf(page);
    await page.mouse.click(at[0], at[1]);
    await stepped(page, s0);
    const now = (await fill.textContent()).trim();
    if (now === before) problems.push(`the fill is still ${before} after picking from the canvas`);
    if (want && !now.startsWith(want)) problems.push(`the fill is ${now}, not the canvas’s ${want} under the click`);
    if (await stepsOf(page) !== s0 + 1) problems.push(`picking from the canvas made ${(await stepsOf(page)) - s0} undo steps, not 1`);
    await page.keyboard.press('Escape');
  },
  // A gradient page background: the page as a colour, then Linear in its colour picker, a third stop and a new
  // angle; the canvas draws it, each change is one step, and the working draft keeps it.
  'editor-gradient-background': async (page, problems, run) => {
    await openEditor(page, EDITOR_VISUAL_ID);
    await press(page, 'Escape');
    await tab(page, 'Design');
    const page1 = panelOf(page).locator('[data-editor-section="page"]');
    await page1.getByRole('radio', { name: 'A colour' }).click({ timeout: 5000 });
    await drawn(page);
    await page1.locator('button.ds-colour-button').first().click({ timeout: 5000 });
    const pop = page.getByRole('dialog', { name: 'Background colour' });
    if (!(await pop.count())) { problems.push('the background colour picker did not open'); return; }
    const s0 = await stepsOf(page);
    await pop.getByRole('radio', { name: 'Linear' }).click({ timeout: 5000 });
    await stepped(page, s0);
    if (await stepsOf(page) !== s0 + 1) problems.push(`Linear made ${(await stepsOf(page)) - s0} undo steps, not 1`);
    await pop.getByRole('button', { name: 'Add a stop' }).click({ timeout: 5000 });
    await pop.getByRole('spinbutton', { name: /^Angle/ }).fill('135');
    await pop.getByRole('spinbutton', { name: /^Angle/ }).blur();
    // Until the canvas holds the third stop, then until it has drawn it.
    await until(page, () => (window.Konva?.stages?.[0]?.findOne('.background')?.fillLinearGradientColorStops() || []).length / 2 >= 3);
    await drawn(page);
    if (SHOTS) await page.screenshot({ path: path.join(OUT, 'shots', 'phase3-gradient-background--1440--light.png') }).catch(() => {});
    // The rule counts with the colour picker open (it lies over the panel, never the canvas).
    run.ruleStates.push({ screen: 'editor', state: 'colour-popover-gradient', role: 'owner', w: 1440, h: 900, theme: 'light', editorRules: await page.evaluate(editorRules) });
    const bg = await page.evaluate(() => { const n = window.Konva?.stages?.[0]?.findOne('.background'); return n ? { priority: n.fillPriority(), stops: (n.fillLinearGradientColorStops() || []).length / 2 } : null; });
    if (!bg || bg.priority !== 'linear-gradient') problems.push(`the canvas draws the page as ${JSON.stringify(bg)}, not a linear gradient`);
    else if (bg.stops !== 3) problems.push(`the gradient has ${bg.stops} stops, not 3`);
    await page.keyboard.press('Escape');
    await savedWithin(page, 15_000).catch(() => problems.push('the gradient was not saved to the working draft'));
    const r = await page.request.get(`/api/edits/${EDITOR_VISUAL_ID}/draft`, { timeout: 10_000, failOnStatusCode: false });
    const d = await r.json().catch(() => ({}));
    const kept = d?.draft?.doc?.pages?.[0]?.background;
    if (kept?.gradient?.type !== 'linear' || kept.gradient.stops.length !== 3 || kept.gradient.angle !== 135) problems.push(`the draft keeps ${JSON.stringify(kept)}`);
    // Back to the picture, so the other journeys open the design they expect.
    await page1.getByRole('radio', { name: 'Your picture' }).click({ timeout: 5000 }).catch(() => {});
    await savedWithin(page, 15_000).catch(() => {});
  },
  // A design saved before format v2 opens with every layer, through the upgrade.
  'editor-open-v1-design': async (page, problems) => {
    const want = JSON.parse(fs.readFileSync('tests/fixtures/editor-v1/every-kind.json', 'utf8')).layers.length;
    await openEditor(page, V1_DESIGN_ID);
    await tab(page, 'Layers');
    const n = await layersOf(page), listed = await panelOf(page).locator('li.canvas-layer-row[data-layer-id]').count();
    if (n !== want) problems.push(`the v1 design opened with ${n} layers, not ${want}`);
    if (listed !== want) problems.push(`its Layers list shows ${listed}, not ${want}`);
  },
  // The panel against the editor rules (docs/editor-rules.md) in each kind of selection, at each size: nothing
  // selected, one layer of each kind (picked in the Layers tab, read in the Design tab), three layers, and the
  // Layers tab itself. Each measurement is a rule state, counted in the ratchet under the editor screen; this
  // journey fails only when a state cannot be reached (the selection is not what was picked).
  'editor-rule-states': async (page, problems, run) => {
    const fixture = JSON.parse(fs.readFileSync('tests/fixtures/editor-v1/every-kind.json', 'utf8'));
    const one = {};
    for (const l of fixture.layers) if (!one[l.kind]) one[l.kind] = l.id;
    const three = [one.text, one.shape, one.icon].filter(Boolean);
    for (const [w, h] of RULE_STATE_SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await openEditor(page, V1_DESIGN_ID);
      const measure = async (state, want) => {
        // Until the selection is what was picked and the canvas has drawn it.
        await until(page, (k) => Number(document.querySelector('.canvas-box[data-editable="true"]')?.getAttribute('data-selected-count')) === k, want);
        await drawn(page);
        const n = await selectedOf(page);
        if (n !== want) problems.push(`${state} at ${w} x ${h}: ${n} layers selected, not ${want}`);
        // The picture as a person first sees it (every "More" folded); then each "More" is opened, so the rules
        // are measured on the folded controls too, and folded again for the next state.
        if (SHOTS) await page.screenshot({ path: path.join(OUT, 'shots', `editor-state-${state}--${w}--light.png`) }).catch(() => {});
        const opened = await page.evaluate(() => { const shut = [...document.querySelectorAll('aside.canvas-inspector details:not([open])')]; for (const d of shut) d.open = true; return shut.length; });
        run.ruleStates.push({ screen: 'editor', state, role: 'owner', w, h, theme: 'light', editorRules: await page.evaluate(editorRules) });
        if (opened) await page.evaluate(() => { for (const d of document.querySelectorAll('aside.canvas-inspector details[open]')) d.open = false; });
      };
      await tab(page, 'Design');
      await measure('nothing', 0);
      for (const [kind, id] of Object.entries(one)) {
        await tab(page, 'Layers');
        await rowName(page, id).click({ timeout: 5000 });
        await tab(page, 'Design');
        await measure('one-' + kind, 1);
      }
      // The font list and the colour picker open (each lies over the panel, never the canvas): the counts stay at zero.
      if (one.text) {
        await tab(page, 'Layers'); await rowName(page, one.text).click({ timeout: 5000 }); await tab(page, 'Design');
        await panelOf(page).locator('button.ds-font-button').first().click({ timeout: 5000 });
        await page.getByRole('dialog', { name: 'Fonts' }).waitFor({ timeout: 5000 }).catch(() => {});
        await measure('font-popover', 1); await focusInDialog(page); await page.keyboard.press('Escape');
        await page.getByRole('dialog', { name: 'Fonts' }).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
        await panelOf(page).locator('[data-editor-section="text"] button.ds-colour-button').first().click({ timeout: 5000 });
        await page.getByRole('dialog').first().waitFor({ timeout: 5000 }).catch(() => {});
        await measure('colour-popover', 1); await focusInDialog(page); await page.keyboard.press('Escape');
        await page.getByRole('dialog').first().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
      }
      await tab(page, 'Layers');
      await rowName(page, three[0]).click({ timeout: 5000 });
      for (const id of three.slice(1)) await rowName(page, id).click({ modifiers: ['Shift'], timeout: 5000 });
      await measure('layers-tab', three.length);
      await tab(page, 'Design');
      await measure('several', three.length);
    }
  },
  // Toasts in the editor (fix/editor-toasts): four at once lie in the canvas column (the editor's ToastSlot, over
  // its light table), never over the right panel, the left navigation or its panel, the canvas bar, a notice or
  // the page strip: each size, with nothing open on the left and then with Elements open, is a rule state
  // (editorToastOverPanels, ratcheted at zero under the editor screen). Ctrl+G with nothing selected says
  // "Choose two or more layers…" and changes nothing, so four of them are four toasts and no undo step. Where
  // the column is too short for four (as at 1024 x 768 with Elements open), the older ones fold; the newest shows.
  'editor-toasts': async (page, problems, run) => {
    const toasts = page.locator('.ds-toasts .ds-toast');
    const elements = page.locator('.studio-side').getByRole('button', { name: 'Elements', exact: true });
    for (const [w, h] of TOAST_SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await openEditor(page, EDITOR_VISUAL_ID);
      for (const state of ['four-toasts', 'four-toasts-elements-open']) {
        if (state === 'four-toasts-elements-open') {
          await elements.click({ timeout: 5000 });
          await page.locator('.studio-panel').waitFor({ timeout: 5000 }).catch(() => problems.push(`Elements did not open its panel at ${w} x ${h}`));
        }
        const s0 = await stepsOf(page);
        for (let i = 0; i < 4; i++) await press(page, 'Control+g');
        await toasts.nth(3).waitFor({ timeout: 5000 }).catch(() => {});
        const n = await toasts.count();
        if (n !== 4) problems.push(`${state} at ${w} x ${h}: ${n} toasts, not 4`);
        if (!(await page.locator('.ds-toasts .ds-toast:not([data-folded])').last().isVisible().catch(() => false))) problems.push(`${state} at ${w} x ${h}: the newest toast is not shown`);
        if (await stepsOf(page) !== s0) problems.push(`${state} at ${w} x ${h}: Ctrl+G with nothing selected changed the design`);
        if (!(await page.locator('.ds-toasts[data-placed]').count())) problems.push(`${state} at ${w} x ${h}: the toasts are in the window's corner, not the canvas column`);
        if (SHOTS) await page.screenshot({ path: path.join(OUT, 'shots', `editor-${state}--${w}--light.png`) }).catch(() => {});
        run.ruleStates.push({ screen: 'editor', state, role: 'owner', w, h, theme: 'light', editorRules: await page.evaluate(editorRules) });
        // Dismissed newest first (older ones may be folded in a narrow column, and unfold as room comes back).
        for (let i = 0; i < 6 && await toasts.count(); i++) await page.locator('.ds-toasts .ds-toast:not([data-folded]) .ds-toast-close').last().click({ timeout: 2000 }).catch(() => {});
      }
      if (await elements.getAttribute('aria-pressed') === 'true') await elements.click({ timeout: 5000 }).catch(() => {});
    }
  },
  // Toasts on every tool page (fix/editor-toasts): the same rule (components/ds/toast.tsx). Four at once hang from
  // the stage's top right (EditorScreen's ToastSlot), never over the settings or Generate, the canvas bar, a primary
  // action, the versions strip or the left navigation and its panel: each page and size, with nothing open on the
  // left and then with Elements open (not on the phone, where the navigation is a menu), is a rule state under the
  // tool's own screen (editorToastOverPanels, at zero). A tool page has no action that shows a toast without
  // changing work or downloading a file, so the journey puts four toasts of the Studio's own markup (two of them
  // with the Studio's longest words and an action) into the one toast region, and the Studio places and folds them
  // as it does its own; they are taken out after. Film, Swap and Story are Coming soon and send the person Home,
  // which is measured as it is (the state says "-home"); once one opens, it is measured as the tool.
  'tool-toasts': async (page, problems, run) => {
    const elements = page.locator('.studio-side').getByRole('button', { name: 'Elements', exact: true });
    const four = [
      { kind: 'ok', text: 'Saved to Spring campaign.' },
      { kind: 'ok', text: 'Download requested. If no file appears, open the original and save it.', action: 'Open original' },
      { kind: 'bad', text: 'That didn’t work. Try again.' },
      { kind: 'ok', text: 'Area edit saved. Everything outside the selection is preserved.', action: 'Undo' },
    ];
    for (const { screen, path: to } of TOOL_TOAST_PAGES) {
      for (const [w, h] of TOOL_TOAST_SIZES) {
        await page.setViewportSize({ width: w, height: h });
        await page.goto(to, { waitUntil: 'load', timeout: 30_000 });
        await ready(page);
        const at = new URL(page.url()).pathname, tool = (await page.locator('.ds-editor').count()) > 0;
        if (at === to && !tool) { problems.push(`${screen} at ${w} x ${h}: ${to} did not show the tool`); continue; }
        if (tool) await page.locator('.ds-editor:not([data-loading])').waitFor({ timeout: 10_000 }).catch(() => problems.push(`${screen} at ${w} x ${h}: the tool was still loading`));
        const states = tool && w > 768 && (await elements.count()) ? ['four-toasts', 'four-toasts-elements-open'] : ['four-toasts'];
        for (const state of states) {
          const where = `${screen} ${state} at ${w} x ${h}`;
          if (state === 'four-toasts-elements-open') {
            await elements.click({ timeout: 5000 });
            await page.locator('.studio-panel').waitFor({ timeout: 5000 }).catch(() => problems.push(`${where}: Elements did not open its panel`));
          }
          await page.evaluate((list) => {
            const region = document.querySelector('.ds-toasts');
            for (const m of list) {
              const t = document.createElement('div');
              t.className = `ds-toast ${m.kind}`; t.dataset.harness = '';
              t.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg><p class="ds-toast-text"></p>'
                + (m.action ? '<button type="button" class="ds-toast-action"></button>' : '')
                + '<button type="button" class="ds-toast-close" aria-label="Dismiss"><svg aria-hidden="true" viewBox="0 0 24 24"></svg></button>';
              t.querySelector('p').textContent = m.text;
              if (m.action) t.querySelector('.ds-toast-action').textContent = m.action;
              region?.append(t);
            }
          }, four);
          const n = await page.locator('.ds-toasts .ds-toast').count();
          if (n !== 4) problems.push(`${where}: ${n} toasts, not 4`);
          // On a tool, until the Studio has placed them in the stage's top right; Home has no slot (the window's corner).
          if (tool) await page.locator('.ds-toasts[data-placed="top"]').waitFor({ state: 'attached', timeout: 5000 }).catch(() => problems.push(`${where}: the toasts are in the window's corner, not the stage's top right`));
          if (!(await until(page, () => { const t = [...document.querySelectorAll('.ds-toasts .ds-toast:not([data-folded])')].pop(); return !!t && t.getBoundingClientRect().height > 0; }))) problems.push(`${where}: the newest toast is not shown`);
          if (SHOTS) await page.screenshot({ path: path.join(OUT, 'shots', `${screen}-${state}${tool ? '' : '-home'}--${w}--light.png`) }).catch(() => {});
          run.ruleStates.push({ screen, state: tool ? state : `${state}-home`, role: 'owner', w, h, theme: 'light', editorRules: await page.evaluate(editorRules) });
          await page.evaluate(() => { for (const t of document.querySelectorAll('.ds-toasts [data-harness]')) t.remove(); });
        }
        if (await elements.count() && await elements.getAttribute('aria-pressed') === 'true') await elements.click({ timeout: 5000 }).catch(() => {});
      }
    }
  },
  // The layers list with the keyboard only: Tab reaches the tabs and then the list (one tab stop), the arrow
  // keys move, Enter selects, Shift+arrow extends, Alt+arrow moves a layer (one undo step), F2 renames (Enter
  // keeps, Escape doesn't), and the focus stays in the list throughout.
  'editor-layers-keyboard': async (page, problems) => {
    await openEditor(page, EDITOR_VISUAL_ID);
    for (let i = 0; i < 3; i++) await press(page, 't');
    await press(page, 'Escape');
    if (!(await tabUntil(page, (f) => !!f.tab))) { problems.push('Tab never reached the panel’s Design and Layers tabs'); return; }
    let f = await focusOf(page);
    if (f.tab !== 'Layers') { await page.keyboard.press('ArrowRight'); await focusIs(page, 'tab', 'Layers'); f = await focusOf(page); }
    if (f.tab !== 'Layers' && !(await tabUntil(page, (x) => x.tab === 'Layers', 3))) { problems.push('neither Tab nor the arrow keys reach the Layers tab'); return; }
    await page.keyboard.press('Enter'); await focusIs(page, 'selected');
    if ((await focusOf(page)).selected !== 'true') problems.push('Enter on the Layers tab did not open it');
    if (!(await tabUntil(page, (x) => !!x.layer, 10))) { problems.push('Tab from the Layers tab never reached the list'); return; }
    // One tab stop: Tab leaves the list, Shift+Tab comes back to it (the browser moves the focus as part of the key press).
    await page.keyboard.press('Tab');
    if ((await focusOf(page)).inList) problems.push('the list is more than one tab stop (Tab stayed in it)');
    await page.keyboard.press('Shift+Tab');
    const first = (await focusOf(page)).layer;
    if (!first) { problems.push('Shift+Tab did not come back to the list'); return; }
    await page.keyboard.press('ArrowDown'); await focusIs(page, 'another-layer', first);
    const second = (await focusOf(page)).layer;
    if (!second || second === first) problems.push('ArrowDown did not move to the next layer');
    await page.keyboard.press('Enter');
    await until(page, () => Number(document.querySelector('.canvas-box[data-editable="true"]')?.getAttribute('data-selected-count')) === 1 && document.activeElement?.getAttribute('aria-pressed') === 'true'); await drawn(page);
    if (await selectedOf(page) !== 1 || (await focusOf(page)).pressed !== 'true') problems.push(`Enter selected ${await selectedOf(page)} layers, not the one in focus`);
    await page.keyboard.press('Shift+ArrowDown');
    await until(page, () => Number(document.querySelector('.canvas-box[data-editable="true"]')?.getAttribute('data-selected-count')) === 2); await drawn(page);
    if (await selectedOf(page) !== 2) problems.push(`Shift+ArrowDown left ${await selectedOf(page)} layers selected, not 2`);
    const order = await topRowIds(page), s0 = await stepsOf(page);
    await page.keyboard.press('Alt+ArrowUp'); await stepped(page, s0); await focusIs(page, 'layer');
    if (JSON.stringify(await topRowIds(page)) === JSON.stringify(order)) problems.push('Alt+ArrowUp did not move the layer');
    if (await stepsOf(page) !== s0 + 1) problems.push(`Alt+ArrowUp made ${(await stepsOf(page)) - s0} undo steps, not 1`);
    if (!(await focusOf(page)).layer) problems.push('the focus left the list when the layer moved');
    await page.keyboard.press('F2'); await focusIs(page, 'name-field');
    if ((await focusOf(page)).field !== 'Layer name') { problems.push(`F2 did not open a field labelled "Layer name" (focus: ${JSON.stringify(await focusOf(page))})`); return; }
    await page.locator(':focus').fill('Renamed by keyboard');
    await page.keyboard.press('Enter');
    await until(page, () => [...document.querySelectorAll('aside.canvas-inspector .canvas-layer-name')].some((n) => n.textContent.includes('Renamed by keyboard'))); await focusIs(page, 'layer');
    if (!(await panelOf(page).locator('.canvas-layer-name', { hasText: 'Renamed by keyboard' }).count())) problems.push('Enter did not keep the new name');
    if (!(await focusOf(page)).layer) problems.push('the focus did not come back to the layer after renaming');
    await page.keyboard.press('F2'); await focusIs(page, 'name-field');
    if ((await focusOf(page)).field === 'Layer name') {
      await page.locator(':focus').fill('Not kept');
      await page.keyboard.press('Escape'); await focusIs(page, 'layer');
      if (await panelOf(page).locator('.canvas-layer-name', { hasText: 'Not kept' }).count()) problems.push('Escape kept the name typed');
      if (!(await panelOf(page).locator('.canvas-layer-name', { hasText: 'Renamed by keyboard' }).count())) problems.push('Escape lost the name kept before');
      if (!(await focusOf(page)).layer) problems.push('the focus did not come back to the layer after Escape');
    } else problems.push('F2 a second time did not open the name field');
  },
  // Ctrl+A selects everything on the page; Ctrl+G makes one group of it (one undo step) and it stays selected;
  // Ctrl+Shift+G takes the group apart; each Ctrl+Z takes back one of them.
  'editor-group-undo': async (page, problems) => {
    await openEditor(page, EDITOR_VISUAL_ID);
    await press(page, 't'); await press(page, 't');
    // The list as it is now (the Layers tab open; the keys go to the canvas, as a person presses them there).
    const listed = async () => { await tab(page, 'Layers'); return topRowIds(page); };
    const before = await listed(), s0 = await stepsOf(page);
    if (before.length < 2) { problems.push(`only ${before.length} layer to group`); return; }
    await press(page, 'Control+a');
    if (await selectedOf(page) < 2) problems.push(`Ctrl+A selected ${await selectedOf(page)} layers`);
    await press(page, 'Control+g');
    const grouped = await listed(), rows = await panelOf(page).locator('li.canvas-layer-row[data-layer-id]').count();
    if (grouped.length !== 1) problems.push(`after Ctrl+G the list has ${grouped.length} rows at its top level, not one group`);
    if (rows !== before.length + 1) problems.push(`after Ctrl+G the list has ${rows} rows, not the group and its ${before.length} layers`);
    if (await stepsOf(page) !== s0 + 1) problems.push(`grouping made ${(await stepsOf(page)) - s0} undo steps, not 1`);
    await press(page, 'Control+Shift+g');
    if ((await listed()).length !== before.length) problems.push('Ctrl+Shift+G did not take the new group apart (is the group selected after Ctrl+G?)');
    await press(page, 'Control+z');
    if ((await listed()).length !== 1) problems.push('Ctrl+Z did not take back the ungrouping in one step');
    await press(page, 'Control+z');
    if (JSON.stringify(await listed()) !== JSON.stringify(before)) problems.push('a second Ctrl+Z did not give the layers back as they were');
    if (await stepsOf(page) !== s0) problems.push(`after both undos the history is ${(await stepsOf(page)) - s0} steps from where it started`);
  },
  // "?" on the canvas opens "Keyboard shortcuts" (the shortcuts of rule 10 in it), Escape closes it and the
  // focus goes back to the canvas; the bar's Shortcuts button opens it too.
  'editor-shortcuts-sheet': async (page, problems) => {
    await openEditor(page, EDITOR_VISUAL_ID);
    const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await press(page, '?');
    await sheet.waitFor({ timeout: 5000 }).catch(() => {});
    if (!(await sheet.isVisible())) { problems.push('"?" did not open "Keyboard shortcuts"'); }
    else {
      const words = await sheet.innerText();
      for (const k of ['Ctrl+D', 'Ctrl+G', 'Ctrl+Z']) if (!words.includes(k)) problems.push(`the sheet does not list ${k}`);
      await focusInDialog(page);
      await page.keyboard.press('Escape');
      await sheet.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
      await until(page, () => !!document.activeElement?.matches('.canvas-box'), null, 3000);
      if (await sheet.isVisible()) problems.push('Escape did not close the sheet');
      else if (!(await focusOf(page)).canvas) problems.push('closing the sheet did not give the focus back to the canvas');
    }
    await page.getByRole('button', { name: /^Shortcuts/ }).first().click({ timeout: 5000 });
    await sheet.waitFor({ timeout: 5000 }).catch(() => {});
    if (!(await sheet.isVisible())) problems.push('the Shortcuts button did not open the sheet');
    await page.keyboard.press('Escape');
  },
  // Snapping (the page is 1536 x 864): a text dropped 3 px (on screen) from the page's centre lands exactly
  // on it; with Ctrl held, the same drop stays where it was dropped.
  'editor-snapping': async (page, problems) => {
    await openEditor(page, EDITOR_VISUAL_ID);
    await press(page, 't');
    await tab(page, 'Design');
    const box = await canvasOf(page).boundingBox(), s = box.width / 1536;
    const centre = [box.x + box.width / 2, box.y + box.height / 2], at = (c) => [box.x + c.x * s, box.y + c.y * s];
    let c = await centreOf(page);
    if (!c.ok) { problems.push('Position & size has no X, Y, W and H fields'); return; }
    for (const hold of [undefined, 'Control']) {
      await dragOn(page, at(c), [centre[0] + 60, centre[1] + 40]);
      c = await centreOf(page);
      if (Math.abs(c.x - 768) < 20) { problems.push('a drag did not move the text'); return; }
      await dragOn(page, at(c), [centre[0] + 3, centre[1] + 2], hold);
      c = await centreOf(page);
      const centred = Math.abs(c.x - 768) <= 1 && Math.abs(c.y - 432) <= 1;
      if (!hold && !centred) problems.push(`dropped 3 px from the page's centre, the text's centre is at ${c.x}, ${c.y}, not 768, 432: it did not snap`);
      if (hold && Math.abs(c.x - 768) <= 1 && Math.abs(c.y - 432) <= 1) problems.push('with Ctrl held, the text still snapped to the page’s centre');
    }
  },
  // One drag (twelve moves) is one undo step; Ctrl+Z takes back the whole drag and nothing else.
  'editor-undo-drag': async (page, problems) => {
    await openEditor(page, EDITOR_VISUAL_ID);
    const before = await layersOf(page);
    await press(page, 't');
    if (await layersOf(page) !== before + 1) problems.push('T did not add a text');
    const s0 = await stepsOf(page), box = await canvasOf(page).boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let i = 1; i <= 12; i++) await page.mouse.move(cx + i * 12, cy + i * 6);
    await page.mouse.up(); await stepped(page, s0);
    const s1 = await stepsOf(page);
    if (s1 !== s0 + 1) problems.push(`a drag of twelve moves made ${s1 - s0} undo steps, not 1`);
    await press(page, 'Control+z');
    if (await stepsOf(page) !== s0) problems.push('one Ctrl+Z did not take back the whole drag');
    if (await layersOf(page) !== before + 1) problems.push('one Ctrl+Z took back more than the drag');
    await press(page, 'Control+z');
    if (await layersOf(page) !== before) problems.push('a second Ctrl+Z did not take back the text');
    await savedWithin(page, 12_000).catch(() => problems.push('the save status never said Saved'));
  },
  // "Duplicate design": "Copy of …" opens in place (same page, no reload, no new tab) with its notice, and
  // editing goes on in the copy: its change is in the copy when it is opened again, not in the original.
  'editor-duplicate-design': async (page, problems) => {
    await openEditor(page, EDITOR_VISUAL_ID);
    await page.evaluate(() => { window.__sameDocument = true; });
    const pages = page.context().pages().length;
    const before = await layersOf(page);
    // Every draft request for the original (method and answer, in order): what a failure below reports.
    const drafts = [];
    page.on('response', (r) => { const u = new URL(r.url()); if (u.pathname === `/api/edits/${EDITOR_VISUAL_ID}/draft`) drafts.push(`${r.request().method()} ${r.status()}`); });
    page.on('requestfailed', (r) => { const u = new URL(r.url()); if (u.pathname === `/api/edits/${EDITOR_VISUAL_ID}/draft`) drafts.push(`${r.method()} failed: ${r.failure()?.errorText || '?'}`); });
    await press(page, 't');
    const statusBefore = await page.locator('.canvas-bar [data-save-status]').getAttribute('data-save-status');
    await page.getByRole('button', { name: 'Duplicate design', exact: true }).click({ timeout: 5000 });
    await page.locator('[data-copy-notice]').waitFor({ timeout: 40_000 });
    const id = new URL(page.url()).searchParams.get('visual') || '';
    if (!VISUAL_ID.test(id) || id === EDITOR_VISUAL_ID) problems.push(`the address is "${id}", not the copy's`);
    if (new URL(page.url()).pathname !== '/editor') problems.push('the editor was left');
    if (!(await page.evaluate(() => window.__sameDocument === true))) problems.push('the page reloaded: the copy did not open in place');
    if (page.context().pages().length !== pages) problems.push('a new tab opened');
    const title = ((await page.locator('.canvas-title').textContent()) || '').trim();
    if (!title.startsWith('Copy of ')) problems.push(`the copy is called "${title}", not "Copy of …"`);
    if (!/You’re now editing the copy/.test(await page.locator('[data-copy-notice]').innerText())) problems.push('no "You’re now editing the copy" notice');
    if (!(await page.getByRole('button', { name: 'Back to original' }).count())) problems.push('no "Back to original"');
    await press(page, 't');
    if (await layersOf(page) !== before + 2) problems.push('editing the copy did not add to it');
    await savedWithin(page, 12_000).catch(() => problems.push('the copy’s change was never saved'));
    await openEditor(page, id);
    if (await layersOf(page) !== before + 2) problems.push(`the copy reopened with ${await layersOf(page)} layers, not ${before + 2}`);
    await openEditor(page, EDITOR_VISUAL_ID);
    const back = await layersOf(page);
    if (back !== before + 1) {
      // What the Studio and this device hold for the original, so a failure says where the change went.
      const held = await page.evaluate(async (orig) => {
        const r = await fetch(`/api/edits/${orig}/draft`, { cache: 'no-store' }), d = await r.json().catch(() => ({}));
        let k = null; try { k = JSON.parse(localStorage.getItem('nmesis.editor.draft.' + orig) || 'null'); } catch { k = 'unreadable'; }
        return { draft: d.draft ? { layers: Object.keys(d.draft.doc.layers).length, rev: d.draft.rev, savedAt: d.draft.savedAt } : r.status,
          device: k && typeof k === 'object' ? { layers: Object.keys(k.doc.layers).length, rev: k.rev, at: k.at } : k, now: Date.now() };
      }, EDITOR_VISUAL_ID).catch((e) => String(e).slice(0, 120));
      problems.push(`the original has ${back} layers after the copy was edited, not ${before + 1} (status before Duplicate: ${statusBefore}; draft requests: ${drafts.join(', ') || 'none'}; held: ${JSON.stringify(held)})`);
    }
  },
  // Closing the tab right after a change, inside its two seconds, keeps it (the owner's ask on #60). With the
  // connection, the last request goes with the page (keepalive): the browser doesn't ask "Leave site?", the
  // Studio holds the change, and the design opens with it, with nothing to restore. Offline, it stays on this
  // device: the next opening restores it ("Restored your unsaved changes.") and sends it to the Studio.
  'editor-close-after-edit': async (page, problems) => {
    const context = page.context();
    await openEditor(page, EDITOR_VISUAL_ID);
    const origin = new URL(page.url()).origin;
    // A change the Studio holds first, so the counts below start from a known draft.
    await press(page, 't');
    await savedWithin(page, 12_000).catch(() => problems.push('the first change was never saved'));
    const held = await studioLayers(context, origin), shown = await layersOf(page);
    if (held < 0) problems.push('the Studio holds no draft after the first change');
    // 1. A change, and the tab closes at once, with the change still waiting for its two seconds.
    await press(page, 't');
    const waiting = await page.locator('.canvas-bar [data-save-status]').getAttribute('data-save-status');
    if (waiting !== 'saving') problems.push(`the change was "${waiting}", not still waiting to be sent, when the tab closed`);
    page.on('dialog', (d) => { problems.push('closing asked first, though the change could go with the page'); void d.accept(); });
    await closeTab(page);
    if (!(await studioHas(context, origin, held + 1))) problems.push(`the change made just before closing never reached the Studio (it holds ${await studioLayers(context, origin)} layers, not ${held + 1})`);
    const again = await journeyPage(context, problems);
    let deviceHeld = null;
    try {
      await openEditor(again, EDITOR_VISUAL_ID);
      if (await layersOf(again) !== shown + 1) problems.push(`it reopened with ${await layersOf(again)} layers, not ${shown + 1}`);
      // The editor says which copy it opened from (the device's copy is the one that says "Restored…"), so this is
      // read, not waited for.
      const from = await canvasOf(again).getAttribute('data-opened-from');
      if (from !== 'studio' || await again.getByText('Restored your unsaved changes').count()) problems.push(`it said “Restored your unsaved changes” though the Studio had them (it opened from the ${from} copy)`);
      // 2. Offline: a change, and the tab closes; nothing can go with it. The reopened editor has nothing to send first.
      await savedWithin(again, 12_000).catch(() => {});
      await context.setOffline(true);
      const off = await again.waitForFunction(() => !navigator.onLine, null, { timeout: 5000 }).then(() => true, () => false);
      if (!off) problems.push('the harness could not take the page offline');
      await press(again, 't');
      const status = await again.locator('.canvas-bar [data-save-status]').getAttribute('data-save-status');
      if (off && status !== 'offline') problems.push(`offline, the status was "${status}", not "offline"`);
      // Until this device's copy holds the change (what the next opening restores), then the tab closes.
      await until(again, ([id, n]) => { try { return Object.keys(JSON.parse(localStorage.getItem('nmesis.editor.draft.' + id) || 'null')?.doc?.layers || {}).length === n; } catch { return false; } }, [EDITOR_VISUAL_ID, held + 2]);
      deviceHeld = await deviceCopyOf(again, EDITOR_VISUAL_ID);
      again.on('dialog', (d) => { void d.accept(); });
      await closeTab(again);
    } finally { await context.setOffline(false); await again.close().catch(() => {}); }
    if (await studioLayers(context, origin) !== held + 1) problems.push(`offline, the change still reached the Studio: the next check proves nothing (the Studio holds ${JSON.stringify(await studioDraftOf(context, origin))}, not ${held + 1} layers; this device held ${JSON.stringify(deviceHeld)} before the tab closed)`);
    const last = await journeyPage(context, problems);
    try {
      await openEditor(last, EDITOR_VISUAL_ID);
      await last.getByText('Restored your unsaved changes').first().waitFor({ timeout: 10_000 }).catch(() => problems.push('the next opening didn’t say “Restored your unsaved changes.”'));
      if (await layersOf(last) !== shown + 2) problems.push(`the next opening shows ${await layersOf(last)} layers, not ${shown + 2}: the offline change was not restored`);
      if (!(await studioHas(context, origin, held + 2, 15_000))) problems.push('the restored change never reached the Studio');
    } finally { await last.close().catch(() => {}); }
  },
  // Editor Phase 5 (feat/editor-photos-icons): the Photos panel searches every library that is on (Pixabay,
  // answered by scripts/ui/photo-standin.mjs; Unsplash has no key, so it says it is off), a photo is clicked in
  // (the middle of the page) and another dragged onto the canvas (where it is dropped); each is copied into the
  // Studio's storage and keeps its credit (shown in the right panel), never the library's address. The Icons
  // panel: a search, an icon clicked in, another set opened and a solid icon dragged in. Then the export, where
  // the dragged photo's colour is found, and every addition undone.
  'editor-photos-icons': async (page, problems, run) => {
    const { PHOTO_COLOUR } = await import('./ui/photo-standin.mjs');
    await openEditor(page, EDITOR_VISUAL_ID);
    await press(page, 'Escape');
    const start = await layersOf(page), steps0 = await stepsOf(page);
    const docWidth = await page.evaluate(() => { const s = window.Konva?.stages?.[0]; return s ? s.width() / s.scaleX() : 0; });
    // The canvas as shown now: an open left panel narrows it, so it is measured right before each drop.
    const boxNow = () => canvasOf(page).boundingBox();
    // A drag onto the canvas at a share of its width and height; a failed one lets go of the mouse, so the
    // checks after it report their own problems, not a button still held.
    const dragOnCanvas = async (tile, share, what) => {
      const box = await boxNow(), at = { x: box.width * share[0], y: box.height * share[1] };
      await tile.dragTo(canvasOf(page), { targetPosition: at, timeout: 10_000 }).catch(async (e) => { problems.push(`dragging ${what} failed: ` + String(e.message).split('\n')[0]); await page.mouse.up().catch(() => {}); });
      return { x: at.x * (docWidth / box.width), y: at.y * (docWidth / box.width) };
    };
    const landedAt = async (want, what) => {
      const c = await centreOf(page);
      if (!c.ok || Math.abs(c.x - want.x) > docWidth * 0.03 || Math.abs(c.y - want.y) > docWidth * 0.03) problems.push(`the dropped ${what}'s middle is at ${JSON.stringify(c)}, not where it was dropped (${Math.round(want.x)}, ${Math.round(want.y)})`);
      return c;
    };
    const nav = (name) => page.locator('button.studio-side-item', { hasText: name }).first();
    const shot = (name) => SHOTS ? page.screenshot({ path: path.join(OUT, 'shots', `phase5-${name}--1440--light.png`) }).catch(() => {}) : null;

    // Photos: it opens with results for "cars" (written in the box, no typing), says which libraries are off,
    // then a search with none, a search, the masonry grid.
    await nav('Photos').click({ timeout: 5000 });
    const panel = page.locator('#studio-panel');
    await panel.getByRole('searchbox', { name: 'Search photos' }).waitFor({ timeout: 10_000 });
    const opening = await panel.getByRole('searchbox', { name: 'Search photos' }).inputValue().catch(() => '');
    if (opening !== 'cars') problems.push(`the Photos search box opens with ${JSON.stringify(opening)}, not "cars"`);
    await panel.locator('button.photos-add').first().waitFor({ timeout: 15_000 }).catch(() => problems.push('the Photos panel opened with no results'));
    await panel.locator('[data-library="unsplash"]').waitFor({ timeout: 10_000 }).catch(() => problems.push('the Photos panel did not say Unsplash is off'));
    const offWords = ((await panel.locator('[data-library="unsplash"]').textContent().catch(() => '')) || '').trim();
    if (!/Unsplash is off/.test(offWords)) problems.push(`Unsplash (no key) reads ${JSON.stringify(offWords)}, not that it is off`);
    await shot('photos-start');
    await panel.getByRole('searchbox', { name: 'Search photos' }).fill('nothing at all');
    await panel.getByText(/No photos match/).first().waitFor({ timeout: 15_000 }).catch(() => problems.push('a search with no results did not say so'));
    await shot('photos-none');
    await panel.getByRole('searchbox', { name: 'Search photos' }).fill('demo road');
    const tiles = panel.locator('button.photos-add');
    await tiles.nth(5).waitFor({ timeout: 15_000 }).catch(() => problems.push('the search showed fewer than 6 photos'));
    if (await tiles.count() < 6) return;
    if (await panel.locator('img[src*="pixabay.com/get/"]').count() === 0) problems.push('the grid does not show the library\'s own pictures');
    await tiles.first().hover();
    // Until the credit over the photo has faded in (its own opacity), then it is read.
    await until(page, () => { const el = document.querySelector('#studio-panel button.photos-add .photos-credit'); return !!el && Number(getComputedStyle(el).opacity) >= 0.9; }, null, 3000);
    const credit = await tiles.first().locator('.photos-credit').evaluate((el) => ({ text: el.textContent, opacity: Number(getComputedStyle(el).opacity) })).catch(() => null);
    if (!credit || credit.opacity < 0.9 || !/demo_maker/.test(credit.text) || !/Pixabay/.test(credit.text)) problems.push(`hovering a photo shows ${JSON.stringify(credit)}, not its photographer and library`);
    await shot('photos-results');
    // Infinite scroll: the end of the grid loads the next page.
    const first = await tiles.count();
    await panel.locator('.photos-end').scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForFunction((n) => document.querySelectorAll('#studio-panel button.photos-add').length > n, first, { timeout: 15_000 }).catch(() => problems.push('scrolling to the end of the photos loaded no more'));

    // Click: the middle of the page; the layer keeps its credit, and the right panel says it.
    await tiles.first().click({ timeout: 5000 });
    await page.waitForFunction((n) => { const l = /(\d+) layers?/.exec(document.querySelector('.canvas-box[data-editable="true"]')?.getAttribute('aria-label') || ''); return l && Number(l[1]) === n; }, start + 1, { timeout: 30_000 }).catch(() => problems.push('clicking a photo added no layer'));
    const creditSection = panelOf(page).locator('[data-editor-section="credit"]');
    const creditWords = ((await creditSection.textContent({ timeout: 5000 }).catch(() => '')) || '').replace(/\s+/g, ' ').trim();
    if (!/Photo by demo_maker on Pixabay/.test(creditWords)) problems.push(`the right panel's credit reads ${JSON.stringify(creditWords)}`);
    run.ruleStates.push({ screen: 'editor', state: 'photo-with-credit', role: 'owner', w: 1440, h: 900, theme: 'light', editorRules: await page.evaluate(editorRules) });

    // Drag: where it is dropped (its middle on the pointer), in picture pixels.
    const photoDrop = await dragOnCanvas(tiles.nth(1), [0.25, 0.3], 'a photo');
    await page.waitForFunction((n) => { const l = /(\d+) layers?/.exec(document.querySelector('.canvas-box[data-editable="true"]')?.getAttribute('aria-label') || ''); return l && Number(l[1]) === n; }, start + 2, { timeout: 30_000 }).catch(() => problems.push('dropping a photo on the canvas added no layer'));
    const dropped = await landedAt(photoDrop, 'photo');
    await shot('photos-dropped');

    // Icons: browsing a set (its file only now); then one search across every set (one list, each result
    // labelled with its set, the exact name first), one clicked in; a solid icon found by its exact name, dragged in.
    await nav('Icons').click({ timeout: 5000 });
    const icons = panel.locator('button.icons-add');
    await icons.first().waitFor({ timeout: 15_000 }).catch(() => problems.push('the Icons panel showed no icons'));
    await panel.getByRole('button', { name: 'Phosphor' }).click({ timeout: 5000 });
    await panel.getByRole('list', { name: 'Phosphor icons' }).locator('button.icons-add').first().waitFor({ timeout: 15_000 }).catch(() => problems.push('browsing Phosphor showed nothing'));
    const search = panel.getByRole('searchbox', { name: 'Search icons' });
    await search.fill('car');
    const found = panel.locator('button.icons-add[data-set]');
    await found.first().waitFor({ timeout: 15_000 }).catch(() => problems.push('searching every set for "car" found nothing'));
    const sets = await found.evaluateAll((els) => [...new Set(els.slice(0, 40).map((e) => e.getAttribute('data-set')))]);
    if (sets.length < 2) problems.push(`the search across every set shows ${JSON.stringify(sets)}, not several sets`);
    if (await found.first().getAttribute('data-icon') !== 'car') problems.push(`the first result for "car" is ${await found.first().getAttribute('data-icon')}, not the exact name`);
    if (!(await found.first().locator('.icons-set').count())) problems.push('a result does not say its set');
    await found.first().locator('svg.icons-art').waitFor({ timeout: 15_000 }).catch(() => problems.push('a result\'s drawing did not load as it came into view'));
    await shot('icons-search');
    await found.first().click({ timeout: 5000 });
    await layersReach(page, start + 3);
    if (await layersOf(page) !== start + 3) problems.push(`clicking an icon left ${await layersOf(page)} layers, not ${start + 3}`);
    if (!(await panelOf(page).locator('[data-editor-section="appearance"]').getByText('Colour').count())) problems.push('a placed icon has no Colour in the right panel');
    await search.fill('star-fill');
    const solid = panel.locator('button.icons-add[data-set="phosphor"][data-icon="star-fill"]');
    await solid.waitFor({ timeout: 15_000 }).catch(() => problems.push('searching "star-fill" did not find Phosphor\'s'));
    await solid.locator('svg.icons-art').waitFor({ timeout: 15_000 }).catch(() => {});
    const iconDrop = await dragOnCanvas(solid, [0.75, 0.7], 'an icon');
    await layersReach(page, start + 4);
    if (await layersOf(page) !== start + 4) problems.push(`dropping an icon left ${await layersOf(page)} layers, not ${start + 4}`);
    else await landedAt(iconDrop, 'icon');
    if (await panelOf(page).getByText('Line weight').count()) problems.push('a solid icon offers a Line weight');
    if (await stepsOf(page) !== steps0 + 4) problems.push(`four additions made ${(await stepsOf(page)) - steps0} undo steps, not 4`);

    // The design keeps storage keys and credits, never a library's picture address.
    await savedWithin(page, 20_000).catch(() => problems.push('the additions were not saved'));
    const draft = await page.request.get(`/api/edits/${EDITOR_VISUAL_ID}/draft`, { failOnStatusCode: false }).then((r) => r.json()).catch(() => null);
    const layers = Object.values(draft?.draft?.doc?.layers || {});
    const photos = layers.filter((l) => l.kind === 'image' && l.credit?.provider === 'pixabay');
    if (photos.length !== 2 || !photos.every((l) => /^images\//.test(l.asset))) problems.push(`the draft holds ${photos.length} credited photos in the Studio's storage, not 2`);
    if (JSON.stringify(draft || {}).includes('pixabay.com/get')) problems.push('the draft holds a library picture address');
    if (!layers.some((l) => l.kind === 'icon' && l.grid === 256 && l.fill === true)) problems.push('the solid icon was not kept with its grid and fill');

    // The export: the dragged photo is in it, from the Studio's copy.
    const exported = decodePng(await downloadPng(page));
    const ek = exported.width / docWidth, [r, g, b] = sampleAt(exported, Math.round(dropped.x * ek), Math.round(dropped.y * ek), 1);
    if ([r - PHOTO_COLOUR[0], g - PHOTO_COLOUR[1], b - PHOTO_COLOUR[2]].some((d) => Math.abs(d) > 16)) problems.push(`the export shows rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}) where the photo was dropped, not the photo`);

    // Leave the design as it was for the journeys after this one.
    for (let i = 0; i < 4; i++) await press(page, process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    if (await layersOf(page) !== start) problems.push(`undoing the four additions left ${await layersOf(page)} layers, not ${start}`);
    await savedWithin(page, 20_000).catch(() => {});
  },
  // The editor under load: a design of 50 layers on a 3840 x 2160 picture (scripts/ui/seed.mjs perfDesign).
  // Timed: until the canvas holds every layer, until the picture has arrived, the frames during a 30-move drag
  // of the top layer (requestAnimationFrame, in the page), and Ctrl+A until the several-layers panel shows.
  // Fails only on a clear problem in Chromium (p95 frame over 50 ms, opening over 10 s); WebKit reports.
  'editor-performance': async (page, problems, run) => {
    let pictureAt = 0, pictureArrived = () => {};
    const picture = new Promise((r) => { pictureArrived = r; });
    // The picture's own bytes (the Studio's address redirects to a signed link: the last request of the chain).
    page.on('requestfinished', (r) => { if (!pictureAt && r.resourceType() === 'image' && r.url().includes(PERF_PICTURE_ID) && !r.redirectedTo()) { pictureAt = Date.now(); pictureArrived(); } });
    const t0 = Date.now();
    await page.goto('/editor?visual=' + PERF_DESIGN_ID, { waitUntil: 'load', timeout: 30_000 });
    await canvasOf(page).locator('canvas').first().waitFor({ timeout: 20_000 });
    await page.waitForFunction((n) => new RegExp(`\\b${n} layers\\b`).test(document.querySelector('.canvas-box[data-editable="true"]')?.getAttribute('aria-label') || ''), PERF_LAYERS, { timeout: 20_000 })
      .catch(() => problems.push(`the design did not open with its ${PERF_LAYERS} layers`));
    const layersMs = Date.now() - t0;
    // Until the picture's bytes have arrived (at most 10 s more, as before).
    let cap; await Promise.race([picture, new Promise((r) => { cap = setTimeout(r, 10_000); })]); clearTimeout(cap);
    const pictureMs = pictureAt ? pictureAt - t0 : null;
    await ready(page);
    await tab(page, 'Design');
    const box = await canvasOf(page).boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.evaluate(() => { window.__frames = []; window.__recording = true; let last = performance.now(); const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__recording) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
    const s0 = await stepsOf(page);
    await page.mouse.move(cx, cy); await page.mouse.down();
    // One move a drawn frame, as a pointer's moves reach a page; then until the drop is a step and drawn.
    for (let i = 1; i <= 30; i++) { await page.mouse.move(cx + i * 8, cy + i * 4); await nextFrame(page); }
    await page.mouse.up(); await stepped(page, s0);
    const frames = await page.evaluate(() => { window.__recording = false; return window.__frames.slice(1); });
    if (await stepsOf(page) !== s0 + 1) problems.push('the drag of the top layer did not register (no undo step)');
    await press(page, 'Escape');
    await canvasOf(page).focus();
    const t1 = Date.now();
    await page.keyboard.press('Control+a');
    await page.waitForFunction(() => Number(document.querySelector('.canvas-box[data-editable="true"]')?.getAttribute('data-selected-count')) > 1 && !!document.querySelector('aside.canvas-inspector [data-editor-section="position"]'), null, { timeout: 10_000, polling: 'raf' })
      .catch(() => problems.push('Ctrl+A did not show the several-layers panel within 10 s'));
    const selectAllMs = Date.now() - t1;
    await press(page, 'Escape'); await press(page, 'Control+z');
    const perf = { layers: PERF_LAYERS, picture: '3840 x 2160', engine: ENGINE, layersOnCanvasMs: layersMs, pictureLoadedMs: pictureMs, dragFrames: frames.length, dragFrameP50Ms: pct(frames, 0.5), dragFrameP95Ms: pct(frames, 0.95), dragFrameMaxMs: Math.round(Math.max(0, ...frames) * 10) / 10, selectAllPanelMs: selectAllMs };
    run.editorPerf = perf;
    if (!WEBKIT) {
      if (perf.dragFrameP95Ms > 50) problems.push(`dragging with ${PERF_LAYERS} layers: p95 frame ${perf.dragFrameP95Ms} ms (over 50 ms)`);
      if (Math.max(layersMs, pictureMs || 0) > 10_000) problems.push(`opening took ${Math.max(layersMs, pictureMs || 0)} ms (over 10 s)`);
      if (pictureMs === null) problems.push('the 3840 x 2160 picture never arrived');
    }
  },
}; }

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
