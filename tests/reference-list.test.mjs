// One reference list for every tool that reads the reference tray
// (components/editor/reference-list.tsx): Key visual's References (up to six,
// with Smart pick) and Car lineup's Inspiration (one, which a new picture
// replaces; its Pinterest link and strict switch in the list's own slot).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tsxLoader } from './support/load-tsx.mjs';

const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
const h = React.createElement;
const credit = { name: 'Demo Photographer', href: 'https://photos.example/demo', source: 'Demo Photos', sourceHref: 'https://photos.example/' };
const stubs = { '@/components/references/references-panel': { ReferenceCredit: ({ credit: c }) => h('span', { className: 'references-credit' }, c.name) } };
const { ReferenceList, PICK_COUNTS } = tsxLoader(stubs)('components/editor/reference-list.tsx');
const photo = (n, extra = {}) => ({ key: `unsplash:demo-${n}`, src: `https://photos.example/demo-${n}.jpg`, thumb: `https://photos.example/demo-${n}-thumb.jpg`, name: `Demo SUV ${n}`, provider: 'unsplash', ...extra });
const noop = () => {};
const list = (props) => renderToStaticMarkup(h(ReferenceList, { id: 'refs-title', title: 'References', items: [], limit: 6, onAdd: noop, onFile: noop, onRemove: noop, ...props }));
const smart = { on: true, onChange: noop, count: 1, onCount: noop, state: { kind: 'ready' } };

test('both pages draw the one shared reference list, with the tool’s limit from the tray', () => {
  const kv = read('app/key-visual/page.tsx'), lineup = read('app/lineup/page.tsx');
  for (const [file, page] of [['app/key-visual/page.tsx', kv], ['app/lineup/page.tsx', lineup]]) {
    assert.match(page, /import \{ReferenceList\} from '@\/components\/editor\/reference-list';/, file);
    assert.equal(page.match(/<ReferenceList /g)?.length, 1, file);
    assert.doesNotMatch(page, /InspirationCard|ReferencesSettings|Find a photo in References/, file);
  }
  assert.match(kv, /<ReferenceList id="kv-references-title" title="References" limit=\{referenceLimit\('visuals'\)\}/);
  assert.match(kv, /smart=\{\{on:smartPick,onChange:on=>\{setSmartPick\(on\);if\(!on\)clearPicked\(\)\},count:pickCount,onCount:n=>\{setPickCount\(n\);clearPicked\(\)\},state:smartState\}\}/);
  // Car lineup: one inspiration (the tray's first), and its own controls in the list's slot.
  assert.match(lineup, /<ReferenceList id="lineup-inspiration-title" title="Inspiration" limit=\{referenceLimit\('lineup'\)\}[\s\S]*?items=\{inspiration\?\[inspiration\]:\[\]\} onAdd=\{\(\)=>openPanel\('references'\)\} onFile=\{file=>addMood\(file\)\}/);
  const slot = lineup.slice(lineup.indexOf('<ReferenceList '), lineup.indexOf('</ReferenceList>'));
  assert.match(slot, /<PinterestLink value=\{pin\} onChange=\{v=>\{setPin\(v\);setPinError\(''\)\}\} onAdd=\{addPin\} busy=\{busy==='Loading inspiration…'\} error=\{pinError\|\|undefined\}/);
  assert.match(slot, /<LineupReferenceSwitch active=\{strictReference\}/);
  assert.doesNotMatch(slot, /smart=/, 'Smart pick is Key visual’s');
  // The old pieces are gone.
  for (const f of ['components/editor/references-settings.tsx', 'components/editor/inspiration-card.tsx']) assert.ok(!existsSync(new URL('../' + f, import.meta.url)), f);
  assert.deepEqual([...PICK_COUNTS], [1, 2, 3, 4]);
});

test('up to six references: the drop zone while empty, then the pictures with their credits, Add references, Upload and the count', () => {
  const empty = list({ smart });
  assert.match(empty, /<h3 class="editor-section-title" id="refs-title">References<\/h3>/);
  assert.match(empty, /Drop, paste or upload a picture</);
  assert.match(empty, /Choose file<span class="ds-sr-only">: reference picture<\/span>/);
  assert.match(empty, /Add references<\/button>/);
  assert.match(empty, /<span class="ds-muted editor-ref-count">0 \/ 6<\/span>/);
  assert.doesNotMatch(empty, /inspiration/i);

  const three = list({ items: [photo(1, { credit }), photo(2), photo(3, { picked: true })] });
  assert.match(three, /<ul class="editor-ref-list" aria-label="Your references">/);
  assert.doesNotMatch(three, /data-single/);
  assert.match(three, /<img src="https:\/\/photos\.example\/demo-1-thumb\.jpg" alt="Demo SUV 1"/);
  assert.match(three, /aria-label="Remove reference 1"/);
  assert.match(three, /Main reference<\/span><span class="references-credit">Demo Photographer<\/span>/, 'the photo keeps its credit');
  assert.match(three, />Reference 2</);
  assert.match(three, />Picked for you</);
  assert.match(three, /Upload<\/button>/);
  assert.match(three, /3 \/ 6/);

  // Full: nothing more can be added.
  const full = list({ items: [1, 2, 3, 4, 5, 6].map((n) => photo(n)) });
  assert.match(full, /<button type="button" class="ds-btn sm" disabled="">[\s\S]*?Add references<\/button>/);
  assert.match(full, /<button type="button" class="ds-btn quiet sm" disabled="">[\s\S]*?Upload<\/button>/);
});

test('Smart pick (Key visual): a row of the settings grid, its name in the label column naming the switch, how many beside it', () => {
  const m = list({ smart });
  assert.match(m, /<div class="ds-settings-row"><label class="ds-label" for="([^"]+)">Smart pick<\/label><span class="editor-smart-controls"><label class="ds-switch"><input type="checkbox" role="switch" aria-checked="true" id="\1" aria-describedby="\1-help" checked=""\/><span class="ds-choice-text"><\/span>/);
  assert.match(m, /<span class="ds-sr-only">How many photos Smart pick adds<\/span><select class="ds-select">/);
  assert.match(m, /<p class="ds-help" id="[^"]+-help">Picks a photo of your car when you haven’t added any\.<\/p><\/div>/);
  assert.match(list({ smart: { ...smart, count: 3 } }), /Picks 3 photos of your car/);
  const off = list({ smart: { ...smart, state: { kind: 'unavailable' } } });
  assert.match(off, /aria-checked="false" id="[^"]+" disabled=""/);
  assert.doesNotMatch(off, /How many photos Smart pick adds/);
  assert.match(off, /The photo library isn’t set up yet/);
  assert.doesNotMatch(list({}), /Smart pick/, 'only where the tool asks for it');
});

test('a limit of one is one inspiration: the words say so, and adding stays open because a new picture replaces it', () => {
  const props = { title: 'Inspiration', limit: 1, help: 'Its cars are replaced by yours.' };
  const empty = list(props);
  assert.match(empty, /Inspiration<\/h3><p class="ds-help">Its cars are replaced by yours\.<\/p>/);
  assert.match(empty, /Drop, paste or upload your inspiration</);
  assert.match(empty, /Choose file<span class="ds-sr-only">: inspiration picture<\/span>/);
  assert.match(empty, /<button type="button" class="ds-btn sm">[\s\S]*?Find a photo in References<\/button>/);
  assert.doesNotMatch(empty, /editor-ref-count|Add references| \/ 1/);

  const one = list({ ...props, items: [photo(1), photo(2)], children: h('p', { className: 'ds-help' }, 'Tool controls') });
  assert.match(one, /<ul class="editor-ref-list" data-single="true" aria-label="Your inspiration">/);
  assert.equal(one.match(/<li /g).length, 1, 'only the first picture is the inspiration');
  assert.match(one, />Your inspiration</);
  assert.match(one, /aria-label="Remove the inspiration"/);
  assert.match(one, /<button type="button" class="ds-btn sm">[\s\S]*?Find a photo in References<\/button>/, 'still open: a new photo replaces it');
  assert.match(one, /<button type="button" class="ds-btn quiet sm">[\s\S]*?Upload<\/button>/);
  assert.match(one, /One inspiration at a time: a new picture replaces this one\./);
  assert.match(one, /aria-label="Upload an inspiration picture"/);
  assert.doesNotMatch(one, /Main reference|Remove reference|Add references|Your references/);
  assert.match(one, /One inspiration at a time[\s\S]*<p class="ds-help">Tool controls<\/p><\/section>$/, 'the tool’s own controls come last');
});

test('the reference list has its own classes (the refinement references keep .editor-refs), each one styled', () => {
  const css = read('app/editor.css');
  assert.match(css, /\.editor-ref-list \{ list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.editor-ref-list\[data-single\] \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(css, /\.editor-smart-controls \{/);
  assert.doesNotMatch(css, /\.editor-refs \{/, 'no second rule for the refinement references’ class');
  assert.doesNotMatch(css, /\.editor-smart-pick \{/);
});
