// A reference added in Car lineup reaches the generate request: the References
// panel (and Uploads, Brand, a Pinterest link) all call the shell's one action,
// addAsReference; in Car lineup it becomes the inspiration, and the request's
// moodId is that picture's asset id. Same action as Key visual.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tsxLoader } from './support/load-tsx.mjs';

const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');

function withBrowser(fn) {
  const store = new Map();
  const sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.window = { sessionStorage }; globalThis.sessionStorage = sessionStorage;
  return Promise.resolve().then(fn).finally(() => { delete globalThis.window; delete globalThis.sessionStorage; });
}

const photo = (id) => ({ key: 'unsplash:' + id, provider: 'unsplash', src: `https://images.example.test/${id}.jpg`, thumb: `https://images.example.test/${id}-s.jpg`, name: 'Coastal road at dusk', credit: { name: 'Demo Photographer', href: 'https://photos.example.test/demo', source: 'Photo library', sourceHref: 'https://photos.example.test' } });

test('a photo clicked in References in Car lineup becomes the moodId of the generate request', () => withBrowser(async () => {
  const load = tsxLoader();
  const shell = load('components/shell/shell-state.ts');
  const tray = load('lib/reference-tray.ts');
  const { lineupMoodId, hasInspiration, NEED_INSPIRATION } = load('lib/lineup-reference.ts');
  shell.navigated('/lineup', 'lineup');
  const imported = [];
  const resolve = async (item) => { imported.push(item.key); tray.updateReference(item.key, { assetId: 'asset-' + item.key.split(':')[1] }); return 'asset-' + item.key.split(':')[1]; };
  const importPin = async () => { throw new Error('no link was typed'); };

  // Nothing yet: Generate is off and says why.
  assert.equal(hasInspiration(tray.trayItems(), ''), false);
  await assert.rejects(lineupMoodId({ tray: tray.trayItems(), pin: '', pinAdded: '', importPin, resolve }), { message: NEED_INSPIRATION });

  // The References panel's click: the one shared action.
  assert.equal(shell.addAsReference(photo('first')), 'added');
  assert.equal(hasInspiration(tray.trayItems(), ''), true);
  assert.equal(await lineupMoodId({ tray: tray.trayItems(), pin: '', pinAdded: '', importPin, resolve }), 'asset-first');
  assert.deepEqual(imported, ['unsplash:first'], 'brought into storage once, then kept on the tray item');
  assert.equal(await lineupMoodId({ tray: tray.trayItems(), pin: '', pinAdded: '', importPin, resolve }), 'asset-first');
  assert.deepEqual(imported, ['unsplash:first']);

  // A lineup takes one inspiration: another photo replaces it, and the request follows.
  assert.equal(shell.addAsReference(photo('second')), 'replaced');
  assert.deepEqual(tray.trayItems().map((i) => i.key), ['unsplash:second']);
  assert.equal(await lineupMoodId({ tray: tray.trayItems(), pin: '', pinAdded: '', importPin, resolve }), 'asset-second');

  // A refinement keeps its parent's inspiration; a link typed and not yet added is read first.
  assert.equal(await lineupMoodId({ parentMoodId: 'asset-parent', tray: tray.trayItems(), pin: '', pinAdded: '', importPin, resolve }), 'asset-parent');
  assert.equal(await lineupMoodId({ tray: tray.trayItems(), pin: 'https://pin.example.test/1', pinAdded: '', importPin: async () => 'asset-pin', resolve }), 'asset-pin');
  assert.equal(await lineupMoodId({ tray: tray.trayItems(), pin: 'https://pin.example.test/1', pinAdded: 'https://pin.example.test/1', importPin, resolve }), 'asset-second');

  // In Key visual the same action adds (up to six), so both tools share one path.
  shell.navigated('/key-visual', 'visuals');
  assert.equal(shell.addAsReference(photo('third')), 'added');
  assert.deepEqual(tray.trayItems().map((i) => i.key), ['unsplash:second', 'unsplash:third']);
}));

test('the lineup page sends that moodId, and every way in uses the shared action', () => {
  const page = read('app/lineup/page.tsx');
  assert.match(page, /const tray=useReferenceTray\(\);const inspiration=lineupInspiration\(tray\);/);
  assert.match(page, /const moodId=await lineupMoodId\(\{parentMoodId:parent\?\.moodId,tray:trayItems\(\),pin,pinAdded,importPin,resolve:resolveTrayReference\}\);/);
  assert.match(page, /body=\{id,lineup,sourceId:lineup\.cars\[0\]\.views\[0\]\.id,moodId,/);
  assert.match(page, /async function importPin\(\)\{const d=await importPinterestReference\(pin\);addAsReference\(/);
  assert.match(page, /async function uploadMood\(file:File\)\{const d=await uploadReference\(file\);[^}]*addAsReference\(/);
  assert.match(page, /onClick=\{\(\)=>openPanel\('references'\)\}>Find a photo in References/);
  assert.doesNotMatch(page, /setMood\(/, 'no second store for the inspiration');
  // The panels call the same action.
  assert.match(read('components/references/references-panel.tsx'), /const done = addAsReference\(item\);/);
  assert.match(read('components/shell/panels.tsx'), /const done=addAsReference\(\{key,src:u\.src/);
});
