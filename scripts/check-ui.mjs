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
// while the counts in scripts/ui-baseline.json do not go up (Phase 1 records
// them; Phase 4 empties them).
//
//   npm run check:ui                        the full matrix (TEST_DATABASE_URL required)
//   npm run check:ui -- --quick             1440 and 390 only, owner and staff
//   npm run check:ui -- --only=usage,films  some screens
//   npm run check:ui -- --shots             also save screenshots (1440 and 390)
//   npm run check:ui -- --update            write the baseline as it is now
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { startStack } from './ui/stack.mjs';
import { seedStudio, ORGS, PEOPLE, PASSWORD } from './ui/seed.mjs';
import { initScript, quietFor, vitals, layoutChecks, focusState } from './ui/checks.mjs';
import { runPerf } from './ui/perf.mjs';

const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const opt = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1];
const OUT = path.resolve('ui-report');
const BASELINE = path.resolve('scripts/ui-baseline.json');
const QUICK = flag('quick'), SHOTS = flag('shots'), UPDATE = flag('update'), PERF = flag('perf');
const ONLY = opt('only') ? new Set(opt('only').split(',')) : null;
const WORKERS = Number(opt('workers')) || 3;
const RATCHETED = ['pagesWithErrors', 'pagesWithSidewaysScroll', 'consoleErrors', 'httpErrors', 'axeCritical', 'axeSerious', 'focusWithoutIndicator', 'focusHiddenBySticky', 'targetsUnder24', 'overlapped', 'clippedWithoutEllipsis', 'ellipsisWithoutFullText', 'serverHostsBlocked'];

const VIEWPORTS = QUICK ? [[1440, 900], [390, 844]] : [[1440, 900], [1280, 800], [1024, 768], [768, 1024], [390, 844], [360, 740]];
const KEY_WIDTHS = new Set([1440, 390]); // axe, the keyboard walk and screenshots
const THEMES = ['light', 'dark'];

// Who looks. `org` is opened through the Studio's own deep link after sign-in.
const ROLES = {
  anon: { person: null },
  owner: { person: 'owner', org: 'growth', note: 'Growth, 85% of credits used, 300 visuals' },
  creator: { person: 'creator', org: 'growth' },
  viewer: { person: 'viewer', org: 'growth' },
  starter: { person: 'starter', org: 'starter', note: 'Starter: tools locked, 100% of credits used' },
  enterprise: { person: 'enterprise', org: 'enterprise', note: 'Enterprise: long name, huge numbers, films, swaps, storyboards' },
  ended: { person: 'ended', org: 'ended', note: 'subscription ended 5 days ago' },
  nocompany: { person: 'nocompany' },
  staff: { person: 'staff', org: 'nmesis', note: 'Nmesis staff in their own workspace' },
  staffViewing: { person: 'staff', org: 'growth', note: 'staff opening a client that granted support access ("Viewing as")' },
  staffRefused: { person: 'staff', org: 'starter', note: 'staff opening a client that did not grant access' },
};
const CLIENT_ROLES = ['owner', 'creator', 'viewer', 'starter', 'enterprise', 'ended', 'staff', 'staffViewing'];
// The full viewport and theme matrix runs for `full`; other roles at 1440 and 390.
const SCREENS = [
  { id: 'signin', path: '/signin', roles: ['anon'], full: ['anon'] },
  { id: 'forgot-password', path: '/signin/forgot', roles: ['anon'], full: ['anon'] },
  { id: 'choose-password', path: '/auth/password', roles: ['owner'] },
  { id: 'no-company', path: '/auth/no-company', roles: ['nocompany'] },
  { id: 'six-digit-code', path: '/auth/code', roles: ['staff'] },
  { id: 'workspace', path: '/', roles: CLIENT_ROLES, full: ['owner'] },
  { id: 'library', path: '/', action: 'library', roles: ['owner', 'viewer', 'ended', 'staffViewing'], full: ['owner'] },
  { id: 'viewer', path: '/', action: 'viewer', roles: ['owner', 'viewer'] },
  { id: 'settings', path: '/', action: 'settings', roles: ['owner', 'enterprise', 'viewer'] },
  { id: 'company-switcher', path: '/', action: 'switcher', roles: ['owner', 'staff'] },
  { id: 'lineup', path: '/lineup', roles: ['owner', 'starter', 'viewer'], full: ['owner'] },
  { id: 'films', path: '/films', roles: ['enterprise', 'owner'], full: ['enterprise'] },
  { id: 'swap', path: '/swap', roles: ['enterprise', 'owner'], full: ['enterprise'] },
  { id: 'storyboard', path: '/storyboard', roles: ['enterprise', 'owner'], full: ['enterprise'] },
  { id: 'nano-lab', path: '/nano-lab', roles: ['owner'] },
  { id: 'usage', path: '/usage', roles: ['owner', 'starter', 'enterprise', 'creator', 'staffViewing'], full: ['owner'] },
  { id: 'company', path: '/company', roles: ['owner', 'creator', 'staffViewing'], full: ['owner'] },
  { id: 'not-found', path: '/this-page-does-not-exist', roles: ['owner', 'anon'] },
  { id: 'design-system', path: '/design-system', roles: ['staff'] },
  { id: 'staff-refused', path: '/', roles: ['staffRefused'] },
  // The target experience's screens (Phase 3). Listed so the report says they are missing.
  { id: 'home', path: null, roles: ['owner'], pending: 'Phase 3: Home' },
  { id: 'projects', path: null, roles: ['owner'], pending: 'Phase 3: projects' },
  { id: 'folders', path: null, roles: ['owner'], pending: 'Phase 3: folders' },
].filter((s) => !ONLY || ONLY.has(s.id));

// ── Run ───────────────────────────────────────────────────────────────────
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const stack = await startStack({ adminUrl: process.env.TEST_DATABASE_URL, log: (l) => console.log('  ' + l) });
console.log(`Studio ready in ${stack.readyMs} ms at ${stack.origin}`);
const browser = await chromium.launch();
const harnessMistakes = [];
const contexts = {};
let exitCode = 0;
try {
  for (const [name, role] of Object.entries(ROLES)) contexts[name] = await roleContexts(name, role);
  await seedStudio({ s3: stack.s3, adminUrl: stack.adminUrl, request: { enterprise: contexts.enterprise.desktop.request } });
  // Performance first, so the first request to the heaviest route is a cold one.
  const perf = PERF ? await runPerf({ stack, contexts, browser }) : undefined;

  const jobs = [];
  for (const screen of SCREENS) {
    for (const role of screen.roles) {
      if (screen.pending) { jobs.push({ screen, role, pending: true }); continue; }
      const full = (screen.full || []).includes(role) && !QUICK;
      for (const [w, h] of VIEWPORTS) {
        if (!full && !KEY_WIDTHS.has(w)) continue;
        for (const theme of THEMES) jobs.push({ screen, role, w, h, theme });
      }
    }
  }
  console.log(`${jobs.length} page checks, ${WORKERS} at a time`);
  const results = [];
  let done = 0;
  await pool(jobs, WORKERS, async (job) => {
    const r = job.pending ? { screen: job.screen.id, role: job.role, pending: job.screen.pending } : await check(job);
    results.push(r);
    if (++done % 25 === 0) console.log(`  ${done} / ${jobs.length}`);
  });
  const blocked = Object.fromEntries(stack.blocked);
  const report = { at: new Date().toISOString(), studioReadyMs: stack.readyMs, viewports: VIEWPORTS, roles: ROLES, results: results.sort(byKey), blockedServerHosts: blocked, harnessMistakes };
  if (perf) report.perf = perf;
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  const totals = summarise(report);
  exitCode = ratchet(totals);
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
  if (action === 'library') { const el = page.locator('#visual-library'); if (!(await el.count())) return false; await el.scrollIntoViewIfNeeded(); return true; }
  if (action === 'viewer') return click('#visual-library .result-card img, #visual-library article img, #visual-library article button');
  if (action === 'settings') return click('summary[aria-label="Studio settings"]');
  if (action === 'switcher') return click('button[aria-label^="Company:"]');
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
    Object.assign(out, await page.evaluate(layoutChecks, { phone: w <= 480 }));
    out.vitals = await page.evaluate(vitals);
    if (KEY_WIDTHS.has(w)) {
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
      out.axe = axe.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) }));
      out.focus = await keyboardWalk(page);
      if (SHOTS) await page.screenshot({ path: path.join(OUT, 'shots', `${screen.id}--${role}--${w}--${theme}.png`) }).catch(() => {});
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

// The counts that may only go down, and a readable summary.
function summarise(report) {
  const pages = report.results.filter((r) => !r.pending);
  const sum = (f) => pages.reduce((n, r) => n + (f(r) || 0), 0);
  const axeBy = (impact) => sum((r) => (r.axe || []).filter((v) => v.impact === impact).reduce((n, v) => n + v.nodes, 0));
  const totals = {
    pages: pages.length,
    pagesWithErrors: pages.filter((r) => r.error).length,
    pagesWithSidewaysScroll: pages.filter((r) => r.overflowX > 0).length,
    consoleErrors: sum((r) => r.consoleErrors.length),
    httpErrors: sum((r) => r.httpErrors.length),
    axeCritical: axeBy('critical'),
    axeSerious: axeBy('serious'),
    axeModerate: axeBy('moderate'),
    axeMinor: axeBy('minor'),
    focusWithoutIndicator: sum((r) => r.focus?.noIndicator.length),
    focusHiddenBySticky: sum((r) => r.focus?.hidden.length),
    targetsUnder24: sum((r) => r.under24?.length),
    targetsUnder44OnPhones: sum((r) => r.under44?.length),
    overlapped: sum((r) => r.overlapped?.length),
    clippedWithoutEllipsis: sum((r) => r.clippedNoEllipsis?.length),
    ellipsisWithoutFullText: sum((r) => r.ellipsisNoTitle?.length),
    pagesOverCls01: pages.filter((r) => (r.vitals?.cls || 0) > 0.1).length,
    pagesNeverQuiet: pages.filter((r) => r.ready && !r.ready.quiet).length,
    serverHostsBlocked: Object.keys(report.blockedServerHosts).length,
  };
  const axeRules = {};
  for (const r of pages) for (const v of r.axe || []) { const k = `${v.impact} · ${v.id}`; axeRules[k] = (axeRules[k] || 0) + v.nodes; }
  const lines = ['# UI harness summary', '', `${report.at}. ${totals.pages} page checks. Studio ready in ${report.studioReadyMs} ms.`, '', '| Check | Count |', '|---|---:|',
    ...Object.entries(totals).map(([k, v]) => `| ${k} | ${v} |`), '', '## axe rules (nodes)', '', ...Object.entries(axeRules).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`),
    '', '## Pending screens', '', ...report.results.filter((r) => r.pending).map((r) => `- ${r.screen} (${r.role}): ${r.pending}`),
    '', '## Server requests the network guard refused', '', ...Object.entries(report.blockedServerHosts).map(([h, n]) => `- ${h}: ${n}`),
    '', '## Mistakes the harness made about itself', '', ...[...new Set(report.harnessMistakes)].map((m) => `- ${m}`)];
  fs.writeFileSync(path.join(OUT, 'summary.md'), lines.join('\n') + '\n');
  console.log(lines.slice(0, 30).join('\n'));
  return totals;
}

function ratchet(totals) {
  const now = Object.fromEntries(RATCHETED.map((k) => [k, totals[k]]));
  if (UPDATE || QUICK || ONLY) {
    if (UPDATE) { fs.writeFileSync(BASELINE, JSON.stringify({ note: 'Counts from the full npm run check:ui matrix. They may only go down; Phase 4 brings them to zero.', measured: new Date().toISOString().slice(0, 10), counts: now }, null, 2) + '\n'); console.log('Baseline written.'); }
    return 0;
  }
  if (!fs.existsSync(BASELINE)) { console.log('No baseline yet (scripts/ui-baseline.json): nothing to compare. Write one with --update.'); return 0; }
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8')).counts;
  const worse = RATCHETED.filter((k) => (now[k] || 0) > (base[k] ?? Infinity));
  for (const k of RATCHETED) if (now[k] !== base[k]) console.log(`  ${k}: ${base[k]} → ${now[k]}`);
  if (worse.length) { console.log(`✗ Worse than the baseline: ${worse.join(', ')}`); return 1; }
  console.log('✓ Nothing got worse.');
  return 0;
}
