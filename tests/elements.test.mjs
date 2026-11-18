// The Elements panel (components/shell/elements-panel.tsx): its categories,
// the pure filter behind it (lib/elements.ts), and what it draws. In this
// version the panel only shows and filters: no element is a button yet.
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tsxLoader } from './support/load-tsx.mjs';

const lib = tsxLoader()('lib/elements.ts');
const { ELEMENT_CATEGORIES, ALL_PREVIEW, SHAPES, LINES, FRAMES, ICONS, TEXT_STYLES, elementsIn, logoElements, textStyleFont, isElementCategory } = lib;

// Synthetic logos, as GET /api/brand-kit gives them (a same-origin signed link each).
const LOGOS = [
  { id: 'l1', name: 'Demo mark', url: '/api/brand-kit/logos/l1', type: 'image/png', size: 10, createdAt: 1 },
  { id: 'l2', name: 'Demo wordmark', url: '/api/brand-kit/logos/l2', type: 'image/png', size: 10, createdAt: 2 },
  { id: 'l3', name: 'Demo badge', url: '/api/brand-kit/logos/l3', type: 'image/png', size: 10, createdAt: 3 },
  { id: 'l4', name: 'Demo light', url: '/api/brand-kit/logos/l4', type: 'image/png', size: 10, createdAt: 4 },
];
const GROUPS = ['logos', 'shapes', 'lines', 'frames', 'icons', 'text'];

test('the category bar: All, Logos, Shapes, Lines, Frames, Icons, Text styles, in that order', () => {
  assert.deepEqual(ELEMENT_CATEGORIES.map((c) => c.label), ['All', 'Logos', 'Shapes', 'Lines', 'Frames', 'Icons', 'Text styles']);
  assert.deepEqual(ELEMENT_CATEGORIES.map((c) => c.id), ['all', ...GROUPS]);
  for (const c of ELEMENT_CATEGORIES) assert.equal(isElementCategory(c.id), true, c.id);
  for (const v of ['', 'ALL', 'toString', '__proto__', null, undefined, 3]) assert.equal(isElementCategory(v), false, String(v));
});

test('All groups every category, in the bar order, a few elements each', () => {
  const all = elementsIn('all', LOGOS);
  assert.equal(all.category, 'all');
  assert.deepEqual(all.groups.map((g) => g.category), GROUPS);
  assert.deepEqual(all.groups.map((g) => g.label), ['Logos', 'Shapes', 'Lines', 'Frames', 'Icons', 'Text styles']);
  const full = { logos: LOGOS.length, shapes: SHAPES.length, lines: LINES.length, frames: FRAMES.length, icons: ICONS.length, text: TEXT_STYLES.length };
  for (const g of all.groups) {
    assert.equal(g.total, full[g.category], g.category);
    assert.equal(g.items.length, Math.min(ALL_PREVIEW, full[g.category]), g.category);
    assert.ok(g.items.length > 0, `${g.category} shows something`);
  }
  // A group still shows in All while the kit has no logos (the panel draws its empty line there).
  const none = elementsIn('all', []);
  assert.deepEqual(none.groups.map((g) => g.category), GROUPS);
  assert.deepEqual(none.groups[0], { category: 'logos', label: 'Logos', items: [], total: 0 });
});

test('a category gives one group with every element of that kind', () => {
  for (const [id, list, kind] of [['shapes', SHAPES, 'shape'], ['lines', LINES, 'line'], ['frames', FRAMES, 'frame'], ['icons', ICONS, 'icon'], ['text', TEXT_STYLES, 'text']]) {
    const view = elementsIn(id, LOGOS);
    assert.equal(view.category, id);
    assert.equal(view.groups.length, 1);
    assert.equal(view.groups[0].category, id);
    assert.deepEqual(view.groups[0].items, [...list], id);
    assert.ok(view.groups[0].items.every((i) => i.kind === kind), id);
    assert.equal(new Set(list.map((i) => i.id)).size, list.length, `${id}: ids are unique`);
    assert.ok(list.every((i) => typeof i.name === 'string' && i.name.length > 0), `${id}: every element has a name`);
  }
  assert.deepEqual(TEXT_STYLES.map((t) => t.name), ['Heading', 'Subheading', 'Body', 'Caption']);
  assert.deepEqual(FRAMES.map((f) => f.label), ['1:1', '4:5', '16:9', '9:16', 'Circle', 'Rounded']);
  for (const want of ['circle', 'triangle', 'star', 'hexagon', 'arrow', 'speech-bubble']) assert.ok(SHAPES.some((s) => s.id === want), want);
  for (const want of ['line', 'dashed-line', 'dotted-line', 'arrow-line', 'double-arrow-line', 'curved-line']) assert.ok(LINES.some((s) => s.id === want), want);
});

test('Logos come from the brand kit, and only same-origin links', () => {
  const view = elementsIn('logos', LOGOS);
  assert.equal(view.category, 'logos');
  assert.deepEqual(view.groups[0].items, LOGOS.map(({ id, name, url }) => ({ kind: 'logo', id, name, url })));
  assert.equal(view.groups[0].total, LOGOS.length);
  // While the kit loads (null), or with none, there is nothing to draw.
  assert.deepEqual(elementsIn('logos', null).groups[0].items, []);
  assert.deepEqual(elementsIn('logos').groups[0].items, []);
  assert.deepEqual(elementsIn('logos', []).groups[0].items, []);
  // A logo without an id, or whose link leaves the site, is left out; a blank name reads "Logo".
  assert.deepEqual(logoElements([
    { id: '', name: 'No id', url: '/api/brand-kit/logos/x' },
    { id: 'a', name: 'Elsewhere', url: 'https://cdn.example.test/logo.png' },
    { id: 'b', name: 'Protocol-relative', url: '//cdn.example.test/logo.png' },
    { id: 'c', name: 'Script', url: 'javascript:alert(1)' },
    { id: 'd', name: '  ', url: '/api/brand-kit/logos/d' },
    null,
  ]), [{ kind: 'logo', id: 'd', name: 'Logo', url: '/api/brand-kit/logos/d' }]);
  // Shapes and the rest never depend on the kit.
  assert.deepEqual(elementsIn('shapes', null), elementsIn('shapes', LOGOS));
});

test('an unknown category falls back to All', () => {
  const all = elementsIn('all', LOGOS);
  for (const v of ['nope', '', 'All', 'toString', '__proto__', undefined, null, 7, {}]) assert.deepEqual(elementsIn(v, LOGOS), all, String(v));
});

test('text styles name the kit’s fonts, never the system font, and nothing without a kit', () => {
  const kit = { headingFont: 'Montserrat', bodyFont: 'Lato' };
  assert.equal(textStyleFont({ font: 'heading' }, kit), 'Montserrat');
  assert.equal(textStyleFont({ font: 'body' }, kit), 'Lato');
  assert.equal(textStyleFont({ font: 'heading' }, { headingFont: 'System', bodyFont: 'Lato' }), null);
  assert.equal(textStyleFont({ font: 'body' }, null), null);
});

// ── What the panel draws (server render: no effects, so the kit is whatever the stub says) ──
function panel({ kit = null, error = '', role = 'owner', initialCategory } = {}) {
  const load = tsxLoader({
    'next/link': { __esModule: true, default: ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children) },
    '@/components/brand/brand-kit': { useBrandKit: () => ({ kit, error, reload: async () => {} }) },
    '@/components/studio-account': { useAccount: () => (role ? { role, viewingAs: false } : null) },
  });
  const { ElementsPanel } = load('components/shell/elements-panel.tsx');
  return renderToStaticMarkup(React.createElement(ElementsPanel, initialCategory ? { initialCategory } : {}));
}
const KIT = { ready: true, colours: [], headingFont: 'Montserrat', bodyFont: 'System', voice: '', logos: LOGOS, updatedAt: 1 };

test('the panel: a bar of toggles, labelled groups with See all, and elements that are not buttons', () => {
  const html = panel({ kit: KIT });
  const chips = [...html.matchAll(/<button type="button" class="ds-chip" aria-pressed="(true|false)">([^<]+)<\/button>/g)];
  assert.deepEqual(chips.map((m) => m[2]), ['All', 'Logos', 'Shapes', 'Lines', 'Frames', 'Icons', 'Text styles']);
  assert.deepEqual(chips.map((m) => m[1]), ['true', 'false', 'false', 'false', 'false', 'false', 'false']);
  assert.match(html, /role="group" aria-label="Element categories"/);
  assert.match(html, /Adding elements to a picture comes with the editor\./);
  assert.equal((html.match(/>See all</g) || []).length, 6);
  for (const label of ['Logos', 'Shapes', 'Lines', 'Frames', 'Icons', 'Text styles']) assert.match(html, new RegExp(`<h3 [^>]*>${label}</h3>`));
  // Every list item is a picture with a name, never a control.
  const items = [...html.matchAll(/<li\b[\s\S]*?<\/li>/g)].map((m) => m[0]);
  assert.ok(items.length >= 6 * 3, 'a few elements per group');
  for (const li of items) assert.doesNotMatch(li, /<(button|a)\b/);
  assert.match(html, /role="img" aria-label="Rectangle"/);
  assert.match(html, /<img src="\/api\/brand-kit\/logos\/l1" alt="Demo mark"/);
  assert.match(html, /Montserrat/, 'the heading font is named under the preview');
});

test('the panel: logos loading, missing, and the link for people who may edit the kit', () => {
  const loading = panel({ kit: null, initialCategory: 'logos' });
  assert.match(loading, /role="status" aria-busy="true"/);
  assert.match(loading, /ds-skel-tile/);
  const empty = { ...KIT, logos: [] };
  const owner = panel({ kit: empty, initialCategory: 'logos' });
  assert.match(owner, /No logos in your brand kit yet\./);
  assert.match(owner, /<a [^>]*href="\/company\/brand"[^>]*>Add logos in Settings → Brand kit<\/a>/);
  const viewer = panel({ kit: empty, role: 'viewer', initialCategory: 'logos' });
  assert.match(viewer, /No logos in your brand kit yet\./);
  assert.doesNotMatch(viewer, /company\/brand/);
  const failed = panel({ kit: null, error: 'The brand kit didn’t load. Try again.', initialCategory: 'logos' });
  assert.match(failed, /The brand kit didn’t load\./);
  assert.match(failed, />Try again</);
  // One category on its own: no groups, no See all; the chosen chip is pressed.
  const shapes = panel({ kit: KIT, initialCategory: 'shapes' });
  assert.doesNotMatch(shapes, /See all/);
  assert.match(shapes, /aria-pressed="true">Shapes</);
  assert.equal((shapes.match(/role="img"/g) || []).length, SHAPES.length);
});
