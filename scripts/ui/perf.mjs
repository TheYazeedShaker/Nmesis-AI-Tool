// The performance baseline (npm run check:ui -- --perf). Measured in the same
// harness, so the numbers are comparable from run to run, not with real phones:
//  - per route, at 390 with 4x CPU slowdown and a throttled network (below), and
//    at 1440 unthrottled: LCP, CLS, INP from scripted interactions, JS bytes;
//  - the library at 300 items: what is drawn, how images load, long tasks while scrolling;
//  - API p50 / p95, database statements per request (first and second call, so
//    the cache for the company context and the configurators shows), the first
//    request to the heaviest route after the server starts;
//  - polling: what a page with work in progress asks for, and how often;
//  - the largest JavaScript chunks of the build.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import postgres from 'postgres';
import { initScript, vitals, quietFor } from './checks.mjs';

// "Fast 4G" as used here: 9 Mbit/s down, 1.5 Mbit/s up, 60 ms round trip.
const NETWORK = { offline: false, latency: 60, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 };
const ROUTES = [['anon', '/signin'], ['owner', '/'], ['owner', '/lineup'], ['owner', '/usage'], ['owner', '/company'], ['enterprise', '/films'], ['enterprise', '/swap'], ['enterprise', '/storyboard']];
const APIS = [['owner', '/api/me'], ['owner', '/api/visuals'], ['owner', '/api/usage'], ['owner', '/api/configurators'], ['owner', '/api/credits'], ['owner', '/api/company/support'], ['enterprise', '/api/films'], ['enterprise', '/api/storyboards'], ['enterprise', '/api/swaps']];
const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]) : null; };

export async function runPerf({ stack, contexts, browser }) {
  const out = { network: '9 Mbit/s down, 1.5 Mbit/s up, 60 ms RTT', cpu: '4x slowdown at 390', routes: [], apis: [], dbStatements: [], library: null, polling: [], chunks: [], coldStart: {} };

  // The first request to the heaviest route after the server started.
  for (const [role, p] of [['owner', '/'], ['owner', '/api/visuals']]) {
    const t = Date.now(); const r = await contexts[role].desktop.request.get(p); out.coldStart[p] = { firstMs: Date.now() - t, status: r.status() };
    const t2 = Date.now(); await contexts[role].desktop.request.get(p); out.coldStart[p].secondMs = Date.now() - t2;
  }
  out.coldStart.serverReadyMs = stack.readyMs;

  // Routes, phone (throttled) and desktop.
  for (const [role, route] of ROUTES) {
    for (const phone of [true, false]) {
      const ctx = await browser.newContext({ baseURL: stack.origin, storageState: await contexts[role].desktop.storageState(), ...(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 900 } }) });
      await ctx.addInitScript(initScript);
      await ctx.route('**/*', (r) => (/^(localhost|127\.0\.0\.1)$/.test(new URL(r.request().url()).hostname) ? r.continue() : r.abort('blockedbyclient')));
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Network.enable');
      if (phone) { await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); await cdp.send('Network.emulateNetworkConditions', NETWORK); }
      const types = new Map(); let js = 0, all = 0, requests = 0;
      cdp.on('Network.responseReceived', (e) => types.set(e.requestId, e.type));
      cdp.on('Network.loadingFinished', (e) => { requests++; all += e.encodedDataLength; if (types.get(e.requestId) === 'Script') js += e.encodedDataLength; });
      const t = Date.now();
      try {
        await page.goto(route, { waitUntil: 'load', timeout: 60_000 });
        const loadMs = Date.now() - t;
        for (let i = 0; i < 60; i++) { await page.waitForTimeout(150); if ((await page.evaluate(quietFor)) > 600) break; }
        // Scripted interactions for INP: open what folds, type into the first text box.
        for (const s of await page.locator('summary').all().then((x) => x.slice(0, 3))) await s.click({ timeout: 2000 }).catch(() => {});
        const box = page.locator('textarea, input[type=text], input:not([type])').first();
        if (await box.count()) { await box.click({ timeout: 2000 }).catch(() => {}); await page.keyboard.type('Demo', { delay: 50 }).catch(() => {}); }
        await page.waitForTimeout(500);
        const v = await page.evaluate(vitals);
        out.routes.push({ route, role, viewport: phone ? '390, 4x CPU, Fast 4G' : '1440', loadMs, lcpMs: v.lcp, cls: v.cls, inpMs: v.inp, longTaskMs: v.longTaskMs, jsKb: Math.round(js / 1024), totalKb: Math.round(all / 1024), requests, finalPath: new URL(page.url()).pathname });
      } catch (e) { out.routes.push({ route, role, viewport: phone ? '390' : '1440', error: String(e.message).slice(0, 200) }); }
      await ctx.close();
    }
  }

  // The library at scale (Phase 3 group 2): 1,000 pieces of work, on a phone
  // (390 wide, 4x CPU slowdown, the network above). First paint must be under
  // 1.5 s; the server lists from the database alone (no storage read), and the
  // browser fetches only the thumbnails of the tiles on or next to the screen.
  {
    const ctx = await browser.newContext({ baseURL: stack.origin, storageState: await contexts.scale.desktop.storageState(), viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await ctx.addInitScript(initScript);
    await ctx.route('**/*', (r) => (/^(localhost|127\.0\.0\.1)$/.test(new URL(r.request().url()).hostname) ? r.continue() : r.abort('blockedbyclient')));
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.emulateNetworkConditions', NETWORK);
    // A first visit warms the server (the build's first request); the measured visit is the second.
    await page.goto('/library', { waitUntil: 'load', timeout: 60_000 });
    for (let i = 0; i < 60; i++) { await page.waitForTimeout(150); if ((await page.evaluate(quietFor)) > 600) break; }
    const mark = stack.s3.log.length;
    await page.goto('/library', { waitUntil: 'load', timeout: 60_000 });
    await page.waitForFunction(() => [...document.querySelectorAll('.ds-tile img')].some((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30_000 }).catch(() => {});
    const firstTilesMs = await page.evaluate(() => Math.round(performance.now()));
    for (let i = 0; i < 60; i++) { await page.waitForTimeout(150); if ((await page.evaluate(quietFor)) > 600) break; }
    const seen = await page.evaluate(() => {
      const near = 200, h = window.innerHeight;
      const tiles = [...document.querySelectorAll('.ds-tile')];
      const onScreen = tiles.filter((t) => { const r = t.getBoundingClientRect(); return r.bottom > -near && r.top < h + near; }).length;
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      return { listed: tiles.length, onScreen, fcpMs: fcp ? Math.round(fcp.startTime) : null, total: document.querySelector('.workspace-count')?.textContent || '' };
    });
    const log = stack.s3.log.slice(mark);
    out.libraryScale = {
      ...seen, firstTilesMs,
      serverReads: log.filter((l) => !l.includes('(presigned)') && /^(GET|HEAD) /.test(l)).length,
      browserThumbReads: log.filter((l) => l.includes('(presigned)') && l.includes('/thumbs/')).length,
      browserFullReads: log.filter((l) => l.includes('(presigned)') && /\/images\//.test(l)).length,
      serverReadKeys: log.filter((l) => !l.includes('(presigned)') && /^(GET|HEAD) /.test(l)).slice(0, 12).map((l) => l.replace(/orgs\/[^/]+\/users\/[^/]+\//, '…/')).join(' | '),
    };
    out.libraryScale.ok = (seen.fcpMs ?? 99999) < 1500 && out.libraryScale.serverReads === 0 && out.libraryScale.browserThumbReads <= seen.onScreen && out.libraryScale.browserFullReads === 0;
    await ctx.close();
  }

  // The library at 300 visuals.
  {
    const page = await contexts.owner.desktop.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'load' });
    for (let i = 0; i < 60; i++) { await page.waitForTimeout(150); if ((await page.evaluate(quietFor)) > 600) break; }
    const before = await page.evaluate(() => window.__ui.longTasks.reduce((a, b) => a + b, 0));
    const lib = page.locator('#visual-library');
    if (await lib.count()) await lib.scrollIntoViewIfNeeded();
    for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(120); }
    out.library = await page.evaluate((longBefore) => {
      const root = document.querySelector('#visual-library') || document.body;
      const imgs = [...root.querySelectorAll('img')];
      const loaded = imgs.filter((i) => i.complete && i.naturalWidth > 0);
      const oversized = loaded.filter((i) => i.clientWidth > 0 && i.naturalWidth > i.clientWidth * window.devicePixelRatio * 1.5);
      const text = root.innerText || '';
      return {
        cards: root.querySelectorAll('article').length, images: imgs.length, lazy: imgs.filter((i) => i.loading === 'lazy').length,
        loaded: loaded.length, withSize: imgs.filter((i) => i.getAttribute('width') && i.getAttribute('height')).length, oversized: oversized.length,
        countLine: (text.match(/\d[\d,]* of \d[\d,]* visuals?/) || [null])[0], loadMore: /Load more/i.test(text),
        longTaskMsWhileScrolling: Math.round(window.__ui.longTasks.reduce((a, b) => a + b, 0) - longBefore),
      };
    }, before);
    await page.close();
  }

  // API latency (15 calls each).
  for (const [role, api] of APIS) {
    const times = []; let status = 0;
    for (let i = 0; i < 15; i++) { const t = performance.now(); const r = await contexts[role].desktop.request.get(api); status = r.status(); await r.body(); times.push(performance.now() - t); }
    out.apis.push({ api, role, status, p50: pct(times, 50), p95: pct(times, 95), max: Math.round(Math.max(...times)) });
  }

  // Database statements per request. Every statement the Studio sends for a
  // signed-in person is one transaction; Postgres counts them per database
  // (flushed within about 10 s), so each call is followed by a wait.
  const admin = postgres(stack.adminUrl, { max: 1, prepare: false, ssl: /[?&]sslmode=disable\b/.test(stack.adminUrl) ? false : 'require', onnotice: () => {} });
  const count = async () => { await admin`select pg_stat_clear_snapshot()`; const [r] = await admin`select (xact_commit + xact_rollback)::int as n from pg_stat_database where datname = current_database()`; return r.n; };
  try {
    for (const [role, api] of [['owner', '/api/me'], ['owner', '/api/visuals'], ['owner', '/api/configurators'], ['owner', '/api/usage'], ['enterprise', '/api/films']]) {
      const calls = [];
      for (let i = 0; i < 2; i++) {
        await new Promise((r) => setTimeout(r, 11_000)); const a = await count();
        await (await contexts[role].desktop.request.get(api)).body();
        await new Promise((r) => setTimeout(r, 11_000)); const b = await count();
        calls.push(b - a - 1); // minus this counter's own transaction
      }
      out.dbStatements.push({ api, role, first: calls[0], second: calls[1] });
    }
  } finally { await admin.end({ timeout: 5 }); }

  // Polling: 30 seconds on pages with work in progress.
  for (const [role, route] of [['owner', '/'], ['enterprise', '/films']]) {
    const page = await contexts[role].desktop.newPage();
    const seen = [];
    page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) seen.push({ t: Date.now(), p: u.pathname.replace(/[0-9a-f-]{36}/g, ':id') }); });
    await page.goto(route, { waitUntil: 'load' });
    const t0 = Date.now(); await page.waitForTimeout(30_000);
    const by = {};
    for (const s of seen) (by[s.p] = by[s.p] || []).push(s.t - t0);
    out.polling.push({ route, role, windowS: 30, requests: Object.entries(by).map(([p, ts]) => ({ path: p, count: ts.length, gapsS: ts.slice(1).map((t, i) => Math.round((t - ts[i]) / 100) / 10) })).sort((a, b) => b.count - a.count) });
    await page.close();
  }

  // The largest JavaScript chunks in the build.
  const files = [];
  const walk = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
  walk(path.resolve('.next/static/chunks'));
  out.chunks = files.map((f) => { const b = fs.readFileSync(f); return { file: path.relative(path.resolve('.next/static'), f).split(path.sep).join('/'), kb: Math.round(b.length / 1024), gzipKb: Math.round(zlib.gzipSync(b).length / 1024) }; })
    .sort((a, b) => b.kb - a.kb).slice(0, 15);
  out.totalChunkKb = Math.round(files.reduce((n, f) => n + fs.statSync(f).size, 0) / 1024);
  return out;
}
