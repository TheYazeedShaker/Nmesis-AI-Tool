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
  // The navigation: Home, Projects, References, Brand, Uploads; collapsible and remembered.
  assert.deepEqual([...nav.matchAll(/\{key:'(\w+)',label:'([^']+)'/g)].map((m) => m[2]), ['Home', 'Projects', 'References', 'Brand', 'Uploads']);
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
  const order = ['<CarSettings title="Car and view"', '<ReferencesSettings ', '{quality}', '<SettingsSection title="How many"', '<p className="editor-cost-line" aria-live="polite">{costLine}</p>', '<Fold name="kv-advanced" title="Advanced"'];
  let at = -1;
  for (const piece of order) { const next = block.indexOf(piece); assert.ok(next > at, `${piece} comes next`); at = next; }
  // Advanced holds the idea, art direction, the pin link and (staff, own keys) the engine; it is not opened by default.
  const advanced = block.slice(block.indexOf('<Fold name="kv-advanced"'));
  for (const piece of ['<PromptSettings label="Your idea (optional)"', '<SettingsSection title="Art direction"', 'label="Pinterest pin link"', '{showProvider&&<SettingsSection title="Image generator"']) assert.ok(advanced.includes(piece), piece);
  assert.doesNotMatch(advanced, /defaultOpen/);
  // Smart pick is on by default, with how many; the cost line follows the price live.
  assert.match(kv, /const \[smartPick,setSmartPick\]=useState\(true\);const \[pickCount,setPickCount\]=useState\(3\);/);
  assert.match(kv, /const costLine=[\s\S]*This will use <b>\{creditWords\(cost\)\}<\/b>/);
  // Several references: visual i takes reference i, unless a smart prompt plans one picture.
  assert.match(kv, /moodId:moodIds\[i%moodIds\.length\]/);
});

test('no band under the page: the editor fills the window, the old dark body never shows, no room held for a phone bar', () => {
  const css = read('app/side-nav.css');
  assert.match(css, /body:has\(> \.ds-shell\), body:has\(\.studio-frame\) \{ background: var\(--ds-bg\); \}/);
  assert.match(css, /\.studio-frame:has\(\.ds-main\.bleed\) \{ height: 100dvh; min-height: 0; overflow: hidden; \}/);
  assert.match(css, /\.studio-frame \.ds-main\.bleed > \.ds-editor \{[^}]*grid-template-rows: minmax\(0, 1fr\);/);
  assert.match(css, /\.studio-frame \.ds-main \{ padding-bottom: var\(--ds-space-32\); \}/);
  assert.match(read('components/ds/editor.tsx'), /data-rail=\{tools\.length \? undefined : 'none'\}/);
});

test('accessibility of the shell (check:ui on PR 42): references point only at what exists, names include what is seen, truncated names say themselves in full', () => {
  const nav = read('components/shell/side-nav.tsx');
  // aria-controls names the panel only while it is on the page (an id that does not exist is an invalid value).
  assert.match(nav, /aria-controls=\{panel===p\.panel\?'studio-panel':undefined\}/);
  assert.doesNotMatch(read('components/editor/references-settings.tsx'), /aria-controls=/);
  // The account button: its visible name and company are its name; a label only when collapsed (just the avatar shows).
  assert.match(nav, /aria-label=\{compact\?`Account: \$\{account\.user\.name\|\|account\.user\.email\}`:undefined\}/);
  assert.match(nav, /<b className="ds-truncate" title=\{account\.user\.name\|\|account\.user\.email\}>/);
  assert.match(nav, /<span className="ds-truncate ds-muted" title=\{workName\(account\)\}>/);
  // The editor's own rules no longer assume main sits directly in the frame: phones size the editor to its content (no layout shift).
  const editor = read('app/editor.css');
  assert.doesNotMatch(editor, /\.workspace > \.ds-main\.bleed|:has\(> \.ds-main\.bleed\)/);
  assert.match(read('app/side-nav.css'), /\.studio-frame \.ds-main\.bleed > \.ds-editor \{ grid-template-rows: auto auto; min-height: 0; \}/);
  // Smart pick asks the photo library only for someone who can make work now.
  assert.match(read('app/key-visual/page.tsx'), /if\(!smartPick\|\|!car\|\|!mayChange\|\|handAdded/);
});
