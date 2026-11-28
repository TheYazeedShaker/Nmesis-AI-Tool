// The canvas says when it has drawn what it holds now (lib/editor/render-signal.ts), and which drawer drew each text
// layer; the check:ui editor journeys wait for that, and for what each check reads, never for a guessed time.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { drawnTextToken, readDrawnText, renderStateOf, RENDER_ATTR, TEXT_DRAWN_ATTR } from '../lib/editor/render-signal.ts';

const ID = '6f1c2a3b-0d4e-4f5a-9b6c-7d8e9f0a1b2c';

test('a text layer as drawn: its token, read back the same', () => {
  const drawn = { id: ID, effect: 'curve', drawer: 'shaped', font: 'loaded', marks: 9 };
  const token = drawnTextToken(drawn);
  assert.equal(token, `${ID}:curve:shaped:loaded:9`);
  assert.deepEqual(readDrawnText(`${token} ${ID.replace('6f', '7a')}:none:text:loading:8`), [drawn, { id: ID.replace('6f', '7a'), effect: 'none', drawer: 'text', font: 'loading', marks: 8 }]);
  assert.deepEqual(readDrawnText(''), []);
  assert.deepEqual(readDrawnText(null), []);
});

test('a part that would break the list is refused, and a token not in the format is left out', () => {
  assert.equal(drawnTextToken({ id: 'a b', effect: 'none', drawer: 'text', font: 'loaded', marks: 1 }), null);
  assert.equal(drawnTextToken({ id: ID, effect: 'cu:rve', drawer: 'text', font: 'loaded', marks: 1 }), null);
  assert.equal(drawnTextToken({ id: ID, effect: 'none', drawer: 'other', font: 'loaded', marks: 1 }), null);
  assert.equal(drawnTextToken({ id: ID, effect: 'none', drawer: 'text', font: 'late', marks: 1 }), null);
  assert.equal(drawnTextToken({ id: ID, effect: 'none', drawer: 'text', font: 'loaded', marks: Number.NaN }), `${ID}:none:text:loaded:0`);
  assert.deepEqual(readDrawnText(`${ID}:none:text:loaded ${ID}:none:pen:loaded:1 ${ID}:none:text:loaded:x`), []);
});

test('ready once no text waits for its font; missing counts as settled', () => {
  assert.equal(renderStateOf([]), 'ready');
  assert.equal(renderStateOf([{ id: ID, effect: 'none', drawer: 'text', font: 'loaded', marks: 3 }, { id: ID, effect: 'curve', drawer: 'path', font: 'missing', marks: 3 }]), 'ready');
  assert.equal(renderStateOf([{ id: ID, effect: 'curve', drawer: 'shaped', font: 'loading', marks: 0 }]), 'drawing');
  assert.equal(RENDER_ATTR, 'data-render');
  assert.equal(TEXT_DRAWN_ATTR, 'data-text-drawn');
});

test('the stage says what it drew: every text drawer is named, the shaping drawer counts what it placed', () => {
  const src = fs.readFileSync('components/canvas/stage.tsx', 'utf8');
  // Each of the three drawers carries its name, the layer, the effect and the font state.
  for (const d of ['shaped', 'path', 'text']) assert.match(src, new RegExp(`drawnAs\\(layer,'${d}',state\\)`), `the ${d} drawer is not named`);
  assert.match(src, /shapedMarks\.set\(shape,placed\.length\)/, 'the shaping drawer does not count the pieces it placed');
  // After each drawing of the content layer; "drawing" on each commit, with a drawing asked for.
  assert.match(src, /layer\.on\('draw\.render',\(\)=>sayDrawn\(layer,el\)\)/);
  assert.match(src, /setAttribute\(RENDER_ATTR,'drawing'\);\s*layer\.batchDraw\(\)/);
  // The font state comes from the fonts themselves, not from a key's spelling.
  assert.match(fs.readFileSync('components/canvas/fonts.ts', 'utf8'), /state:r\?'loaded' as const:'loading' as const/);
  // The editor says which copy it opened from (the device's copy is the one that says "Restored…").
  assert.match(fs.readFileSync('components/canvas/editor-page.tsx', 'utf8'), /data-opened-from=\{opened\.unsent\?'device':'studio'\}/);
});

test('the editor journeys wait for signals, never for a fixed time', () => {
  const src = fs.readFileSync('scripts/check-ui.mjs', 'utf8');
  const start = src.indexOf('function canvasOf(page)'), end = src.indexOf('// A real keyboard: Tab through the page');
  assert.ok(start > 0 && end > start, 'the editor helpers and journeys were not found');
  const editor = src.slice(start, end);
  assert.doesNotMatch(editor, /waitForTimeout\(/, 'an editor helper or journey waits for a fixed time');
  // The curved Arabic check reads the canvas's own word on which drawer drew it.
  assert.match(editor, /drawn\(page, \{ effect: 'curve' \}\)/);
  assert.match(editor, /not the shaping drawer/);
  assert.match(editor, /the shaping drawer drew nothing/);
});
