// The one shell (feat/studio-foundations): the navigation's items and its one
// selected item come from lib/shell-nav.ts; the secondary panel is open only
// inside a tool's view; navigating closes it; menus render in a layer above
// every panel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { navItems, navSelection, panelsOn, toolOf } from '../lib/shell-nav.ts';
import { tsxLoader } from './support/load-tsx.mjs';

const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
const PAGES = ['home', 'library', 'projects', 'brand', 'account', 'uploads', 'visuals', 'lineup', 'usage', 'company', 'lab', undefined];
const PANELS = [null, 'references', 'brand', 'elements', 'uploads'];

test('outside a tool the navigation lists pages only; inside one, the tool panels too', () => {
  const labels = (page) => navItems(page).map((i) => i.label);
  for (const page of ['home', 'library', 'company', 'account', 'uploads']) {
    assert.deepEqual(labels(page), ['Home', 'Projects', 'Uploads', 'Settings'], page);
    assert.ok(navItems(page).every((i) => 'href' in i), `${page}: pages only`);
    assert.deepEqual(panelsOn(page), [], `${page}: no panels`);
  }
  for (const page of ['visuals', 'lineup']) {
    assert.deepEqual(labels(page), ['Home', 'Projects', 'References', 'Brand', 'Elements', 'Uploads', 'Settings'], page);
    assert.deepEqual(panelsOn(page), ['references', 'brand', 'elements', 'uploads']);
    assert.equal(toolOf(page), page);
  }
  // Uploads is a page outside tools and a panel inside them.
  assert.equal(navItems('home').find((i) => i.key === 'uploads').href, '/uploads');
  assert.equal(navItems('visuals').find((i) => i.key === 'uploads').panel, 'uploads');
});

test('one selected item, from one source: the open panel, else the current page, never two', () => {
  for (const page of PAGES) for (const panel of PANELS) {
    const selected = navSelection(page, panel);
    const keys = navItems(page).map((i) => i.key);
    assert.ok(selected === null || keys.includes(selected), `${page}/${panel}: selects an item it lists`);
    // Exactly what the navigation draws: data-selected on that one item only.
    assert.ok(keys.filter((k) => k === selected).length <= 1);
  }
  assert.equal(navSelection('home', null), 'home');
  assert.equal(navSelection('library', null), 'projects');
  assert.equal(navSelection('company', null), 'settings');
  assert.equal(navSelection('uploads', null), 'uploads');
  assert.equal(navSelection('visuals', null), null, 'a tool view highlights nothing by itself');
  assert.equal(navSelection('visuals', 'references'), 'references', 'the open panel wins');
  assert.equal(navSelection('lineup', 'elements'), 'elements');
  // A panel left open from a tool is not shown (or selected) on a page without panels.
  assert.equal(navSelection('home', 'references'), 'home');
  const nav = read('components/shell/side-nav.tsx');
  assert.match(nav, /const \{panel\}=useShell\(\),selected=navSelection\(current,panel\);/);
  assert.match(nav, /data-selected=\{on\|\|undefined\} aria-current=\{on\?'page':undefined\}/);
  assert.match(nav, /data-selected=\{on\|\|undefined\} aria-pressed=\{on\}/);
  const css = read('app/side-nav.css');
  assert.match(css, /\.studio-side-item\[data-selected\] \{ background: var\(--ds-selected-bg\); color: var\(--ds-selected-text\); \}/);
  assert.doesNotMatch(css, /\.studio-side-item\[aria-current="page"\]|\.studio-side-item\[aria-pressed="true"\]/, 'no second source of highlight');
});

test('navigating closes the secondary panel; the same page keeps it', () => {
  const window = { sessionStorage: { getItem: () => null, setItem: () => {} } };
  globalThis.window = window; globalThis.sessionStorage = window.sessionStorage;
  try {
    const shell = tsxLoader()('components/shell/shell-state.ts');
    shell.navigated('/key-visual', 'visuals');
    shell.openPanel('references');
    assert.equal(shell.shellState().panel, 'references');
    shell.navigated('/key-visual', 'visuals');
    assert.equal(shell.shellState().panel, 'references', 'a re-render on the same page keeps it');
    shell.togglePanel('brand');
    assert.equal(shell.shellState().panel, 'brand', 'one panel at a time');
    shell.navigated('/lineup', 'lineup');
    assert.equal(shell.shellState().panel, null, 'a new address closes it');
    assert.equal(shell.shellState().tool, 'lineup');
    shell.openPanel('elements');
    shell.navigated('/', null);
    assert.equal(shell.shellState().panel, null);
    // The frame reports every page; a nav link also closes the panel when clicked.
    assert.match(read('components/workspace/frame.tsx'), /React\.useEffect\(\(\)=>\{navigated\(path,toolOf\(current\)\)\},\[path,current\]\);/);
    assert.match(read('components/shell/side-nav.tsx'), /onClick=\{\(\)=>\{closePanel\(\);onGo\?\.\(\)\}\}/);
  } finally { delete globalThis.window; delete globalThis.sessionStorage; }
});

test('menus open in a layer above every panel; panels sit on the panel layer', () => {
  const nav = read('components/shell/side-nav.tsx');
  assert.match(nav, /\{open&&<Layer><div ref=\{pop\}[^>]*className="studio-account-pop"/);
  const layer = read('components/ds/layer.tsx');
  assert.match(layer, /createPortal\(<div className="ds-app ds-layer" data-theme=\{themeAttribute\(theme\)\}>/);
  const css = read('app/side-nav.css');
  assert.match(css, /\.studio-account-pop \{\s*position: fixed; z-index: var\(--ds-z-dropdown\);/);
  assert.match(css, /\.studio-panel \{[^}]*z-index: var\(--ds-z-panel\);/);
  assert.match(css, /\.studio-side \{[^}]*z-index: var\(--ds-z-panel\);/);
  // The panel is never a modal on phones: the slim bar and its menu stay usable over it.
  assert.doesNotMatch(read('components/shell/panels.tsx'), /<Dialog/);
});

test('the canvas editor: its own panels (Brand, Elements, Text, Uploads), and the one way in for every panel', () => {
  assert.deepEqual(navItems('editor').map((i) => i.label), ['Home', 'Projects', 'Brand', 'Elements', 'Text', 'Uploads', 'Settings']);
  assert.deepEqual(panelsOn('editor'), ['brand', 'elements', 'text', 'uploads']);
  assert.equal(navSelection('editor', 'text'), 'text');
  assert.equal(navSelection('editor', 'references'), null, 'References is not an editor panel');
  assert.equal(toolOf('editor'), null, 'the editor takes no references, so it is no reference tool');
  const window = { sessionStorage: { getItem: () => null, setItem: () => {} } };
  globalThis.window = window; globalThis.sessionStorage = window.sessionStorage;
  try {
    const shell = tsxLoader()('components/shell/shell-state.ts');
    assert.equal(shell.addToCanvas({ kind: 'text', style: 'heading' }), false, 'no editor open: nothing to add to');
    const got = [];
    shell.setCanvasSink((a) => got.push(a));
    assert.equal(shell.addToCanvas({ kind: 'shape', shape: 'circle' }), true);
    assert.deepEqual(got, [{ kind: 'shape', shape: 'circle' }]);
    shell.setCanvasSink(null);
    assert.equal(shell.addToCanvas({ kind: 'line' }), false, 'the editor closed: its way in is gone');
  } finally { delete globalThis.window; delete globalThis.sessionStorage; }
});
