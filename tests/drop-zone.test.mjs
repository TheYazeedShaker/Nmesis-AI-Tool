// The one way to add a picture (components/ds/drop-zone.tsx), the Pinterest
// link (components/editor/pinterest-link.tsx), and the plain capture words:
// markup, labels, errors, the plan gate on the link, and where they are used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = new URL('../', import.meta.url);
const rootPath = path.resolve(new URL('.', ROOT).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const nodeRequire = createRequire(import.meta.url);
const h = React.createElement;
const html = (el) => renderToStaticMarkup(el);

// Loads a .tsx file; `stubs` replaces modules by their import path.
function loader(stubs = {}) {
  const cache = new Map();
  return function load(file) {
    const abs = path.resolve(file);
    if (cache.has(abs)) return cache.get(abs).exports;
    const mod = { exports: {} };
    cache.set(abs, mod);
    const code = ts.transpileModule(readFileSync(abs, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const req = (spec) => {
      if (spec in stubs) return stubs[spec];
      const target = spec.startsWith('@/') ? path.join(rootPath, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(abs), spec) : null;
      if (!target) return nodeRequire(spec);
      if (target.endsWith('.json') && existsSync(target)) return JSON.parse(readFileSync(target, 'utf8'));
      for (const ext of ['.tsx', '.ts', '/index.ts', '']) if (existsSync(target + ext) && /\.(tsx?|mjs|js)$/.test(target + ext)) return load(target + ext);
      throw new Error(`Cannot resolve ${spec} from ${abs}`);
    };
    new Function('require', 'module', 'exports', code)(req, mod, mod.exports);
    return mod.exports;
  };
}
const { DropZone, IMAGE_ACCEPT } = loader()(path.join(rootPath, 'components/ds/drop-zone.tsx'));

test('empty: one area, its sentence, one Choose file button, the paste hint, PNG/JPEG/WebP only', () => {
  const m = html(h(DropZone, { name: 'car picture', label: 'Drop, paste or upload a picture of the car', hint: 'PNG, JPEG or WebP · up to 40 MB', onFile: () => {} }));
  assert.equal(IMAGE_ACCEPT, 'image/png,image/jpeg,image/webp');
  assert.match(m, /<div class="ds-drop-zone" role="group" aria-labelledby="([^"]+)-label" aria-describedby="\1-hint" tabindex="0">/, 'reachable by keyboard and named by its sentence');
  assert.match(m, /<p class="ds-drop-label" id="[^"]+-label">Drop, paste or upload a picture of the car<\/p>/);
  assert.equal((m.match(/<button /g) || []).length, 1, 'one button');
  assert.match(m, /<button type="button" class="ds-btn sm">.*Choose file<span class="ds-sr-only">: car picture<\/span><\/button>/);
  assert.match(m, /or press Ctrl\+V \/ ⌘V/);
  assert.match(m, /<input class="ds-drop-input" type="file" accept="image\/png,image\/jpeg,image\/webp" tabindex="-1" aria-hidden="true"\/>/);
  assert.doesNotMatch(m, /role="alert"/);
});

test('added: a thumbnail with Replace and Remove, both real buttons with the thing in their name', () => {
  const m = html(h(DropZone, { name: 'reference picture', label: 'Drop…', value: '/api/assets/abc', valueName: 'Desert road', valueAlt: 'Your inspiration reference', onFile: () => {}, onRemove: () => {} }));
  assert.match(m, /data-filled="true"/);
  assert.match(m, /aria-label="Reference picture added"/);
  assert.match(m, /<img crossorigin="anonymous" src="\/api\/assets\/abc" alt="Your inspiration reference"\/>/);
  assert.match(m, /Replace<span class="ds-sr-only"> reference picture<\/span><\/button>/);
  assert.match(m, /<button type="button" class="ds-btn quiet sm">Remove<span class="ds-sr-only"> reference picture<\/span><\/button>/);
  assert.doesNotMatch(m, /Choose file/);
  const noRemove = html(h(DropZone, { name: 'starting frame', label: 'Drop…', value: 'blob:x', onFile: () => {} }));
  assert.doesNotMatch(noRemove, /Remove/, 'Remove only where the caller can remove');
  assert.match(noRemove, /<img src="blob:x" alt=""\/>/, 'a local preview needs no CORS');
});

test('a problem is said under the zone (role="alert"), and the zone is marked', () => {
  const m = html(h(DropZone, { name: 'car picture', label: 'Drop…', error: 'Upload took too long.', onFile: () => {} }));
  assert.match(m, /data-invalid="true"/);
  assert.match(m, /<\/div><p class="ds-error" id="([^"]+)-error" role="alert"><svg[^>]*aria-hidden="true"[^>]*>.*<\/svg>Upload took too long\.<\/p>/);
  assert.match(m, /aria-describedby="[^"]*-error"/);
});

test('disabled and busy: out of the tab order when disabled; busy keeps the words and says what is happening', () => {
  const off = html(h(DropZone, { name: 'car picture', label: 'Drop…', disabled: true, onFile: () => {} }));
  assert.match(off, /tabindex="-1"/);
  assert.match(off, /data-disabled="true"/);
  assert.match(off, /<button type="button" class="ds-btn sm" disabled="">/);
  const busy = html(h(DropZone, { name: 'reference picture', label: 'Drop…', busy: 'Preparing image…', onFile: () => {} }));
  assert.match(busy, /aria-busy="true"/);
  assert.match(busy, /<span class="ds-drop-hint" role="status">Preparing image…<\/span>/);
  assert.match(busy, /Choose file/);
});

test('video: an MP4 chosen or dropped, no paste hint', () => {
  const m = html(h(DropZone, { kind: 'video', name: 'reference ad', label: 'Drop or upload your reference ad', onFile: () => {} }));
  assert.match(m, /accept="video\/mp4,\.mp4"/);
  assert.doesNotMatch(m, /Ctrl\+V/);
});

test('the drop zone is a design-system component: every class styled in app/inputs.css, tokens only, light and dark', () => {
  const src = read('components/ds/drop-zone.tsx'), css = read('app/inputs.css');
  const classes = new Set([...src.matchAll(/className="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/)).filter((c) => c.startsWith('ds-drop')));
  assert.ok(classes.size >= 8);
  for (const c of classes) assert.match(css, new RegExp(`\\.${c}\\b`), c);
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]+\{/g, '');
  assert.doesNotMatch(rules, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, 'no colour written out');
  assert.doesNotMatch(rules, /(?:font-size|padding|margin|gap|border-radius)[^;]*\d+px/, 'no size off the scale');
  assert.match(css, /\.ds-drop-zone\[data-drag="true"\]/, 'a drag-over state');
  assert.match(css, /\.ds-drop-zone:hover/, 'a hover state');
  assert.match(css, /\.ds-drop-zone:focus-visible \{ outline: var\(--ds-focus-width\) solid var\(--ds-ring\)/, 'focus visible');
  assert.match(read('app/layout.tsx'), /import "\.\/inputs\.css";/);
  // Paste keeps the clipboard handling and validation of lib/clipboard-image.ts.
  assert.match(src, /clipboardImage\(e\.clipboardData\)/);
  assert.match(src, /if \(pasted\) validateClipboardImage\(file\);/);
  assert.match(src, /e\.preventDefault\(\); e\.stopPropagation\(\);/);
});

// ── The Pinterest link (Car lineup's inspiration, in the shared reference list) ──
function pinLink(account, props = {}) {
  const studioAccount = {
    useAccount: () => account,
    hasFeature: (a, key) => !a || a.features[key] !== false,
    planEnded: (a) => !!a && !a.workspace.open && !a.workspace.noPlan,
    PLAN_ENDED_CHIP: 'Plan ended',
    AskNmesis: () => h('button', { type: 'button', className: 'text-button ask-nmesis' }, 'Ask Nmesis'),
  };
  const { PinterestLink } = loader({ '@/components/studio-account': studioAccount })(path.join(rootPath, 'components/editor/pinterest-link.tsx'));
  return html(h(PinterestLink, { value: '', onChange: () => {}, onAdd: () => {}, help: 'What’s the mood?', ...props }));
}

test('the Pinterest link: the field with its own button, the mood as its help, its error in its place', () => {
  const m = pinLink({ features: { 'studio.pinterest': true }, upsell: {}, workspace: { open: true } });
  assert.match(m, /^<div class="ds-field"><label class="ds-label" for="([^"]+)">Paste a Pinterest link<\/label><div class="editor-pin-link"><input class="ds-input" id="\1" type="url" inputMode="url" placeholder="[^"]+" aria-describedby="\1-help" value=""\/>/);
  assert.match(m, /Add link<\/button>/);
  assert.match(m, /<p class="ds-help" id="[^"]+-help">What’s the mood\?<\/p>/);
  const failed = pinLink({ features: { 'studio.pinterest': true }, upsell: {}, workspace: { open: true } }, { value: 'https://www.pinterest.com/pin/1', error: 'That pin could not be read.' });
  assert.match(failed, /aria-describedby="([^"]+)-error" aria-invalid="true"[\s\S]*<p class="ds-error" id="\1-error" role="alert">That pin could not be read\.<\/p>/);
  assert.doesNotMatch(failed, /What’s the mood/);
});

test('the Pinterest link: without the plan feature the link and its button are disabled and one line says which plan has it (plan gate)', () => {
  const m = pinLink({ features: { 'studio.pinterest': false }, upsell: { 'studio.pinterest': 'Growth' }, workspace: { open: true } });
  assert.match(m, /<input class="ds-input" id="[^"]+" type="url"[^>]* disabled=""/);
  assert.match(m, /<button type="button" class="ds-btn sm" disabled="">Add link<\/button>/);
  assert.match(m, /<p class="editor-pin-upsell" id="[^"]+-help"><svg[^>]*>.*<\/svg>Available on Growth<span aria-hidden="true">·<\/span><button type="button" class="text-button ask-nmesis">Ask Nmesis<\/button><\/p>/);
  assert.doesNotMatch(m, /plan-chip|What’s the mood/);
  const ended = pinLink({ features: { 'studio.pinterest': false }, upsell: { 'studio.pinterest': 'Growth' }, workspace: { open: false, noPlan: false } });
  assert.match(ended, /Plan ended<span aria-hidden="true">·<\/span>/);
  assert.doesNotMatch(ended, /Available on/);
  assert.match(read('components/editor/pinterest-link.tsx'), /hasFeature\(account,'studio\.pinterest'\)/);
  // The Inspiration card it came from is gone, with its styles.
  assert.ok(!existsSync(new URL('components/editor/inspiration-card.tsx', ROOT)));
  assert.doesNotMatch(read('app/inputs.css'), /\.editor-insp/);
});

// ── Where pictures are added ───────────────────────────────────────────────
test('every tool adds pictures through the drop zone; the old paste box is gone', () => {
  assert.ok(!existsSync(new URL('components/clipboard-image-input.tsx', ROOT)));
  for (const f of ['app/key-visual/page.tsx', 'components/editor/lineup-capture.tsx', 'components/editor/swap-parts.tsx', 'components/editor/storyboard-car.tsx', 'components/editor/storyboard-settings.tsx', 'app/films/page.tsx', 'components/refinement-references.tsx', 'components/editor/reference-list.tsx']) {
    const s = read(f);
    assert.match(s, /<DropZone /, f);
    assert.doesNotMatch(s, /clipboard-image-input|ClipboardImageInput/, f);
  }
  // Key visual's references and Car lineup's inspiration: the one reference list
  // (components/editor/reference-list.tsx, tests/reference-list.test.mjs), through the same drop zone.
  assert.match(read('app/lineup/page.tsx'), /<ReferenceList /, 'app/lineup/page.tsx');
  assert.match(read('app/key-visual/page.tsx'), /<ReferenceList /, 'app/key-visual/page.tsx');
});

test('the settings say what happens in plain words; the share prompt is explained only just before the browser asks', () => {
  const kv = read('app/key-visual/page.tsx');
  assert.match(kv, /'Turn the car in the configurator\. Generate takes a picture of that view\.'/);
  for (const f of ['app/key-visual/page.tsx', 'app/lineup/page.tsx', 'app/swap/page.tsx', 'app/films/page.tsx', 'app/storyboard/page.tsx', 'components/editor/lineup-capture.tsx', 'components/editor/storyboard-car.tsx', 'components/editor/swap-parts.tsx']) {
    assert.doesNotMatch(read(f), /isolated capture|share This Tab|choose This Tab/, f);
  }
  const notice = 'Your browser will ask to share this tab once, so the Studio can take the picture. Choose this tab and Share.';
  assert.ok(kv.includes(`{askingToShare&&<Banner icon={<Monitor aria-hidden="true"/>}>${notice}</Banner>}`));
  assert.match(kv, /setAskingToShare\(true\);\n\s*try\{stream=await navigator\.mediaDevices\.getDisplayMedia\(/);
  for (const f of ['components/editor/lineup-capture.tsx', 'components/editor/storyboard-car.tsx', 'app/swap/page.tsx']) {
    const s = read(f);
    assert.ok(s.includes(`const SHARE_NOTICE='${notice}';`), f);
    // Every call that makes the browser ask is preceded by the notice.
    const calls = [...s.matchAll(/getDisplayMedia\(highResolutionDisplayOptions\(\)\)/g)].map((m) => m.index);
    assert.ok(calls.length >= 2, f);
    for (const at of calls) assert.match(s.slice(Math.max(0, at - 260), at), /SHARE_NOTICE/, `${f}: the notice comes first`);
  }
});
