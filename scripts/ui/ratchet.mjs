// The UI harness's counts and its ratchet (scripts/ui-baseline.json): what is
// counted from a report, the readable summary, the comparison with the
// baseline, and writing it. No browser and no dependency: check-ui.mjs uses it
// after a run, scripts/ui/merge.mjs after CI's shards. docs/design-audit/harness.md.
import fs from 'node:fs';
import path from 'node:path';

// Run-to-run noise allowed before a count fails CI (owner, 2026-11-15): the
// keyboard walk lands on slightly different stops from one run to the next.
// It applies to the totals and to each screen.
export const TOLERANCE = { focusWithoutIndicator: 5 };
export const RATCHETED = ['pagesZoomedOutOnPhones', 'editorBand', 'fixedOverSettings', 'controlsSpilling', 'providerNamesShown', 'pagesWithErrors', 'pagesWithSidewaysScroll', 'consoleErrors', 'httpErrors', 'axeCritical', 'axeSerious', 'focusWithoutIndicator', 'focusHiddenBySticky', 'targetsUnder24', 'overlapped', 'clippedWithoutEllipsis', 'ellipsisWithoutFullText', 'serverHostsBlocked', 'pagesOverCls01'];
// Counted for the whole Studio process, not per page: in the totals only.
const WHOLE_RUN = new Set(['serverHostsBlocked']);
export const PER_SCREEN = RATCHETED.filter((k) => !WHOLE_RUN.has(k));

/** Every count, from a list of page results (and the server hosts the network guard refused). */
export function countsOf(results, blockedServerHosts = {}) {
  const pages = results.filter((r) => !r.pending);
  const sum = (f) => pages.reduce((n, r) => n + (f(r) || 0), 0);
  const axeBy = (impact) => sum((r) => (r.axe || []).filter((v) => v.impact === impact).reduce((n, v) => n + v.nodes, 0));
  return {
    pages: pages.length,
    pagesWithErrors: pages.filter((r) => r.error).length,
    pagesWithSidewaysScroll: pages.filter((r) => r.overflowX > 0).length,
    consoleErrors: sum((r) => r.consoleErrors?.length),
    httpErrors: sum((r) => r.httpErrors?.length),
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
    fixedOverSettings: sum((r) => r.fixedOverSettings?.length),
    editorBand: sum((r) => r.editorBand?.length),
    pagesZoomedOutOnPhones: pages.filter((r) => (r.zoomedBy || 0) > 1).length,
    controlsSpilling: sum((r) => r.spilling?.length),
    ellipsisWithoutFullText: sum((r) => r.ellipsisNoTitle?.length),
    pagesOverCls01: pages.filter((r) => (r.vitals?.cls || 0) > 0.1).length,
    providerNamesShown: sum((r) => r.providerNames?.length),
    pagesNeverQuiet: pages.filter((r) => r.ready && !r.ready.quiet).length,
    serverHostsBlocked: Object.keys(blockedServerHosts).length,
  };
}

/** The ratcheted counts of each screen in the results: { id: { count: n } }. */
export function countsByScreen(results) {
  const by = {};
  for (const r of results) (by[r.screen] = by[r.screen] || []).push(r);
  return Object.fromEntries(Object.entries(by).sort(([a], [b]) => a.localeCompare(b)).map(([id, rs]) => {
    const c = countsOf(rs);
    return [id, Object.fromEntries(PER_SCREEN.map((k) => [k, c[k]]))];
  }));
}

/** The readable summary (summary.md) of a report and its totals. */
export function summaryLines(report, totals) {
  const pages = report.results.filter((r) => !r.pending);
  const axeRules = {};
  for (const r of pages) for (const v of r.axe || []) { const k = `${v.impact} · ${v.id}`; axeRules[k] = (axeRules[k] || 0) + v.nodes; }
  const scope = report.scope ? [`Screens: ${report.scope.screens.join(', ')}${report.scope.shard ? ` (shard ${report.scope.shard})` : ''}.`, ''] : [];
  return ['# UI harness summary', '', `${report.at}. ${totals.pages} page checks. Studio ready in ${report.studioReadyMs} ms.`, '', ...scope, '| Check | Count |', '|---|---:|',
    ...Object.entries(totals).map(([k, v]) => `| ${k} | ${v} |`), '', '## axe rules (nodes)', '', ...Object.entries(axeRules).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`),
    '', '## Provider or model names a client could read (F-050; must be none)', '', ...[...new Set(pages.flatMap((r) => (r.providerNames || []).map((f) => `- ${r.screen} (${r.role}) · ${f.where}: ${f.text}`)))].slice(0, 80),
    ...(report.perf?.libraryScale ? ['', '## The library at 1,000 items (phone: 390 wide, 4x CPU, throttled network)', '', ...Object.entries(report.perf.libraryScale).map(([k, v]) => `- ${k}: ${v}`)] : []),
    '', '## Pending screens', '', ...report.results.filter((r) => r.pending).map((r) => `- ${r.screen} (${r.role}): ${r.pending}`),
    '', '## Server requests the network guard refused', '', ...Object.entries(report.blockedServerHosts || {}).map(([h, n]) => `- ${h}: ${n}`),
    '', '## Mistakes the harness made about itself', '', ...[...new Set(report.harnessMistakes || [])].map((m) => `- ${m}`)];
}

const over = (k, now, base) => (now || 0) > (base ?? Infinity) + (TOLERANCE[k] || 0);

/**
 * Compare a run with the baseline. `full` is true when every screen ran at
 * every viewport (no --only, no --quick): then the totals are compared as well.
 * Each screen that ran is compared with its own counts (`byScreen`); screens
 * without their own counts yet are summed and compared with the full totals
 * (lenient), with a note. Returns { ok, worse: ['screen: key', …], lines }.
 */
export function compare(baseline, { totals, byScreen, full }) {
  const lines = [], worse = [];
  const base = baseline?.counts;
  if (!base) return { ok: true, worse, lines: ['No baseline yet (scripts/ui-baseline.json): nothing to compare. Write one with --update.'] };
  const baseBy = baseline.byScreen || {};
  if (full) {
    for (const k of RATCHETED) if ((totals[k] || 0) !== (base[k] || 0)) lines.push(`  total ${k}: ${base[k]} → ${totals[k]}`);
    for (const k of RATCHETED) if (over(k, totals[k], base[k])) worse.push(`total: ${k}`);
  } else {
    // A whole-run count (refused server hosts) cannot be split by screen: against the full total.
    for (const k of WHOLE_RUN) if (over(k, totals[k], base[k])) worse.push(`total: ${k}`);
  }
  const missing = [];
  for (const [id, counts] of Object.entries(byScreen)) {
    const b = baseBy[id];
    if (!b) { missing.push(id); continue; }
    for (const k of PER_SCREEN) {
      if ((counts[k] || 0) !== (b[k] || 0)) lines.push(`  ${id} ${k}: ${b[k] || 0} → ${counts[k] || 0}`);
      if (over(k, counts[k], b[k] || 0)) worse.push(`${id}: ${k}`);
    }
  }
  if (missing.length) {
    lines.push(`Note: no per-screen baseline yet for ${missing.join(', ')}. Their counts together are compared with the full-run totals (lenient). Run CI with update_baseline (workflow_dispatch) and commit the scripts/ui-baseline.json it uploads.`);
    if (!full) {
      for (const k of PER_SCREEN) {
        const now = missing.reduce((n, id) => n + (byScreen[id][k] || 0), 0);
        if (over(k, now, base[k])) worse.push(`${missing.join('+')}: ${k}`);
      }
    }
  }
  lines.push(worse.length ? `✗ Worse than the baseline: ${worse.join(', ')}` : '✓ Nothing got worse.');
  return { ok: worse.length === 0, worse, lines };
}

/** The baseline after --update: a full run writes the totals and every screen; a subset only its screens. */
export function updatedBaseline(baseline, { totals, byScreen, full }, measured = new Date().toISOString().slice(0, 10)) {
  const counts = full ? Object.fromEntries(RATCHETED.map((k) => [k, totals[k]])) : baseline?.counts;
  if (!counts) throw new Error('The first baseline must come from a full run (no --only, no --quick).');
  return {
    note: 'Counts from the full npm run check:ui matrix: `counts` for the whole run, `byScreen` for each screen (every person, viewport and theme). They may only go down; Phase 4 brings them to zero. focusWithoutIndicator moves by a few from run to run (CI allows +5, in the totals and per screen). docs/design-audit/harness.md.',
    measured: full ? measured : baseline.measured,
    counts,
    byScreen: Object.fromEntries(Object.entries({ ...(baseline?.byScreen || {}), ...byScreen }).sort(([a], [b]) => a.localeCompare(b))),
  };
}

/** The baseline as a file: one line per screen, and a zero count left out (a missing key is 0). */
export function formatBaseline(b) {
  const screens = Object.entries(b.byScreen || {}).map(([id, c]) => `    ${JSON.stringify(id)}: ${JSON.stringify(Object.fromEntries(Object.entries(c).filter(([, v]) => v)))}`);
  const head = JSON.stringify({ note: b.note, measured: b.measured, counts: b.counts }, null, 2).replace(/\n}$/, '');
  return `${head},\n  "byScreen": {${screens.length ? '\n' + screens.join(',\n') + '\n  ' : ''}}\n}\n`;
}

export function readBaseline(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

/**
 * After a run (or after merging shards): write summary.md, compare with the
 * baseline (unless `compareWith` is false: a shard, a --quick run), and with
 * `update` write it. Returns the exit code (0 or 1).
 */
export function finish({ report, out, baselineFile, update = false, full, compareWith = true, log = console.log }) {
  const totals = countsOf(report.results, report.blockedServerHosts);
  const lines = summaryLines(report, totals);
  fs.writeFileSync(path.join(out, 'summary.md'), lines.join('\n') + '\n');
  log(lines.slice(0, 30).join('\n'));
  const run = { totals, byScreen: countsByScreen(report.results), full };
  const baseline = readBaseline(baselineFile);
  if (update) {
    fs.writeFileSync(baselineFile, formatBaseline(updatedBaseline(baseline, run)));
    log(full ? 'Baseline written (totals and every screen).' : `Baseline written for ${Object.keys(run.byScreen).join(', ')} (the totals are kept: they come from a full run).`);
    return 0;
  }
  if (!compareWith) return 0;
  const result = compare(baseline, run);
  for (const l of result.lines) log(l);
  return result.ok ? 0 : 1;
}
