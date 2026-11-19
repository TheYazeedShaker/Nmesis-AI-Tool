// What the UI harness looks at: the people (ROLES), the screens (SCREENS), the
// viewports and themes, and how a run is cut into page checks and shards. No
// dependency (no browser, no database), so CI's plan job can read it before
// `npm ci` (scripts/ui/affected.mjs). docs/design-audit/harness.md explains it.

// Phase 3: the folders seeded for Demo Company (scripts/ui/seed.mjs re-exports it).
export const FOLDER_ID = '00000000-0000-4000-8000-0000000f0001';
// The canvas editor's picture: the first of the owner's seeded key visuals (scripts/ui/seed.mjs, ready, 1536 x 864).
export const EDITOR_VISUAL_ID = '00000000-0000-4000-8000-000000010000';

export const ALL_VIEWPORTS = [[1440, 900], [1280, 800], [1024, 768], [768, 1024], [390, 844], [360, 740]];
export const QUICK_VIEWPORTS = [[1440, 900], [390, 844]];
// Common laptop windows, for the shell's fill check (shellNotFilling): every screen once at each (first person, light).
export const LAPTOP_VIEWPORTS = [[1366, 768], [1536, 864]];
// The owner's laptop (fix/studio-editor-fixes): Chrome on a Retina screen (pixel ratio 2), a 1191 x 786
// window, at 90, 100 and 110 % page zoom, every screen once at each (first person, light). Chrome draws a
// zoomed page as a smaller CSS window at a larger pixel ratio; that is how the zoom is emulated here.
export const RETINA_WINDOW = [1191, 786];
export const RETINA_ZOOMS = [0.9, 1, 1.1];
export const retinaViewport = (zoom) => ({ w: Math.floor(RETINA_WINDOW[0] / zoom), h: Math.floor(RETINA_WINDOW[1] / zoom), dsf: +(2 * zoom).toFixed(2), zoom });
export const KEY_WIDTHS = new Set([1440, 390]); // axe, the keyboard walk and screenshots
export const SHOT_WIDTHS = new Set([1440, 1280, 1024, 390]); // screenshots: small laptops too (Phase 3 group 2)
export const THEMES = ['light', 'dark'];

// Who looks. `org` is opened through the Studio's own deep link after sign-in.
export const ROLES = {
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
  scale: { person: 'scale', org: 'scale', note: 'the library at scale: 1,000 pieces of work (--perf only)' },
};
// F-050: these people read no provider or model name anywhere (no own keys, not staff).
export const NO_PROVIDER_NAMES = new Set(['anon', 'owner', 'creator', 'viewer', 'starter', 'ended', 'nocompany']);
export const CLIENT_ROLES = ['owner', 'creator', 'viewer', 'starter', 'enterprise', 'ended', 'staff', 'staffViewing'];
// The full viewport and theme matrix runs for `full`; other roles at 1440 and 390.
export const SCREENS = [
  { id: 'signin', path: '/signin', roles: ['anon'], full: ['anon'] },
  { id: 'forgot-password', path: '/signin/forgot', roles: ['anon'], full: ['anon'] },
  { id: 'choose-password', path: '/auth/password', roles: ['owner'] },
  { id: 'no-company', path: '/auth/no-company', roles: ['nocompany'] },
  // Phase 3 group 1: Home, the one library, projects and a folder; the key-visual tool moved to /key-visual.
  { id: 'home', path: '/', roles: ['owner', 'creator', 'viewer', 'starter', 'ended', 'staffViewing'], full: ['owner'] },
  { id: 'workspace', path: '/key-visual', roles: CLIENT_ROLES, full: ['owner'] },
  { id: 'library', path: '/library', roles: ['owner', 'viewer', 'ended', 'staffViewing'], full: ['owner'] },
  { id: 'viewer', path: '/library', action: 'viewer', roles: ['owner', 'viewer'] },
  { id: 'projects', path: '/projects', roles: ['owner', 'viewer'], full: ['owner'] },
  { id: 'folder', path: `/projects/${FOLDER_ID}`, roles: ['owner', 'viewer'], full: ['owner'] },
  { id: 'settings', path: '/key-visual', action: 'settings', roles: ['owner', 'enterprise', 'viewer'] },
  { id: 'company-switcher', path: '/', action: 'switcher', roles: ['owner', 'staff'] },
  // The layers (feat/studio-foundations): References open, then the account menu over it (1440 and 390).
  { id: 'account-menu', path: '/key-visual', action: 'account-over-panel', roles: ['owner'] },
  { id: 'lineup', path: '/lineup', roles: ['owner', 'starter', 'viewer'], full: ['owner'] },
  // The canvas editor (feat/studio-editor): every viewport for the owner (phones get the larger-screen note), a viewer at 1440 and 390.
  { id: 'editor', path: `/editor?visual=${EDITOR_VISUAL_ID}`, roles: ['owner', 'viewer'], full: ['owner'] },
  { id: 'films', path: '/films', roles: ['enterprise', 'owner'], full: ['enterprise'] },
  { id: 'swap', path: '/swap', roles: ['enterprise', 'owner'], full: ['enterprise'] },
  { id: 'storyboard', path: '/storyboard', roles: ['enterprise', 'owner'], full: ['enterprise'] },
  { id: 'nano-lab', path: '/nano-lab', roles: ['owner'] },
  { id: 'usage', path: '/usage', roles: ['owner', 'starter', 'enterprise', 'creator', 'staffViewing'], full: ['owner'] },
  { id: 'company', path: '/company', roles: ['owner', 'creator', 'staffViewing'], full: ['owner'] },
  { id: 'not-found', path: '/this-page-does-not-exist', roles: ['owner', 'anon'] },
  { id: 'design-system', path: '/design-system', roles: ['staff'] },
  { id: 'staff-refused', path: '/', roles: ['staffRefused'] },
];
export const SCREEN_IDS = SCREENS.map((s) => s.id);

// Screens in a given state (Phase 3 polish), screenshots only, nothing counted.
// Each belongs to one screen and person: it is taken in the run (or shard) that
// checks that screen as that person. The harness sets no provider key, so
// generation is not set up: the notice over the settings and Generate disabled.
// "Available" answers the Studio's own /api/status as if it were (its real
// answer, with generation on); nothing else changes and nothing is generated.
export const STATE_SIZES = [[1440, 900], [1024, 768], [390, 844]];
export const FINISH_SIZES = [[1440, 900], [390, 844]];
export const STATES = [
  { id: 'key-visual-unavailable', screen: 'settings', role: 'owner', path: '/key-visual', sizes: STATE_SIZES, steps: ['settings'] },
  { id: 'key-visual-available', screen: 'settings', role: 'owner', path: '/key-visual', sizes: STATE_SIZES, steps: ['settings'], generation: true },
  // The finish pass (design/finish-pass): every screen it changed, at 1440 and 390.
  { id: 'home', screen: 'home', role: 'owner', path: '/', sizes: FINISH_SIZES },
  { id: 'library-create', screen: 'library', role: 'owner', path: '/library', sizes: FINISH_SIZES, steps: ['button:Create'] },
  { id: 'projects', screen: 'projects', role: 'owner', path: '/projects', sizes: FINISH_SIZES },
  { id: 'company', screen: 'company', role: 'owner', path: '/company', sizes: FINISH_SIZES },
  { id: 'company-creator', screen: 'company', role: 'creator', path: '/company', sizes: FINISH_SIZES },
  { id: 'usage', screen: 'usage', role: 'owner', path: '/usage', sizes: FINISH_SIZES },
  { id: 'upgrade', screen: 'lineup', role: 'starter', path: '/lineup', sizes: FINISH_SIZES },
  { id: 'story', screen: 'storyboard', role: 'enterprise', path: '/storyboard', sizes: [[1440, 900], [1024, 768], [390, 844]] },
  { id: 'lineup-references', screen: 'lineup', role: 'owner', path: '/lineup', sizes: FINISH_SIZES, steps: ['button:Car 1'] },
];

/** The screens named in `only` (comma-separated ids, or a list); all of them when empty. Unknown ids throw. */
export function selectScreens(only) {
  const ids = (Array.isArray(only) ? only : String(only || '').split(',')).map((s) => s.trim()).filter(Boolean);
  if (!ids.length) return SCREENS;
  const unknown = ids.filter((id) => !SCREEN_IDS.includes(id));
  if (unknown.length) throw new Error(`Unknown screen id: ${unknown.join(', ')}. Known: ${SCREEN_IDS.join(', ')}`);
  const wanted = new Set(ids);
  return SCREENS.filter((s) => wanted.has(s.id));
}

/** Every page check for these screens: one per screen, person, viewport and theme. */
export function pageJobs(screens, { quick = false } = {}) {
  const viewports = quick ? QUICK_VIEWPORTS : ALL_VIEWPORTS;
  const jobs = [];
  for (const screen of screens) {
    for (const role of screen.roles) {
      if (screen.pending) { jobs.push({ screen, role, pending: true }); continue; }
      const full = (screen.full || []).includes(role) && !quick;
      // 768 (tablet) for every screen as well, once (its first person, light), so the shell's
      // fill check (shellNotFilling) covers 1440, 768 and 390 everywhere.
      const tablet = !full && !quick && role === screen.roles.find((r) => !(screen.full || []).includes(r));
      for (const [w, h] of viewports) {
        if (!full && !KEY_WIDTHS.has(w) && !(tablet && w === 768)) continue;
        for (const theme of THEMES) if (KEY_WIDTHS.has(w) || full || theme === 'light') jobs.push({ screen, role, w, h, theme });
      }
      if (!quick && role === screen.roles[0]) for (const [w, h] of LAPTOP_VIEWPORTS) jobs.push({ screen, role, w, h, theme: 'light' });
      if (!quick && role === screen.roles[0]) for (const zoom of RETINA_ZOOMS) jobs.push({ screen, role, ...retinaViewport(zoom), theme: 'light' });
    }
  }
  return jobs;
}

// Rough cost of one check: at 1440 and 390 axe and the keyboard walk run too.
const cost = (job) => (job.pending ? 0 : KEY_WIDTHS.has(job.w) ? 3 : 1);

/**
 * Cut the page checks into `n` shards by screen and person (a screen and person
 * never splits), balanced by cost: the largest first, each to the lightest
 * shard. Deterministic, so every shard computes the same cut. Returns shard
 * `i` (1-based) as { jobs, units: ['screen|role', …] }.
 */
export function shardJobs(jobs, i, n) {
  if (!Number.isInteger(n) || n < 1 || !Number.isInteger(i) || i < 1 || i > n) throw new Error(`A shard is i/n with 1 <= i <= n (got ${i}/${n})`);
  const units = new Map();
  for (const job of jobs) {
    const key = `${job.screen.id}|${job.role}`;
    if (!units.has(key)) units.set(key, { key, jobs: [], weight: 0 });
    const u = units.get(key);
    u.jobs.push(job); u.weight += cost(job);
  }
  const sorted = [...units.values()].sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));
  const bins = Array.from({ length: n }, () => ({ weight: 0, units: [] }));
  for (const u of sorted) {
    let best = 0;
    for (let b = 1; b < n; b++) if (bins[b].weight < bins[best].weight) best = b;
    bins[best].units.push(u); bins[best].weight += u.weight;
  }
  const mine = bins[i - 1];
  return { jobs: mine.units.flatMap((u) => u.jobs), units: mine.units.map((u) => u.key), weight: mine.weight };
}

// CI: how many shards a set of checks gets (each shard pays about two minutes
// of setup: install, browser, build, the Studio, the seed and the backfill).
export const CHECKS_PER_SHARD = 80;
export const MAX_SHARDS = 4;
export const shardCount = (checks) => Math.max(1, Math.min(MAX_SHARDS, Math.ceil(checks / CHECKS_PER_SHARD)));
