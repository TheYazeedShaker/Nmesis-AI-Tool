import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// The library's empty states (lib/library-words.ts) and its Create menu
// (components/workspace/library.tsx, pages.tsx): each view says its own line.

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const source = ts.transpileModule(read('lib/library-words.ts'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
const {emptyWords} = await import('data:text/javascript,' + encodeURIComponent(source));
const say = (query, opts) => { const w = emptyWords({place: 'all', ...query}, opts); return `${w.title}. ${w.body}`; };

test('Everything with nothing made: “Nothing made yet. Start with Create.”, never the folder text', () => {
  const w = emptyWords({place: 'all'}, {anything: false});
  assert.deepEqual({...w}, {kind: 'empty', title: 'Nothing made yet', body: 'Start with Create.'});
  assert.doesNotMatch(say({}), /Move to|folder/i);
  // Viewers and staff viewing a client have no Create.
  assert.equal(say({}, {readOnly: true}), 'Nothing made yet. What your company makes shows here.');
});

test('each place has its own empty line', () => {
  assert.equal(say({place: 'deleted'}), 'Nothing deleted. What you delete waits here, with Restore.');
  assert.equal(say({place: 'folder-top'}, {folderName: 'Launch'}), 'Launch is empty. Move work here from the library with Move to…');
  assert.equal(say({place: 'folder-top'}, {folderName: 'Launch', readOnly: true}), 'Launch is empty. Work moved into this folder shows here.');
  assert.equal(say({place: 'unsorted'}), 'Everything is in a folder. Work that isn’t in a folder shows here.');
  assert.equal(say({place: 'unsorted'}, {anything: false}), 'Nothing made yet. Start with Create.');
  for (const place of ['all', 'deleted', 'unsorted', 'folder-top']) assert.equal(emptyWords({place}).kind, 'empty');
});

test('a filter that finds nothing names the filter and the place, and offers Clear', () => {
  const tools = {'Key visual': 'key visuals', 'Line-up': 'line-ups', 'Film': 'films', 'Car swap': 'car swaps', 'Story': 'stories'};
  for (const [tool, words] of Object.entries(tools)) {
    assert.equal(emptyWords({place: 'all', tool}).title, `No ${words} yet`);
    assert.equal(emptyWords({place: 'deleted', tool}).title, `No deleted ${words}`);
    assert.equal(emptyWords({place: 'f1', tool}, {folderName: 'Launch'}).title, `No ${words} in Launch`);
    assert.equal(emptyWords({place: 'unsorted', tool}).title, `No ${words} outside folders`);
  }
  assert.equal(emptyWords({place: 'all', car: 'Demo SUV'}).title, 'Nothing made for Demo SUV yet');
  assert.equal(emptyWords({place: 'deleted', car: 'Demo SUV'}).title, 'No deleted work for Demo SUV');
  assert.equal(emptyWords({place: 'f1', car: 'Demo SUV'}, {folderName: 'Launch'}).title, 'Nothing for Demo SUV in Launch');
  assert.equal(emptyWords({place: 'all', who: 'you'}).title, 'You haven’t made anything yet');
  assert.equal(emptyWords({place: 'deleted', who: 'you'}).title, 'You haven’t deleted anything');
  assert.equal(emptyWords({place: 'all', who: 'others'}).title, 'Nothing from a teammate yet');
  const one = emptyWords({place: 'all', tool: 'Film'});
  assert.equal(one.kind, 'no-results'); assert.equal(one.clear, 'Clear filter'); assert.equal(one.body, 'Clear the filter to see everything.');
  const two = emptyWords({place: 'deleted', tool: 'Film', car: 'Demo SUV'});
  assert.deepEqual({...two}, {kind: 'no-results', title: 'Nothing matches these filters in Deleted', body: 'Try fewer filters.', clear: 'Clear filters'});
});

test('a search with no results quotes the words, and clears the search (or the filters with it)', () => {
  assert.deepEqual({...emptyWords({place: 'all', q: ' dunes '})}, {kind: 'no-results', title: 'Nothing called “dunes”', body: 'Try another word, or part of a name.', clear: 'Clear search'});
  assert.equal(emptyWords({place: 'f1', q: 'dunes', tool: 'Film'}, {folderName: 'Launch'}).title, 'Nothing called “dunes” in Launch');
  assert.equal(emptyWords({place: 'all', q: 'dunes', tool: 'Film'}).clear, 'Clear filters');
  assert.equal(emptyWords({place: 'deleted', q: 'dunes'}).title, 'Nothing called “dunes” in Deleted');
});

test('the library draws those words with State, and Clear clears', () => {
  const lib = read('components/workspace/library.tsx');
  assert.match(lib, /const nothing=emptyWords\(query,\{folderName:folder\?\.name,readOnly,anything:counts\.all>0\}\)/);
  assert.match(lib, /<State kind=\{nothing\.kind\} title=\{nothing\.title\} actions=\{nothing\.clear&&<Button onClick=\{clear\}>\{nothing\.clear\}<\/Button>\}>\{nothing\.body\}<\/State>/);
  assert.doesNotMatch(lib, /Nothing here yet/);
});

test('Create is a menu of the five tools, to the editor’s pages, with plan chips; New folder waits for folders', () => {
  const lib = read('components/workspace/library.tsx'), pages = read('components/workspace/pages.tsx'), editor = read('components/editor/editor-screen.tsx');
  assert.match(lib, /<Menu label="Create" text="Create" kind="primary"/);
  assert.match(lib, /export const FOLDERS_OFF='Folders turn on after the next update';/);
  assert.match(lib, /disabled=\{!foldersReady\} detail=\{foldersReady\?undefined:FOLDERS_OFF\}/);
  assert.match(lib, /disabled=\{!!t\.locked\} aside=\{t\.locked&&/);
  // Viewers, staff viewing a client and Deleted: no Create.
  assert.match(lib, /actions=\{!deletedView&&!readOnly&&createButton\}/);
  // The tools in the editor's order, to the editor's pages.
  const create = [...pages.matchAll(/\{key:'\w+',label:'(New [^']+)',href:([^,]+),icon:<\w+\/>,feature:'([\w.]+)'\}/g)].map((m) => ({label: m[1], href: m[2], feature: m[3]}));
  assert.deepEqual(create.map((t) => t.label), ['New key visual', 'New line-up', 'New film', 'New swap', 'New story']);
  const tools = [...editor.matchAll(/\{id:'\w+',label:'[^']+',href:([^,]+),icon:/g)].map((m) => m[1]);
  assert.deepEqual(create.map((t) => t.href), tools);
  assert.deepEqual(create.map((t) => t.feature), ['studio.key_visuals', 'studio.lineups', 'studio.film', 'studio.swap', 'studio.storyboards']);
  assert.match(pages, /hasFeature\(account,feature\)\?undefined:planEnded\(account\)\?PLAN_ENDED_CHIP:`On \$\{account\?\.upsell\[feature\]\}`/);
  // A disabled menu item stays reachable by keyboard and says why.
  const menu = read('components/ds/menu.tsx');
  assert.match(menu, /aria-disabled=\{disabled \|\| undefined\}/);
  assert.match(menu, /onClick=\{\(\) => \{ if \(disabled\) return; close\(\); onSelect\(\); \}\}/);
  assert.doesNotMatch(menu, /:not\(:disabled\)/);
});
