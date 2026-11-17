// CI's last UI step: merge the shards' reports into one, write the summary,
// and fail when a count went up (scripts/ui/ratchet.mjs).
//
//   node scripts/ui/merge.mjs <dir with one folder per shard> [--out=ui-report] [--expect=N] [--update]
//
// Each shard folder holds what `npm run check:ui -- --shard=i/n` wrote:
// report.json and shots/. The merged report.json, summary.md and every
// screenshot go to --out. With --expect, fewer shard reports than N fail (a
// shard that crashed before writing its report is not a pass).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { finish } from './ratchet.mjs';
import { SCREEN_IDS } from './screens.mjs';

/** One report from several shard reports. */
export function mergeReports(reports) {
  if (!reports.length) throw new Error('No shard report to merge.');
  const blocked = {};
  for (const r of reports) for (const [h, n] of Object.entries(r.blockedServerHosts || {})) blocked[h] = (blocked[h] || 0) + n;
  const screens = [...new Set(reports.flatMap((r) => r.scope?.screens || []))];
  const quick = reports.some((r) => r.scope?.quick);
  const merged = {
    at: reports.map((r) => r.at).sort().pop(),
    studioReadyMs: Math.max(...reports.map((r) => r.studioReadyMs || 0)),
    viewports: reports[0].viewports,
    roles: reports[0].roles,
    results: reports.flatMap((r) => r.results).sort((a, b) => `${a.screen}|${a.role}|${a.w}|${a.theme}`.localeCompare(`${b.screen}|${b.role}|${b.w}|${b.theme}`)),
    blockedServerHosts: blocked,
    harnessMistakes: reports.flatMap((r) => r.harnessMistakes || []),
    scope: { screens, quick, shards: reports.map((r) => r.scope?.shard).filter(Boolean).sort() },
  };
  const perf = reports.find((r) => r.perf)?.perf;
  if (perf) merged.perf = perf;
  // Every shard of the same cut: a page checked twice would count twice.
  const seen = new Set();
  for (const r of merged.results) {
    const k = `${r.screen}|${r.role}|${r.w}|${r.theme}`;
    if (seen.has(k)) throw new Error(`A page is in two shard reports: ${k}. Were the shards cut from the same --only?`);
    seen.add(k);
  }
  return merged;
}

/** Whether a merged report covers the whole matrix (every screen, every viewport). */
export const isFullRun = (report) => !report.scope.quick && SCREEN_IDS.every((id) => report.scope.screens.includes(id));

function findReports(dir) {
  const found = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory() && e.name !== 'shots') walk(p); else if (e.name === 'report.json') found.push(p); } };
  if (fs.existsSync(dir)) walk(dir);
  return found.sort();
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (n) => (args.find((a) => a.startsWith(`--${n}=`)) || '').split('=')[1];
  const dir = args.find((a) => !a.startsWith('--'));
  if (!dir) { console.error('Usage: node scripts/ui/merge.mjs <shard reports dir> [--out=ui-report] [--expect=N] [--update]'); return 2; }
  const out = path.resolve(opt('out') || 'ui-report');
  const files = findReports(path.resolve(dir));
  const expect = Number(opt('expect')) || 0;
  console.log(`${files.length} shard report(s) in ${dir}${expect ? ` (expected ${expect})` : ''}`);
  if (!files.length || files.length < expect) { console.log(`✗ Missing shard reports: a shard did not finish. See its log.`); return 1; }
  const report = mergeReports(files.map((f) => JSON.parse(fs.readFileSync(f, 'utf8'))));
  fs.mkdirSync(path.join(out, 'shots'), { recursive: true });
  // The screenshots of every shard, side by side (their names never collide: screen, person, width, theme).
  for (const f of files) {
    const shots = path.join(path.dirname(f), 'shots');
    if (path.resolve(shots) === path.resolve(out, 'shots') || !fs.existsSync(shots)) continue;
    for (const s of fs.readdirSync(shots)) fs.copyFileSync(path.join(shots, s), path.join(out, 'shots', s));
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  const full = isFullRun(report);
  console.log(`Merged ${report.results.length} page checks from ${files.length} shard(s); ${full ? 'every screen (totals compared too)' : 'screens: ' + report.scope.screens.join(', ')}.`);
  return finish({ report, out, baselineFile: path.resolve('scripts/ui-baseline.json'), update: args.includes('--update'), full });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(2); });
}
