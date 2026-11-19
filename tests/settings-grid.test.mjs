// The settings panel's grid (app/design-system.css): one label column
// (--ds-settings-label-w) and one field column. A field, every group of choices
// (radios, chips, swatches: .ds-choices) and a settings row (.ds-settings-row)
// put their label or legend in the label column and their controls in the field
// column; How many's title is its row's label. Only in the side panel: on the
// phone sheet every label stays above its control.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tsxLoader } from './support/load-tsx.mjs';

const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
const h = React.createElement;
const html = (el) => renderToStaticMarkup(el);
const noop = () => {};
const load = tsxLoader({ '@/lib/configurator-presets': { useConfiguratorPresets: () => [] } });
const { CarSettings, ChoiceChips, QualitySettings, SettingsRow } = load('components/editor/parts.tsx');
const { Radio, RadioGroup } = load('components/ds/field.tsx');
const rule = (css, selector) => {
  const at = css.indexOf(selector + ' {');
  assert.ok(at >= 0, `a rule for ${selector}`);
  return css.slice(at, css.indexOf('}', at));
};

test('the grid: fields, groups of choices and settings rows share the label column and the field column', () => {
  const css = read('app/design-system.css');
  const grid = '.ds-settings-body .ds-field:has(> .ds-select, > .ds-input, > .ds-affix),\n.ds-settings-body .ds-choices,\n.ds-settings-body .ds-settings-row {\n  display: grid; grid-template-columns: var(--ds-settings-label-w) minmax(0, 1fr); align-items: center; column-gap: var(--ds-space-12); row-gap: var(--ds-space-4);\n}';
  assert.ok(css.includes(grid), 'one grid for all three');
  // A group of choices: the legend, floated (so it is an ordinary box, not drawn in the border), is the first grid item in the label column; every choice is in the field column.
  assert.match(css, /\.ds-settings-body \.ds-choices \{ align-items: start; \}/);
  assert.match(css, /\.ds-settings-body \.ds-choices > legend \{ float: left; grid-column: 1; grid-row: 1; margin: 0; padding: var\(--ds-space-2\) 0 0; \}/);
  assert.match(css, /\.ds-settings-body \.ds-choices > :not\(legend\) \{ grid-column: 2; \}/);
  // A settings row: its label in the label column, the controls and their help in the field column.
  assert.match(css, /\.ds-settings-body \.ds-settings-row > \.ds-label \{ grid-column: 1; margin-bottom: 0; \}/);
  assert.match(css, /\.ds-settings-body \.ds-settings-row > :not\(\.ds-label\) \{ grid-column: 2; \}/);
  // Off the side panel (the phone sheet), a row is a label above its controls, like a field.
  assert.match(css, /\n\.ds-settings-row \{ display: flex; flex-direction: column; gap: var\(--ds-space-4\); min-width: 0; \}/);
  // Every rule that uses the label column is scoped to the side panel.
  for (const file of ['app/design-system.css', 'app/editor.css']) {
    const src = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of src.matchAll(/([^{}]+)\{[^{}]*--ds-settings-label-w[^{}]*\}/g)) {
      // Split the selector list on the commas outside :has(…).
      const list = []; let depth = 0, at = 0;
      for (let i = 0; i < m[1].length; i++) { const c = m[1][i]; if (c === '(') depth++; else if (c === ')') depth--; else if (c === ',' && !depth) { list.push(m[1].slice(at, i)); at = i + 1; } }
      list.push(m[1].slice(at));
      for (const sel of list.map((s) => s.trim()).filter(Boolean)) assert.match(sel, /^\.ds-settings-body /, `${file}: ${sel}`);
    }
  }
});

test('chips, swatches and the quality cards: the legend centred on the first line of choices; the choices wrap in the field column', () => {
  const css = read('app/editor.css');
  assert.match(rule(css, '.editor-swatch-list, .editor-chip-list'), /display: flex; flex-wrap: wrap; align-items: center; gap: var\(--ds-space-8\); min-width: 0;/);
  assert.match(rule(css, '.ds-settings-body .editor-chips > legend'), /padding-top: calc\(\(var\(--ds-control-h-sm\) - var\(--ds-text-base\) \* var\(--ds-leading-base\)\) \/ 2\)/);
  assert.match(rule(css, '.ds-settings-body .editor-swatches > legend'), /padding-top: calc\(\(var\(--ds-control-h\) - var\(--ds-text-base\) \* var\(--ds-leading-base\)\) \/ 2\)/);
  assert.match(rule(css, '.ds-settings-body .editor-quality > legend'), /padding-top: calc\(var\(--ds-border-width\) \+ var\(--ds-space-8\) \+ var\(--ds-space-2\)\)/);
  assert.match(rule(css, '.editor-quality-label'), /flex-wrap: wrap;/, 'the credits drop under the name in a narrow column');
  // How many: a section that is one segmented group; its title is the row's label.
  assert.match(rule(css, '.ds-settings-body .editor-section:has(> .editor-section-title:first-child + .ds-segmented:last-child)'),
    /display: grid; grid-template-columns: var\(--ds-settings-label-w\) minmax\(0, 1fr\); align-items: center; column-gap: var\(--ds-space-12\);/);
  assert.match(read('app/key-visual/page.tsx'), /<SettingsSection title="How many" id="kv-count-title">\n\s*<div className="ds-segmented editor-count" role="group" aria-label="How many visuals">/, 'the markup the rule reads');
});

test('every group of choices is a .ds-choices fieldset with its legend first, so the grid can place it', () => {
  const quality = html(h(QualitySettings, { value: 'standard', onChange: noop, costs: { standard: 4, high: 8 } }));
  assert.match(quality, /<fieldset class="ds-choices editor-quality"><legend class="ds-label">Quality<\/legend><label class="ds-radio">/);
  assert.match(html(h(RadioGroup, { legend: 'Format' }, h(Radio, { name: 'f', label: 'Wide', onChange: noop }))), /^<fieldset class="ds-choices"><legend class="ds-label">Format<\/legend><label class="ds-radio">/);
  const chips = html(h(ChoiceChips, { legend: 'View', name: 'v', choices: [{ id: 'a', name: 'Front' }, { id: 'b', name: 'Side' }], value: 'a', onChange: noop }));
  assert.match(chips, /^<fieldset class="ds-choices editor-chips"><legend class="ds-label">View<\/legend><div class="editor-chip-list"><label class="editor-chip"><input class="editor-choice-input" type="radio" name="v" checked=""\/><span>Front<\/span><\/label><label class="editor-chip">/);
  const car = html(h(CarSettings, { cars: ['Demo SUV'], car: 'Demo SUV', onCar: noop, options: { colours: [{ id: 'blue', name: 'Demo Blue', swatch: 'var(--ds-accent)' }], trims: [], views: [], frames: 0 }, state: { colour: 'blue' }, onColour: noop, onTrim: noop, onView: noop, controlsInEditor: true }));
  assert.match(car, /<fieldset class="ds-choices editor-swatches"><legend class="ds-label">Colour<\/legend><div class="editor-swatch-list"><label class="editor-swatch" title="Demo Blue">[\s\S]*?<span class="ds-help editor-swatch-name">Demo Blue<\/span><\/div><\/fieldset>/);
  // A settings row names its one control.
  assert.equal(html(h(SettingsRow, { label: 'Smart pick', htmlFor: 'sp' }, h('span', null, 'controls'))), '<div class="ds-settings-row"><label class="ds-label" for="sp">Smart pick</label><span>controls</span></div>');
  // No settings component draws a group of choices outside .ds-choices (the per-car placement sliders are fields, not choices).
  const dir = new URL('../components/editor/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.tsx'))) {
    for (const m of read('components/editor/' + f).matchAll(/<fieldset className="([^"]*)"[^>]*>\s*<legend/g)) {
      if (m[1] === 'editor-lineup-place') continue;
      assert.match(m[1], /(^| )ds-choices( |$)/, `${f}: fieldset.${m[1]}`);
    }
  }
});
