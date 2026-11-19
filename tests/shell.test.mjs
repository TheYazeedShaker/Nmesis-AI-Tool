// The Canva-simple shell (feat/studio-shell): one flag list for the tools, the
// left navigation and account menu, Uploads, the reference tray, Home, the Key
// visual settings in their beginner order, and no band under the page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OPEN_TOOLS, TOOL_PATHS, closedToolAt, toolOpen, COMING_SOON } from '../lib/tools.ts';
import { can } from '../lib/accounts/can.ts';
import { uploadsFrom, uploadMarkKey, uploadsPrefix } from '../lib/uploads.ts';
import { profileName } from '../lib/accounts/names.ts';
import { tsxLoader } from './support/load-tsx.mjs';

const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');

test('one flag list: Key visual and Car lineup are open, every other tool is Coming soon and its pages are closed', () => {
  assert.deepEqual([...OPEN_TOOLS], ['visuals', 'lineup']);
  for (const t of ['storyboard', 'films', 'swap']) assert.equal(toolOpen(t), false, t);
  assert.equal(closedToolAt('/films'), 'films');
  assert.equal(closedToolAt('/films/abc'), 'films');
  assert.equal(closedToolAt('/swap'), 'swap');
  assert.equal(closedToolAt('/storyboard'), 'storyboard');
  for (const open of ['/key-visual', '/lineup', '/', '/library', '/filmsx', '/brand']) assert.equal(closedToolAt(open), null, open);
  assert.deepEqual(Object.keys(TOOL_PATHS).sort(), ['films', 'lineup', 'storyboard', 'swap', 'visuals']);
  // The proxy sends a closed tool's pages Home, before anything else on a signed-in page.
  const proxy = read('proxy.ts');
  assert.match(proxy, /import \{closedToolAt\} from '@\/lib\/tools';/);
  assert.match(proxy, /if\(closedToolAt\(path\)\)\{const to=request\.nextUrl\.clone\(\);to\.pathname='\/';to\.search='';return NextResponse\.redirect\(to,303\)\}/);
  // Home and the library's Create menu read the same list.
  const pages = read('components/workspace/pages.tsx');
  assert.match(pages, /!toolOpen\(tool\)\?\{\.\.\.t,locked:COMING_SOON,soon:true\}/);
  assert.match(pages, /locked:toolOpen\(tool\)\?planChip\(account,feature\):COMING_SOON/);
  assert.equal(COMING_SOON, 'Coming soon');
});

test('Coming soon cards are visible and not links; open tools are links', () => {
  const load = tsxLoader({ 'next/link': { __esModule: true, default: ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children) } });
  const { HomeScreen } = load('components/workspace/home.tsx');
  const tools = [
    { key: 'kv', name: 'Key visual', line: 'One car.', href: '/key-visual', icon: null },
    { key: 'lineup', name: 'Car lineup', line: 'Several cars.', href: '/lineup', icon: null, cars: ['/api/cars/demo.suv/picture', '/api/cars/demo.hatch/picture', undefined] },
    { key: 'film', name: 'Film', line: 'A film.', href: '/films', icon: null, locked: 'Coming soon', soon: true },
  ];
  const html = renderToStaticMarkup(React.createElement(HomeScreen, { tools, recent: [], onStart: () => {}, credits: { left: 300, resetsOn: '8 Dec 2026', href: '/usage' } }));
  assert.match(html, /<a href="\/key-visual"/);
  assert.match(html, /<a href="\/lineup"/);
  assert.doesNotMatch(html, /href="\/films"/, 'a coming-soon tool is not a link');
  assert.match(html, /aria-disabled="true"[^>]*>[\s\S]*Film[\s\S]*Coming soon/);
  // Car lineup: two or three different cars side by side.
  assert.equal((html.match(/workspace-lineup-car/g) || []).length, 3);
  assert.match(html, /src="\/api\/cars\/demo\.suv\/picture"[\s\S]*src="\/api\/cars\/demo\.hatch\/picture"/);
  // How it works, continue (never a carousel), credits left.
  assert.match(html, /How it works[\s\S]*Pick[\s\S]*Add references[\s\S]*Generate[\s\S]*Edit and share/);
  assert.match(html, /Continue where you left off/);
  assert.doesNotMatch(html, /ds-scroller/);
  assert.match(html, /<b>300<\/b> credits left this month · they reset on 8 Dec 2026\./);
});

test('who may change the brand, share and add uploads: owners and creators, never viewers or staff viewing a client', () => {
  for (const action of ['brand.edit', 'share.manage', 'uploads.add', 'work.create']) {
    assert.equal(can({ role: 'owner' }, action), true, action);
    assert.equal(can({ role: 'creator' }, action), true, action);
    assert.equal(can({ role: 'viewer' }, action), false, action);
    assert.equal(can({ role: 'owner', viewingAs: { id: 'x' } }, action), false, action);
    assert.equal(can(null, action), false, action);
  }
});

test('Uploads: only the marks under the person’s own prefix, newest first, as their assets', () => {
  const prefix = 'orgs/org-1/users/00000000-0000-4000-8000-000000000001/';
  const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
  assert.equal(uploadMarkKey(prefix, a), prefix + 'uploads/' + a + '.json');
  const list = uploadsFrom([
    { key: uploadsPrefix(prefix) + a + '.json', uploaded: new Date('2026-11-01T10:00:00Z') },
    { key: uploadsPrefix(prefix) + b + '.json', uploaded: new Date('2026-11-02T10:00:00Z') },
    { key: uploadsPrefix(prefix) + 'not-an-id.json', uploaded: new Date() },
    { key: 'orgs/org-1/users/someone-else/uploads/' + a + '.json', uploaded: new Date() },
  ], prefix);
  assert.deepEqual(list.map((u) => u.id), [b, a]);
  assert.deepEqual(list[0], { id: b, src: '/api/assets/' + b, thumb: '/api/assets/' + b + '?thumb=1', at: '2026-11-02T10:00:00.000Z' });
  const route = read('app/api/assets/route.ts');
  assert.match(route, /if\(form\.get\('upload'\)==='1'\)await store\.put\(uploadMarkKey\(ctx\.prefix,id\)/);
  assert.match(route, /store\.list\(\{prefix:uploadsPrefix\(ctx\.prefix\)/, 'listed from the signed-in person’s own prefix');
});

test('the reference tray: add, tick, remove, a limit, kept for the tab, and only safe addresses', async () => {
  const store = new Map();
  globalThis.window = {};
  globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  try {
    const tray = await import('../lib/reference-tray.ts?' + Date.now());
    assert.deepEqual(tray.trayItems(), []);
    assert.equal(tray.addReference({ key: 'unsplash:a', src: 'https://images.example.test/a', name: 'A', provider: 'unsplash' }), true);
    assert.equal(tray.inTray('unsplash:a'), true);
    tray.updateReference('unsplash:a', { assetId: 'asset-1' });
    assert.equal(tray.trayItems()[0].assetId, 'asset-1');
    for (let i = 0; i < tray.TRAY_LIMIT - 1; i++) assert.equal(tray.addReference({ key: 'upload:' + i, src: '/api/assets/' + i, name: 'U', provider: 'upload', picked: i % 2 === 0 }), true);
    assert.equal(tray.addReference({ key: 'upload:over', src: '/api/assets/x', name: 'X', provider: 'upload' }), false, 'full');
    tray.clearPicked();
    assert.ok(tray.trayItems().every((i) => !i.picked));
    tray.removeReference('unsplash:a');
    assert.equal(tray.inTray('unsplash:a'), false);
    assert.ok(JSON.parse(store.get('studio-reference-tray')).length > 0, 'kept in sessionStorage');
    // A stored item that is not a safe address is dropped when read back.
    store.set('studio-reference-tray', JSON.stringify([{ key: 'x', src: 'javascript:alert(1)', name: 'x', provider: 'upload' }]));
    const fresh = await import('../lib/reference-tray.ts?again' + Date.now());
    assert.deepEqual(fresh.trayItems(), []);
  } finally { delete globalThis.window; delete globalThis.sessionStorage; }
});

test('the account menu: name (from the profile), email, avatar, company and members, the pages, theme, help, plans and credits, log out', () => {
  assert.equal(profileName({ full_name: '  Alex   Example ' }), 'Alex Example');
  assert.equal(profileName({ name: 'Sam' }), 'Sam');
  assert.equal(profileName({ full_name: 42 }), undefined);
  assert.equal(profileName(null), undefined);
  assert.match(read('lib/accounts/summary.ts'), /user:\{email:ctx\.user\.email,name:ctx\.user\.name\?\?null\}/);
  const nav = read('components/shell/side-nav.tsx');
  for (const words of ['Your account', 'Settings', 'Theme', 'Help', 'Plans and credits', 'Log out', 'members']) assert.ok(nav.includes(words), words);
  assert.match(nav, /fetch\('\/api\/company\/team'/, 'member count from the team every member may read');
  assert.match(nav, /<PlaceList account=\{account\}/, 'the same company switch as before');
  // The navigation draws lib/shell-nav.ts (tests/shell-nav.test.mjs); collapsible and remembered.
  assert.match(nav, /navItems\(current\)\.map/);
  assert.match(nav, /navSelection\(current,panel\)/);
  assert.match(nav, /useRememberedOpen\('studio-nav',true\)/);
  assert.match(nav, /aria-label=\{expanded\?'Collapse navigation':'Expand navigation'\}/);
});

test('theme: light, dark or the system’s, kept in this browser', async () => {
  const { themeAttribute, THEME_CHOICES } = await import('../lib/theme.ts');
  assert.deepEqual(THEME_CHOICES.map((t) => t.id), ['light', 'dark', 'system']);
  assert.equal(themeAttribute('system'), undefined);
  assert.equal(themeAttribute('dark'), 'dark');
});

test('Key visual settings: one column in the beginner order, everything else under a closed Advanced', () => {
  const kv = read('app/key-visual/page.tsx');
  const block = kv.slice(kv.indexOf(' const settings=<>'), kv.indexOf('\n const notices=<>'));
  const order = ['<CarSettings title="Car and view"', '<ReferenceList id="kv-references-title" title="References" ', '{quality}', '<SettingsSection title="How many"', '<p className="editor-cost-line" aria-live="polite">{costLine}</p>', '<Fold name="kv-advanced" title="Advanced"'];
  let at = -1;
  for (const piece of order) { const next = block.indexOf(piece); assert.ok(next > at, `${piece} comes next`); at = next; }
  // Advanced holds the idea, art direction, the pin link and (staff, own keys) the engine; it is not opened by default.
  const advanced = block.slice(block.indexOf('<Fold name="kv-advanced"'));
  for (const piece of ['<PromptSettings label="Your idea (optional)"', '<SettingsSection title="Art direction"', 'label="Pinterest pin link"', '{showProvider&&<SettingsSection title="Image generator"']) assert.ok(advanced.includes(piece), piece);
  assert.doesNotMatch(advanced, /defaultOpen/);
  // Smart pick is on by default and picks one photo (still adjustable); the cost line follows the price live.
  assert.match(kv, /const \[smartPick,setSmartPick\]=useState\(true\);const \[pickCount,setPickCount\]=useState\(1\);/);
  assert.match(kv, /const costLine=[\s\S]*This will use <b>\{creditWords\(cost\)\}<\/b>/);
  // Several references: visual i takes reference i, unless a smart prompt plans one picture.
  assert.match(kv, /moodId:moodIds\[i%moodIds\.length\]/);
});

test('no band under the page: the editor fills the window, the old dark body never shows, no room held for a phone bar', () => {
  const css = read('app/side-nav.css');
  assert.match(css, /body:has\(> \.ds-shell\), body:has\(\.studio-frame\) \{ background: var\(--ds-bg\); \}/);
  assert.match(css, /\.studio-frame\[data-fill\] \{ height: 100dvh; min-height: 0; overflow: clip; position: relative; \}/);
  assert.match(css, /\.studio-frame \.ds-main\.bleed > \.ds-editor \{[^}]*grid-template-rows: minmax\(0, 1fr\);/);
  assert.match(css, /\.studio-frame \.ds-main \{ padding-bottom: var\(--ds-space-32\); \}/);
  assert.match(read('components/ds/editor.tsx'), /data-rail=\{tools\.length \? undefined : 'none'\}/);
  assert.match(read('components/workspace/frame.tsx'), /data-fill=\{bleed\|\|undefined\}/);
});

test('the shell alone sizes from the viewport: no page or editor sets its own viewport height (fix/shell-height-and-critique)', () => {
  // Every vh/dvh in the Studio's own stylesheets, outside the shell's frame, its navigation and panel, and
  // the overlays that cover the window (dialogs, drawers, the viewer, menus); locked tools' old CSS is not touched.
  const allowed = /^(\.ds-app|\.ds-shell|\.ds-shell\.studio-frame|\.studio-frame\[data-fill\]|\.studio-side|\.studio-panel|\.studio-account-pop|\.auth-shell|\.share-view-img|\.ds-dialog[\w-]*|\.ds-drawer|\.ds-viewer|\.ds-gallery-toc)(?![\w-])/;
  const files = ['app/design-system.css', 'app/side-nav.css', 'app/editor.css', 'app/workspace.css', 'app/studio-shell.css', 'app/panels.css', 'app/inputs.css', 'app/references.css', 'app/brand.css', 'app/elements.css', 'app/account.css', 'app/share.css', 'app/auth.css', 'app/key-visual/editor-visuals.css', 'app/lineup/editor-lineup.css'];
  const offenders = [];
  for (const f of files) {
    const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*\b100d?vh\b[^{}]*)\}/g)) {
      const sel = m[1].trim().split('\n').pop().trim();
      for (const one of sel.split(',').map((s) => s.trim())) if (!allowed.test(one)) offenders.push(`${f}: ${one}`);
    }
  }
  assert.deepEqual(offenders, []);
  // The editor fills its container; the old "window minus the top bar" height is gone.
  const ds = read('app/design-system.css');
  assert.doesNotMatch(ds, /calc\(100dvh - var\(--ds-topbar-h\)\)/);
  assert.match(ds, /\.ds-editor \{[^}]*height: 100%; min-height: 0;/);
  // check:ui asserts it on every screen at 1440, 768 and 390.
  assert.match(read('scripts/ui/checks.mjs'), /out\.shellShort = \[\];/);
});

test('the band on a real laptop: on a tool page the document is the shell and nothing more (fix/studio-editor-fixes)', () => {
  const css = read('app/side-nav.css').replace(/\/\*[\s\S]*?\*\//g, '');
  // The shell contains its own absolutely positioned boxes (its clip reaches them)...
  assert.match(css, /\.studio-frame\[data-fill\] \{[^}]*overflow: clip; position: relative; \}/);
  // ...and the body is the window (100 % of the root, no viewport unit) and clips whatever else it holds;
  // the root clips too, so the body's overflow is its own and not the window's.
  const root = css.match(/html:has\(> body > \.studio-frame\[data-fill\]\) \{([^}]*)\}/)?.[1] || '';
  const body = css.match(/html:has\(> body > \.studio-frame\[data-fill\]\) > body \{([^}]*)\}/)?.[1] || '';
  assert.match(root, /height: 100%; overflow: clip;/);
  assert.match(body, /height: 100%; overflow: clip; position: relative;/);
  for (const rule of [root, body]) assert.doesNotMatch(rule, /\d(d|s|l)?vh\b/);
  // check:ui: a document taller than the window, a shell bottom that is not the window's (at any page zoom),
  // and a node outside the shell that makes the document taller, all count as shellNotFilling, at
  // 1191 x 786 on Retina at 90, 100 and 110 % zoom too.
  const checks = read('scripts/ui/checks.mjs'), ui = read('scripts/check-ui.mjs'), screens = read('scripts/ui/screens.mjs');
  assert.match(checks, /el: 'document taller than the window'/);
  assert.match(checks, /el: 'shell bottom is not the window bottom'/);
  assert.match(checks, /export function shellOutsideProbe\(\)/);
  assert.match(ui, /out\.shellShort = \[\.\.\.\(out\.shellShort \|\| \[\]\), \.\.\.await page\.evaluate\(shellOutsideProbe\)\]/);
  assert.match(screens, /export const RETINA_WINDOW = \[1191, 786\];/);
  assert.match(screens, /export const RETINA_ZOOMS = \[0\.9, 1, 1\.1\];/);
  assert.match(ui, /dsf \? await contexts\[role\]\.atRatio\(dsf\)/);
  assert.match(read('scripts/ui/ratchet.mjs'), /shellNotFilling: sum\(\(r\) => r\.shellShort\?\.length\)/);
});

test('accessibility of the shell (check:ui on PR 42): references point only at what exists, names include what is seen, truncated names say themselves in full', () => {
  const nav = read('components/shell/side-nav.tsx');
  // aria-controls names the panel only while it is on the page (an id that does not exist is an invalid value).
  assert.match(nav, /aria-controls=\{on\?'studio-panel':undefined\}/);
  assert.doesNotMatch(read('components/editor/reference-list.tsx'), /aria-controls=/);
  // The account button: its visible name and company are its name; a label only when collapsed (just the avatar shows).
  assert.match(nav, /aria-label=\{compact\?`Account: \$\{account\.user\.name\|\|account\.user\.email\}`:undefined\}/);
  assert.match(nav, /<b className="ds-truncate" title=\{account\.user\.name\|\|account\.user\.email\}>/);
  assert.match(nav, /<span className="ds-truncate ds-muted" title=\{workName\(account\)\}>/);
  // The editor's own rules no longer assume main sits directly in the frame: phones size the editor to its content (no layout shift).
  const editor = read('app/editor.css');
  assert.doesNotMatch(editor, /\.workspace > \.ds-main\.bleed|:has\(> \.ds-main\.bleed\)/);
  // Phones: the editor is the window (Generate keeps its own row and never moves), and the version strip,
  // not the stage, takes the spare room, so nothing moves when the versions load (check:ui on PR 42).
  const shell = read('app/side-nav.css');
  assert.match(shell, /\.studio-frame \.ds-main\.bleed > \.ds-editor \{ grid-template-rows: minmax\(0, 1fr\) auto; min-height: 0; \}/);
  assert.match(shell, /\.editor-stage > \.editor-stage-main \{ flex: 0 0 auto; \}/);
  assert.match(shell, /\.editor-stage > \.editor-stage-history \{ flex: 1 0 auto; \}/);
  assert.doesNotMatch(shell, /height: auto; min-height: 100dvh; overflow: visible/);
  // Smart pick asks the photo library only for someone who can make work now.
  assert.match(read('app/key-visual/page.tsx'), /if\(!smartPick\|\|!car\|\|!mayChange\|\|handAdded/);
});

test('design pass: what is shown uses the stage, the versions sit right under it, settings fade at Generate (fix/studio-editor-fixes)', () => {
  const css = read('app/editor.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const block = css.match(/@media \(min-width: 769px\) \{\s*\.ds-canvas-stage > \.editor-stage > \.editor-stage-main:has\(\.editor-configurator, \.editor-result\)[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(block, 'the stage rules exist');
  // The stage's middle is a size container only when it shows a configurator or a result (a long board keeps scrolling).
  assert.match(block, /\.editor-stage-main:has\(\.editor-configurator, \.editor-result\) \{ container-type: size; flex: 1 1 0; \}/);
  // The configurator fills its height, never taller than 4:3; a result is the largest 16:9 that fits.
  assert.match(block, /\.editor-stage-main \.editor-configurator-frame \{ flex: 1 1 auto; aspect-ratio: auto;[^}]*max-height: calc\(min\(100cqw, 1040px\) \* 3 \/ 4\); \}/);
  assert.match(block, /\.editor-stage-main \.editor-result \{ width: min\(100cqw, 1040px, calc\(\(100cqh - var\(--ds-space-48\)\) \* 16 \/ 9\)\); \}/);
  // The versions keep one card's height from the start: nothing moves when they load.
  assert.match(block, /> \.editor-stage-history \{ min-height: calc\(var\(--ds-space-64\) \* 2\); \}/);
  assert.doesNotMatch(block, /\d(d|s|l)?vh\b/, 'container units, never a viewport height');
  // The settings' last pixels fade into the panel above Generate instead of being sliced.
  assert.match(read('app/design-system.css'), /\.ds-settings-body::after \{\s*content: ""; position: sticky;[^}]*linear-gradient\(to bottom, transparent, var\(--ds-panel\)\); pointer-events: none;/);
});
