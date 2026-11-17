import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Library → a folder: the list follows the address without a reload. The page
// reads ?in= and ?open= with useSearchParams (every navigation, in a Suspense
// boundary), and useLibraryPage asks the server again when its place changes.
// The hook runs here under a small hooks runtime (state, refs, callbacks,
// effects), as React would re-render it after a client-side navigation.

const src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

function hooksRuntime() {
  let slots = [], at = 0, dirty = false, effects = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const React = {
    useState(init) {
      const i = at++;
      if (!(i in slots)) slots[i] = {value: typeof init === 'function' ? init() : init};
      const slot = slots[i];
      return [slot.value, (next) => { const v = typeof next === 'function' ? next(slot.value) : next; if (!Object.is(v, slot.value)) { slot.value = v; dirty = true; } }];
    },
    useRef(init) { const i = at++; if (!(i in slots)) slots[i] = {current: init}; return slots[i]; },
    useCallback(fn, deps) { const i = at++; if (!(i in slots) || !same(slots[i].deps, deps)) slots[i] = {fn, deps}; return slots[i].fn; },
    useMemo(fn, deps) { const i = at++; if (!(i in slots) || !same(slots[i].deps, deps)) slots[i] = {value: fn(), deps}; return slots[i].value; },
    useEffect(fn, deps) { const i = at++; const prev = slots[i]; if (!prev || !same(prev.deps, deps)) { slots[i] = {deps}; effects.push(fn); } },
  };
  /** Renders until state settles (React's render-phase updates), then runs the effects. */
  async function render(hook, ...args) {
    let out, rounds = 0;
    do { dirty = false; at = 0; effects = []; out = hook(...args); } while (dirty && ++rounds < 20);
    for (const e of effects) e();
    await new Promise((r) => setTimeout(r, 0));
    return out;
  }
  return {React, render};
}

test('navigating between folders updates the list without a reload', async () => {
  const {React, render} = hooksRuntime();
  const asked = [];
  const folders = {all: [{id: 'visual:a1', title: 'Demo SUV · everything'}], 'folder-test': [{id: 'visual:t1', title: 'Demo SUV · testing folder'}]};
  const fetch = async (url) => {
    asked.push(url);
    const place = new URL(url, 'https://studio.example.test').searchParams.get('in');
    const items = (folders[place] || []).map((i) => ({kind: 'visual', id: i.id.split(':')[1], title: i.title, tool: 'Key visual', car: 'Demo SUV', status: 'ready', at: 1, mine: true, thumb: null, full: null, folderId: place === 'all' ? null : place, href: '/library', deleted: false}));
    return {ok: true, json: async () => ({items, total: items.length, next: null, counts: {all: 1, unsorted: 0, deleted: 0}, folders: [], cars: [], foldersReady: true})};
  };
  const code = ts.transpileModule(src('components/workspace/data.ts'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
  const context = vm.createContext({fetch, AbortSignal, URL, URLSearchParams, Date, JSON, Promise, Math, Number, String, Map, Set, Error, setTimeout, clearTimeout, console});
  const stubs = {react: {...React, default: React}, '@/components/ds/toast': {useToast: () => ({toast() {}})}, './library': {EMPTY_QUERY: {tool: '', car: '', who: '', q: '', sort: 'new'}}};
  const mod = new vm.SourceTextModule(code, {context});
  await mod.link(async (name) => new vm.SyntheticModule(Object.keys(stubs[name]), function () { for (const [k, v] of Object.entries(stubs[name])) this.setExport(k, v); }, {context}));
  await mod.evaluate();
  const {useLibraryPage} = mod.namespace;

  let lib = await render(useLibraryPage, 'all');
  lib = await render(useLibraryPage, 'all');
  assert.deepEqual(lib.items.map((i) => i.name), ['Demo SUV · everything']);

  // The person clicks "Testing folder": the address becomes ?in=folder-test and the page re-renders with it.
  lib = await render(useLibraryPage, 'folder-test');
  lib = await render(useLibraryPage, 'folder-test');
  assert.match(asked.at(-1), /[?&]in=folder-test\b/, 'the folder is asked for');
  assert.deepEqual(lib.items.map((i) => i.name), ['Demo SUV · testing folder'], 'the list shows the folder');

  // Back: Everything again.
  lib = await render(useLibraryPage, 'all');
  lib = await render(useLibraryPage, 'all');
  assert.deepEqual(lib.items.map((i) => i.name), ['Demo SUV · everything']);
  assert.equal(asked.length, 3, 'one request per place, no reload');

  // The page reads the address on every navigation, not once.
  const pages = src('components/workspace/pages.tsx');
  assert.match(pages, /useSearchParams\(\)/);
  assert.match(pages, /<LibraryAtAddress\/><\/React\.Suspense>/);
  assert.doesNotMatch(pages, /window\.location\.search/);
});
