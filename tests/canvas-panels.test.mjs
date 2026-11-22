// Inside the canvas editor (/editor) the shell's panels add to the design: the
// editor registers a sink (components/shell/shell-state.ts setCanvasSink) and a
// press in Brand, Elements, Text or Uploads hands it a CanvasAdd
// (lib/editor/doc.ts). What each press adds is decided by pure functions in
// lib/elements.ts; outside the editor every panel keeps its own behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tsxLoader } from './support/load-tsx.mjs';

const lib = tsxLoader()('lib/elements.ts');
const doc = tsxLoader()('lib/editor/doc.ts');
const { SHAPES, LINES, FRAMES, ICONS, TEXT_STYLES, ALL_PREVIEW, DESIGN_FONT, DESIGN_INK, elementsIn, canvasAddFor, logoCanvasAdd, uploadCanvasAdd, textCanvasAdd, imageSize, canvasAddSaid } = lib;

// Synthetic data only.
const LOGO = { id: 'logo-0001', name: 'Demo logo', type: 'image/png', size: 64, createdAt: 1, url: '/api/brand-kit/logos/logo-0001' };
const UPLOAD_ID = '0f8b6c1e-3a2d-4c5b-9e7f-1a2b3c4d5e6f';
const UPLOAD = { id: UPLOAD_ID, src: '/api/assets/' + UPLOAD_ID, thumb: '/api/assets/' + UPLOAD_ID + '?thumb=1', at: '2026-01-01T00:00:00.000Z' };
const KIT = { ready: true, colours: [{ hex: '#0a84ff', name: 'Demo blue' }, { hex: '#111111', name: '' }], headingFont: 'Montserrat', bodyFont: 'Lato', voice: '', logos: [LOGO, { ...LOGO, id: 'logo-0002', name: 'Demo mark', url: '/api/brand-kit/logos/logo-0002' }], updatedAt: 1 };
const PLAIN = { ...KIT, colours: [], headingFont: 'System', bodyFont: 'System' };

/** The add, made into a layer by the editor's own model and checked by the save route's own check. */
function onDesign(add) {
  const made = doc.addLayer(doc.createDoc({ id: 'visual-0001', src: '/api/assets/' + UPLOAD_ID, width: 1600, height: 900 }), add, 'layer-1');
  const checked = doc.checkDoc(JSON.parse(JSON.stringify(made)));
  assert.equal(checked.ok, true, `the editor keeps ${JSON.stringify(add)}: ${checked.reason}`);
  return Object.values(made.layers)[0];
}

test('a logo maps to an image add on its own same-origin address, at its own size when known', () => {
  assert.deepEqual(logoCanvasAdd(LOGO), { kind: 'image', src: '/api/brand-kit/logos/logo-0001', name: 'Demo logo', source: 'logo' });
  assert.deepEqual(logoCanvasAdd(LOGO, { naturalWidth: 400, naturalHeight: 100 }), { kind: 'image', src: LOGO.url, name: 'Demo logo', source: 'logo', naturalWidth: 400, naturalHeight: 100 });
  assert.equal(logoCanvasAdd({ ...LOGO, name: '  ' }).name, 'Logo');
  const layer = onDesign(logoCanvasAdd(LOGO, { naturalWidth: 400, naturalHeight: 100 }));
  assert.equal(layer.kind, 'image');
  assert.equal(layer.source, 'logo');
  assert.equal(layer.height / layer.width, 0.25, 'the logo keeps its shape');
  for (const url of ['', 'https://cdn.example.test/logo.png', 'http://cdn.example.test/logo.png', '//cdn.example.test/logo.png', 'javascript:alert(1)',
    '/api/brand-kit/logos/x', '/api/brand-kit/logos/../../../etc', '/api/brand-kit/logos/logo-0001?x=<b>', '/api/assets/' + UPLOAD_ID, 'api/brand-kit/logos/logo-0001']) {
    assert.equal(logoCanvasAdd({ ...LOGO, url }), null, url);
  }
  assert.equal(logoCanvasAdd({ ...LOGO, id: '' }), null);
  assert.equal(logoCanvasAdd(null), null);
});

test('an upload maps to an image add with its asset id; only the person’s own asset address', () => {
  assert.deepEqual(uploadCanvasAdd(UPLOAD), { kind: 'image', src: UPLOAD.src, assetId: UPLOAD_ID, name: 'Upload', source: 'upload' });
  assert.deepEqual(uploadCanvasAdd(UPLOAD, { naturalWidth: 320, naturalHeight: 180 }).naturalHeight, 180);
  assert.equal(onDesign(uploadCanvasAdd(UPLOAD)).asset, 'images/' + UPLOAD_ID, 'kept by its storage key (format v2), never its address');
  for (const src of ['https://cdn.example.test/x.png', '/api/assets/other-0000-id', UPLOAD.thumb, '/api/brand-kit/logos/' + UPLOAD_ID]) assert.equal(uploadCanvasAdd({ ...UPLOAD, src }), null, src);
  assert.equal(uploadCanvasAdd({ ...UPLOAD, id: '../x' }), null);
  assert.equal(uploadCanvasAdd(undefined), null);
});

test('a picture’s size comes from a loaded <img> only', () => {
  assert.deepEqual(imageSize({ naturalWidth: 640, naturalHeight: 480 }), { naturalWidth: 640, naturalHeight: 480 });
  for (const img of [null, undefined, {}, { naturalWidth: 0, naturalHeight: 0 }, { naturalWidth: 640, naturalHeight: Number.NaN }, { naturalWidth: '640', naturalHeight: 480 }]) assert.equal(imageSize(img), undefined);
});

test('text takes the brand’s fonts and first colour, with Inter and white to fall back on', () => {
  assert.deepEqual(textCanvasAdd('heading', KIT), { kind: 'text', style: 'heading', font: 'Montserrat', color: '#0A84FF' });
  assert.deepEqual(textCanvasAdd('subheading', KIT), { kind: 'text', style: 'subheading', font: 'Montserrat', color: '#0A84FF' });
  assert.deepEqual(textCanvasAdd('body', KIT), { kind: 'text', style: 'body', font: 'Lato', color: '#0A84FF' });
  assert.equal(DESIGN_FONT, 'Inter');
  assert.equal(DESIGN_INK, '#ffffff');
  // The system font, no kit yet, no colours, a colour that is not one, a font not on the list.
  assert.deepEqual(textCanvasAdd('heading', PLAIN), { kind: 'text', style: 'heading', font: 'Inter', color: '#ffffff' });
  assert.deepEqual(textCanvasAdd('body', null), { kind: 'text', style: 'body', font: 'Inter', color: '#ffffff' });
  assert.equal(textCanvasAdd('body', { ...KIT, colours: [{ hex: 'not a colour', name: 'Bad' }, { hex: '#abc', name: '' }] }).color, '#AABBCC');
  assert.equal(textCanvasAdd('heading', { ...KIT, headingFont: 'Unknown Display' }).font, 'Inter');
  for (const style of ['heading', 'subheading', 'body']) {
    const layer = onDesign(textCanvasAdd(style, KIT));
    assert.equal(layer.text, doc.TEXT_STYLES[style].sample);
    assert.equal(layer.color, '#0A84FF');
  }
});

test('shapes, lines and frames map to what the editor draws; icons and the rest map to null', () => {
  const shapes = Object.fromEntries(SHAPES.map((s) => [s.id, canvasAddFor(s)]));
  assert.deepEqual(shapes, {
    rectangle: { kind: 'shape', shape: 'rect' }, 'rounded-rectangle': { kind: 'shape', shape: 'rounded' }, circle: { kind: 'shape', shape: 'circle' },
    triangle: { kind: 'shape', shape: 'triangle' }, diamond: null, pentagon: null, hexagon: { kind: 'shape', shape: 'hexagon' }, star: { kind: 'shape', shape: 'star' },
    arrow: null, 'speech-bubble': null, heart: null, cross: null,
  });
  assert.deepEqual(new Set(Object.values(shapes).filter(Boolean).map((a) => a.shape)), new Set(doc.SHAPES), 'every shape the editor has is offered');
  const lines = Object.fromEntries(LINES.map((l) => [l.id, canvasAddFor(l)]));
  assert.deepEqual(lines, {
    line: { kind: 'line' }, 'thick-line': null, 'dashed-line': { kind: 'line', dash: true }, 'dotted-line': null,
    'arrow-line': { kind: 'line', arrow: 'end' }, 'double-arrow-line': { kind: 'line', arrow: 'both' }, 'curved-line': null, 'elbow-line': null, 'wavy-line': null,
  });
  const frames = Object.fromEntries(FRAMES.map((f) => [f.id, canvasAddFor(f)]));
  assert.deepEqual(frames['frame-square'], { kind: 'frame', ratio: 1, radius: 0 });
  assert.deepEqual(frames['frame-portrait'], { kind: 'frame', ratio: 0.8, radius: 0 });
  assert.deepEqual(frames['frame-landscape'], { kind: 'frame', ratio: 16 / 9, radius: 0 });
  assert.deepEqual(frames['frame-story'], { kind: 'frame', ratio: 9 / 16, radius: 0 });
  assert.ok(frames['frame-rounded'].radius > 0 && frames['frame-rounded'].radius < frames['frame-circle'].radius);
  // The circle's corners reach past half the frame (the editor stops them there), so it is round.
  const circle = onDesign(frames['frame-circle']);
  assert.ok(circle.radius >= Math.min(circle.width, circle.height) / 2);
  for (const icon of ICONS) assert.equal(canvasAddFor(icon), null, icon.id);
  // Text styles take the kit; the editor has no caption yet.
  assert.deepEqual(canvasAddFor(TEXT_STYLES.find((t) => t.id === 'subheading'), KIT), textCanvasAdd('subheading', KIT));
  assert.equal(canvasAddFor(TEXT_STYLES.find((t) => t.id === 'caption'), KIT), null);
  assert.deepEqual(canvasAddFor({ kind: 'logo', id: LOGO.id, name: LOGO.name, url: LOGO.url }), logoCanvasAdd(LOGO));
  // Everything that can be added is kept by the editor.
  for (const item of [...SHAPES, ...LINES, ...FRAMES, ...TEXT_STYLES]) {
    const add = canvasAddFor(item, KIT);
    if (add) onDesign(add);
  }
});

test('inside the editor the catalogue keeps only what can be added, and every icon', () => {
  const design = (category) => elementsIn(category, KIT.logos, { forDesign: true }).groups;
  assert.deepEqual(design('shapes')[0].items.map((i) => i.id), ['rectangle', 'rounded-rectangle', 'circle', 'triangle', 'hexagon', 'star']);
  assert.deepEqual(design('lines')[0].items.map((i) => i.id), ['line', 'dashed-line', 'arrow-line', 'double-arrow-line']);
  assert.equal(design('frames')[0].items.length, FRAMES.length);
  assert.deepEqual(design('icons')[0].items, [...ICONS]);
  assert.deepEqual(design('text')[0].items.map((i) => i.id), ['heading', 'subheading', 'body']);
  assert.equal(design('logos')[0].items.length, 2);
  const all = design('all');
  assert.deepEqual(all.map((g) => g.items.length), all.map((g) => Math.min(ALL_PREVIEW, g.total)));
  assert.deepEqual(all.map((g) => g.total), [2, 6, 4, FRAMES.length, ICONS.length, 3]);
  assert.deepEqual(all.find((g) => g.category === 'lines').items.map((i) => i.id), ['line', 'dashed-line', 'arrow-line']);
  // Outside the editor nothing changes.
  assert.deepEqual(elementsIn('shapes', KIT.logos), elementsIn('shapes', KIT.logos, { forDesign: false }));
  assert.equal(elementsIn('shapes').groups[0].items.length, SHAPES.length);
});

test('what the person is told after a press', () => {
  assert.deepEqual(canvasAddSaid(logoCanvasAdd(LOGO), true), { message: 'Logo added. Drag it into place.', kind: 'ok' });
  assert.deepEqual(canvasAddSaid(uploadCanvasAdd(UPLOAD), true), { message: 'Picture added. Drag it into place.', kind: 'ok' });
  assert.equal(canvasAddSaid({ kind: 'text', style: 'body' }, true).message, 'Text added. Drag it into place.');
  assert.equal(canvasAddSaid({ kind: 'shape', shape: 'star' }, true).message, 'Shape added. Drag it into place.');
  assert.equal(canvasAddSaid({ kind: 'frame', ratio: 1 }, true).message, 'Frame added. Drag it into place.');
  assert.deepEqual(canvasAddSaid({ kind: 'line' }, false), { message: 'Open a picture in the editor to add this.', kind: 'info' });
});

// ── The panels, with and without an editor ──────────────────────────────
// A server render reads the store's server snapshot (no editor), so the panels
// here read the live store instead; the editor's way in is still setCanvasSink.
function shellWith(sink) {
  const shell = tsxLoader()('components/shell/shell-state.ts');
  shell.setCanvasSink(sink);
  const live = { ...shell, useShell: () => shell.shellState() };
  return { shell, stubs: { '@/components/shell/shell-state': live, './shell-state': live } };
}
const link = { __esModule: true, default: ({ href, children, ...rest }) => React.createElement('a', { href, ...rest }, children) };
function load(rel, { sink = null, kit = KIT } = {}) {
  const { shell, stubs } = shellWith(sink);
  const mod = tsxLoader({
    ...stubs,
    'next/link': link,
    '@/components/brand/brand-kit': { useBrandKit: () => ({ kit, error: '', reload: async () => {} }) },
    '@/components/studio-account': { useAccount: () => ({ role: 'owner', viewingAs: false }) },
    '@/components/ds/toast': { useToast: () => ({ toast: () => 0 }) },
    // panels.tsx's other panels and helpers: not under test here.
    '@/components/references/references-panel': { ReferencesPanel: () => null },
    '@/components/brand/brand-panel': { BrandPanel: () => null },
    './elements-panel': { ElementsPanel: () => null },
    './text-panel': { TextPanel: () => null },
    '@/lib/reference-upload': { uploadReference: async () => ({}) },
  })(rel);
  return { mod, shell };
}
const html = (Component, props = {}) => renderToStaticMarkup(React.createElement(Component, props));

test('the editor’s way in: a registered sink gets the add; without one nothing is added', () => {
  const got = [];
  const { shell } = shellWith((add) => got.push(add));
  const add = textCanvasAdd('heading', KIT);
  assert.equal(shell.addToCanvas(add), true);
  assert.deepEqual(got, [add]);
  shell.setCanvasSink(null);
  assert.equal(shell.addToCanvas(add), false);
  assert.equal(got.length, 1);
});

test('Brand: inside the editor a logo is a button that adds it; outside, a reference toggle', () => {
  const inside = html(load('components/brand/brand-panel.tsx', { sink: () => {} }).mod.BrandPanel);
  assert.match(inside, /<button type="button" class="brand-panel-logo" aria-label="Add Demo logo to the design" title="Demo logo">/);
  assert.match(inside, /aria-label="Add Demo mark to the design"/);
  assert.doesNotMatch(inside, /as a reference|aria-pressed/);
  assert.match(inside, /aria-label="Copy Demo blue, #0A84FF"/, 'colours still copy');
  const outside = html(load('components/brand/brand-panel.tsx').mod.BrandPanel);
  assert.match(outside, /aria-pressed="false" aria-label="Use Demo logo as a reference"/);
  assert.doesNotMatch(outside, /to the design/);

  const { addLogo } = load('components/brand/brand-panel.tsx', { sink: () => {} }).mod;
  const sent = [];
  assert.deepEqual(addLogo(LOGO, { naturalWidth: 300, naturalHeight: 150 }, (a) => { sent.push(a); return true; }), { message: 'Logo added. Drag it into place.', kind: 'ok' });
  assert.deepEqual(sent, [logoCanvasAdd(LOGO, { naturalWidth: 300, naturalHeight: 150 })]);
  assert.deepEqual(addLogo(LOGO, { naturalWidth: 0, naturalHeight: 0 }, (a) => { sent.push(a); return true; }).kind, 'ok');
  assert.equal(sent[1].naturalWidth, undefined, 'not loaded yet: the editor picks the shape');
  assert.equal(addLogo({ ...LOGO, url: 'https://cdn.example.test/x.png' }, null, () => true).kind, 'bad');
  assert.equal(addLogo(LOGO, null, () => false).message, 'Open a picture in the editor to add this.');
});

test('Elements: inside the editor elements and icons are add buttons; outside, pictures only', () => {
  const { ElementsPanel } = load('components/shell/elements-panel.tsx', { sink: () => {} }).mod;
  const inside = html(ElementsPanel);
  assert.match(inside, /Click an element to add it to your design\./);
  assert.doesNotMatch(inside, /comes with the editor/);
  assert.match(inside, /<button type="button" class="elements-add" aria-label="Add Rectangle to the design" title="Rectangle">/);
  assert.match(inside, /aria-label="Add Demo logo to the design"/);
  assert.match(inside, /aria-label="Add Square frame, 1:1 to the design"/);
  assert.match(inside, /<button type="button" class="elements-text elements-text-add" aria-label="Add heading text in Montserrat to the design">/);
  assert.match(inside, /aria-label="Add body text in Lato to the design"/);
  // Each style previews in the brand font from the Studio's own files (the font catalogue), as the canvas draws it.
  assert.match(inside, /class="elements-text-sample" data-style="heading" style="font-family:&quot;nm-montserrat&quot;, &quot;nm-inter&quot;, var\(--ds-font-sans\)"/);
  assert.doesNotMatch(inside, /can’t be added/);
  assert.match(inside, /<button type="button" class="elements-add" aria-label="Add the car icon to the design" title="Car"><span class="elements-tile" data-kind="icon"><svg/, 'icons are add buttons, drawn by the icon set');
  const icons = html(ElementsPanel, { initialCategory: 'icons' });
  assert.match(icons, /<label class="ds-search elements-search">[\s\S]*placeholder="Search icons"/);
  assert.match(icons, /Suggested for cars\. Search to find any icon\./);
  assert.equal((icons.match(/aria-label="Add the [^"]+ icon to the design"/g) || []).length, ICONS.length);
  assert.equal((inside.match(/aria-pressed/g) || []).length, 7, 'the category bar stays');
  const shapes = html(ElementsPanel, { initialCategory: 'shapes' });
  assert.equal((shapes.match(/class="elements-add"/g) || []).length, 6);
  assert.doesNotMatch(shapes, /Diamond|Heart/);
  const text = html(ElementsPanel, { initialCategory: 'text' });
  assert.doesNotMatch(text, /Caption/);

  const outside = html(load('components/shell/elements-panel.tsx').mod.ElementsPanel);
  assert.match(outside, /Adding elements to a picture comes with the editor\./);
  assert.doesNotMatch(outside, /to the design|class="elements-add"/);
  assert.match(outside, /role="img" aria-label="Car"/, 'outside the editor, icons are pictures');
});

test('Text: Add a text box, then three brand styles in the brand’s fonts and the colours named; without an editor, one line', () => {
  const { TextPanel } = load('components/shell/text-panel.tsx', { sink: () => {} }).mod;
  const inside = html(TextPanel);
  const buttons = [...inside.matchAll(/<button type="button" class="text-panel-add" data-style="(\w+)">([\s\S]*?)<\/button>/g)];
  assert.deepEqual(buttons.map((b) => b[1]), ['heading', 'subheading', 'body']);
  assert.match(buttons[0][2], /^<span class="text-panel-sample" style="font-family:&quot;nm-montserrat&quot;, &quot;nm-inter&quot;, var\(--ds-font-sans\)">Add a heading<\/span>/);
  assert.match(buttons[0][2], /<span class="ds-sr-only">in <\/span>Montserrat/);
  assert.match(buttons[1][2], />Add a subheading</);
  assert.match(buttons[2][2], /^<span class="text-panel-sample" style="font-family:&quot;nm-lato&quot;, &quot;nm-inter&quot;, var\(--ds-font-sans\)">Add a little body text<\/span>/);
  // "Add a text box" first, then the brand's three styles under their heading.
  assert.match(inside, /^<div class="text-panel"><button type="button" class="ds-btn text-panel-box" data-text-box="true">[\s\S]*Add a text box<\/button><section class="text-panel-styles"[^>]*><h3 class="ds-label-caps" id="[^"]+">Brand text styles<\/h3>/);
  assert.match(inside, /<h3 class="ds-label-caps" id="[^"]+">Brand colours<\/h3>/);
  assert.match(inside, /style="background:#0A84FF"/);
  assert.match(inside, /<b class="ds-truncate">Demo blue<\/b><span class="text-panel-hex">#0A84FF<\/span>/);
  assert.match(inside, /<b class="ds-truncate">#111111<\/b>/);
  assert.doesNotMatch(inside, /<button[^>]*text-panel-swatch/, 'the colours are for reference only');

  const plain = html(load('components/shell/text-panel.tsx', { sink: () => {}, kit: PLAIN }).mod.TextPanel);
  assert.doesNotMatch(plain, /font-family|text-panel-font|Brand colours/, 'the system font and no colours: the Studio’s own look');
  assert.equal((plain.match(/class="text-panel-add"/g) || []).length, 3);

  const outside = html(load('components/shell/text-panel.tsx').mod.TextPanel);
  assert.equal(outside, '<p class="ds-help">Open a picture in the editor to add text.</p>');
});

test('Uploads: inside the editor an upload adds itself; outside, it toggles a reference', () => {
  const { UploadGrid } = load('components/shell/panels.tsx').mod;
  const uploads = [UPLOAD, { ...UPLOAD, id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', src: '/api/assets/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', thumb: '/api/assets/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee?thumb=1' }];
  const inUse = (u) => u.id === UPLOAD_ID;
  const inside = html(UploadGrid, { uploads, inUse, design: true, onPress: () => {} });
  assert.equal((inside.match(/aria-label="Add this upload to the design"/g) || []).length, 2);
  assert.doesNotMatch(inside, /aria-pressed|studio-pick-tick|reference/);
  const outside = html(UploadGrid, { uploads, inUse, design: false, onPress: () => {} });
  assert.match(outside, /aria-pressed="true" aria-label="Remove this upload from your references"/);
  assert.match(outside, /aria-pressed="false" aria-label="Use this upload as a reference"/);
  assert.equal((outside.match(/studio-pick-tick/g) || []).length, 1);
  assert.doesNotMatch(outside, /to the design/);
});
