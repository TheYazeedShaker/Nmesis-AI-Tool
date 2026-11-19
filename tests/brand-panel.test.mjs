// Brand becomes a panel (components/brand/brand-panel.tsx) beside a tool, and
// the brand-kit editor moves into Settings → Brand kit (/company/brand); /brand
// only redirects there. The panel turns a logo into a reference-tray item the
// tray keeps, and says what happened; colours and fonts are pressed to copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tsxLoader } from './support/load-tsx.mjs';

const require = createRequire(import.meta.url);
const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
const link = { __esModule: true, default: ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children) };
const LOGO = { id: 'logo-0001', name: 'Demo logo', type: 'image/png', size: 64, createdAt: 1, url: '/api/brand-kit/logos/logo-0001' };
const KIT = { ready: true, colours: [{ hex: '#0A84FF', name: 'Demo blue' }, { hex: '#111111', name: '' }], headingFont: 'Outfit', bodyFont: 'Inter', voice: '', logos: [LOGO, { ...LOGO, id: 'logo-0002', name: 'Demo mark', url: '/api/brand-kit/logos/logo-0002' }], updatedAt: 1 };
const EMPTY = { ready: true, colours: [], headingFont: 'System', bodyFont: 'System', voice: '', logos: [], updatedAt: null };

test('/brand redirects to Settings → Brand kit; the proxy treats both like any signed-in page', () => {
  const { default: Brand } = tsxLoader()('app/brand/page.tsx');
  const { isRedirectError } = require('next/dist/client/components/redirect-error');
  const { getURLFromRedirectError } = require('next/dist/client/components/redirect');
  let thrown;
  try { Brand(); } catch (e) { thrown = e; }
  assert.ok(thrown && isRedirectError(thrown), 'redirect() from next/navigation');
  assert.equal(getURLFromRedirectError(thrown), '/company/brand');
  assert.doesNotMatch(read('app/brand/page.tsx'), /BrandKitScreen|WorkspaceFrame/, 'the old page renders nothing');
  // Nothing in the proxy names either path: signed-out visitors go to sign in, as before.
  assert.doesNotMatch(read('proxy.ts'), /\/(brand|company)\b/);
});

test('Settings → Brand kit is the same editor, in the Settings frame, with the Settings links', () => {
  const page = read('app/company/brand/page.tsx');
  assert.match(page, /<WorkspaceFrame current="company"/);
  assert.match(page, /<SettingsNav current="brand"\/><BrandKitScreen\/>/);
  assert.match(read('components/company/company-settings.tsx'), /<div className="settings-page">\s*<SettingsNav current="company"\/>/);
  assert.match(read('components/brand/brand-kit.tsx'), /<PageHeader eyebrow="Settings" title="Brand kit"/);

  const { SettingsNav } = tsxLoader({ 'next/link': link })('components/company/settings-nav.tsx');
  const brand = renderToStaticMarkup(React.createElement(SettingsNav, { current: 'brand' }));
  assert.match(brand, /<nav class="ds-nav" aria-label="Settings">/);
  assert.match(brand, /<a href="\/company" class="ds-nav-link">Company<\/a>/);
  assert.match(brand, /<a href="\/company\/brand" class="ds-nav-link" aria-current="page">Brand kit<\/a>/);
  const company = renderToStaticMarkup(React.createElement(SettingsNav, { current: 'company' }));
  assert.match(company, /<a href="\/company" class="ds-nav-link" aria-current="page">Company<\/a>/);
  assert.equal(company.match(/aria-current/g).length, 1);
});

function panelLoader({ kit = null, error = '', account = null, tray = null } = {}) {
  const state = { kit, error, reloads: 0 };
  const stubs = {
    'next/link': link,
    '@/components/brand/brand-kit': { useBrandKit: () => ({ kit: state.kit, error: state.error, reload: async () => { state.reloads++; } }) },
    // No canvas editor open: the panel's own behaviour (tests/canvas-panels.test.mjs covers the editor).
    '@/components/shell/shell-state': { addAsReference: () => 'added', useShell: () => ({ canvas: null }), addToCanvas: () => false },
    '@/components/studio-account': { useAccount: () => account },
    '@/components/ds/toast': { useToast: () => ({ toast: () => 0 }) },
  };
  if (tray) stubs['@/lib/reference-tray'] = { useReferenceTray: () => tray, removeReference: () => {} };
  return tsxLoader(stubs)('components/brand/brand-panel.tsx');
}
const draw = (mod) => renderToStaticMarkup(React.createElement(mod.BrandPanel));

test('a logo becomes a tray item the tray keeps; an address it would not keep is refused', () => {
  const { logoReference } = panelLoader();
  const { logoUrl } = tsxLoader()('lib/brand-kit.ts');
  assert.equal(LOGO.url, logoUrl(LOGO.id), 'the address the API gives a logo');
  assert.deepEqual(logoReference(LOGO), { key: 'brand:logo-0001', src: '/api/brand-kit/logos/logo-0001', thumb: '/api/brand-kit/logos/logo-0001', name: 'Demo logo', provider: 'brand' });
  assert.equal(logoReference({ ...LOGO, name: '' }).name, 'Brand logo');
  assert.equal(logoReference({ ...LOGO, url: 'https://cdn.example.test/logo.png' }).src, 'https://cdn.example.test/logo.png');
  for (const url of ['', 'http://cdn.example.test/logo.png', 'javascript:alert(1)', '//cdn.example.test/logo.png', 'api/brand-kit/logos/x']) assert.equal(logoReference({ ...LOGO, url }), null, url);
  assert.equal(logoReference({ ...LOGO, id: '' }), null);

  // Through the real tray: what it writes and reads back after a reload (its own check, lib/reference-tray.ts).
  const saved = new Map();
  const had = { window: globalThis.window, sessionStorage: globalThis.sessionStorage };
  globalThis.window = {};
  globalThis.sessionStorage = { getItem: (k) => saved.get(k) ?? null, setItem: (k, v) => { saved.set(k, String(v)); } };
  try {
    const tray = tsxLoader()('lib/reference-tray.ts');
    assert.equal(tray.addReference(logoReference(LOGO)), true);
    assert.equal(tray.addReference({ ...logoReference(LOGO), key: 'brand:bad', src: 'http://cdn.example.test/x.png' }), true);
    const reloaded = tsxLoader()('lib/reference-tray.ts');
    assert.deepEqual(reloaded.trayItems().map((i) => i.key), ['brand:logo-0001'], 'the item survives the tray’s own check; a bad address does not');
  } finally {
    if (had.window === undefined) delete globalThis.window; else globalThis.window = had.window;
    if (had.sessionStorage === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = had.sessionStorage;
  }
});

test('pressing a logo adds it, swaps it in or says the tray is full; pressing it again removes it', () => {
  const { pressLogo, LOGO_SAID } = panelLoader();
  assert.deepEqual(LOGO_SAID, { added: 'Logo added to your references.', replaced: 'Logo is now your reference.', full: 'Your references are full. Remove one first.' });
  for (const answer of ['added', 'replaced', 'full']) {
    const added = [], removed = [];
    const said = pressLogo(LOGO, [], { add: (item) => { added.push(item.key); return answer; }, remove: (k) => removed.push(k) });
    assert.equal(said.message, LOGO_SAID[answer]);
    assert.equal(said.kind, answer === 'full' ? 'info' : 'ok');
    assert.deepEqual([added, removed], [['brand:logo-0001'], []]);
  }
  const added = [], removed = [];
  const act = { add: (item) => { added.push(item.key); return 'added'; }, remove: (k) => removed.push(k) };
  assert.deepEqual(pressLogo(LOGO, [{ key: 'brand:logo-0001' }], act), { message: 'Logo removed from your references.', kind: 'info' });
  assert.deepEqual(pressLogo({ ...LOGO, url: 'http://cdn.example.test/x.png' }, [], act).kind, 'bad');
  assert.deepEqual([added, removed], [[], ['brand:logo-0001']]);
});

test('the panel: skeletons while loading, an error with Try again, a calm empty kit', () => {
  const loading = draw(panelLoader());
  assert.match(loading, /role="status" aria-busy="true"><span class="ds-sr-only">Loading the brand kit<\/span>/);
  assert.match(loading, /ds-skel-tile/);
  const failed = draw(panelLoader({ error: 'The brand kit didn’t load. Try again.' }));
  assert.match(failed, /class="ds-state error" role="alert"/);
  assert.match(failed, /The brand kit didn’t load/);
  assert.match(failed, />Try again<\/button>/);
  const empty = draw(panelLoader({ kit: EMPTY }));
  assert.match(empty, /class="ds-state"/);
  assert.match(empty, /No brand kit yet/);
  assert.doesNotMatch(empty, /role="alert"/);
  assert.match(draw(panelLoader({ kit: { ...EMPTY, ready: false } })), /isn’t available yet/);
});

test('the panel: logos to use (a tick when in use), colours and fonts to copy, named in words', () => {
  const html = draw(panelLoader({ kit: KIT }));
  assert.match(html, /<button type="button" class="brand-panel-logo" aria-pressed="false" aria-label="Use Demo logo as a reference" title="Demo logo">/);
  assert.match(html, /<img src="\/api\/brand-kit\/logos\/logo-0001" alt=""/);
  assert.doesNotMatch(html, /brand-panel-tick/);
  // Colours: the swatch's own colour is data; its name and hex are words too.
  assert.match(html, /aria-label="Copy Demo blue, #0A84FF"/);
  assert.match(html, /style="background:#0A84FF"/);
  assert.match(html, /<b class="ds-truncate">Demo blue<\/b><span class="brand-hex">#0A84FF<\/span>/);
  assert.match(html, /aria-label="Copy #111111"/);
  assert.match(html, /<span class="brand-panel-font-role">Heading<\/span> · Outfit/);
  assert.match(html, /<span class="brand-panel-font-role">Body<\/span> · Inter/);

  const inUse = draw(panelLoader({ kit: KIT, tray: [{ key: 'brand:logo-0002', src: '/api/brand-kit/logos/logo-0002', name: 'Demo mark', provider: 'brand' }] }));
  assert.match(inUse, /aria-pressed="false" aria-label="Use Demo logo as a reference"/);
  assert.match(inUse, /aria-pressed="true" aria-label="Use Demo mark as a reference"/);
  assert.equal(inUse.match(/brand-panel-tick/g).length, 1);
});

test('the panel: owners and creators get Edit brand kit; everyone else is told who can', () => {
  const as = (role, viewingAs = false) => draw(panelLoader({ kit: KIT, account: { role, viewingAs } }));
  for (const role of ['owner', 'creator']) {
    const html = as(role);
    assert.match(html, /<a href="\/company\/brand" class="ds-btn sm">.*Edit brand kit<\/a>/);
    assert.doesNotMatch(html, /Owners and creators can change/);
  }
  for (const html of [as('viewer'), as('owner', true)]) {
    assert.doesNotMatch(html, /Edit brand kit/);
    assert.match(html, /Owners and creators can change the brand kit\./);
  }
  // Before the account arrives: neither.
  const unknown = draw(panelLoader({ kit: KIT }));
  assert.doesNotMatch(unknown, /Edit brand kit|Owners and creators/);
});
