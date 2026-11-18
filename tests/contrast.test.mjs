import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrastRows, readTokens, resolve, ratio } from '../scripts/design/contrast.mjs';

// Every text and background pair, and every button label in every state, is at
// least 4.5:1 in both themes (the focus ring at least 3:1), read from the tokens
// themselves (app/tokens.css), so a token change that breaks one fails here.
test('every colour pair meets its minimum in light and dark', () => {
  const rows = contrastRows();
  assert.ok(rows.length >= 70, 'both themes, every pair');
  const bad = rows.filter((r) => !r.ok).map((r) => `${r.theme}: ${r.what} (--${r.fg} on --${r.bg}) ${r.ratio}:1 < ${r.min}:1`);
  assert.deepEqual(bad, []);
});

test('the palette is the cool neutral system, with the lime as the only accent', () => {
  const t = readTokens();
  const hex = (name, theme) => '#' + resolve(t, name, theme).slice(0, 3).map((n) => n.toString(16).padStart(2, '0')).join('');
  // The brief's starting point, with the light page and the dark card one step apart (see tokens.css).
  assert.deepEqual(['ds-bg', 'ds-panel', 'ds-panel-2', 'ds-border', 'ds-text', 'ds-muted'].map((n) => hex(n, 'light')), ['#f3f5f8', '#ffffff', '#f1f3f6', '#e3e6eb', '#0e1116', '#5b6472']);
  assert.deepEqual(['ds-bg', 'ds-panel', 'ds-panel-2', 'ds-border', 'ds-text', 'ds-muted'].map((n) => hex(n, 'dark')), ['#0b0d10', '#161a21', '#1b2028', '#2a303a', '#f2f4f7', '#9aa3af']);
  // The old green-grey brand neutrals are gone; the lime stays.
  for (const old of ['nm-background', 'nm-card', 'nm-surface', 'nm-silver', 'nm-panel', 'nm-border', 'nm-ink', 'nm-muted', 'nm-graphite']) assert.equal(t[old], undefined, `--${old} is retired`);
  assert.equal(hex('ds-accent', 'light'), '#d9ff00');
  // Cards stand off the page more than before (the old pairs were 1.07:1 light and 1.10:1 dark).
  assert.ok(ratio(resolve(t, 'ds-panel', 'light'), resolve(t, 'ds-bg', 'light')) > 1.08);
  assert.ok(ratio(resolve(t, 'ds-panel', 'dark'), resolve(t, 'ds-bg', 'dark')) > 1.11);
});

test('buttons read only the button tokens, and unavailable never fades the label', () => {
  const css = readFileSync(new URL('../app/design-system.css', import.meta.url), 'utf8');
  const buttons = css.slice(css.indexOf('/* ── Buttons'), css.indexOf('.ds-spinner {'));
  assert.doesNotMatch(buttons, /opacity\s*:/, 'no opacity on a button or its meta text');
  for (const rule of buttons.match(/\.ds-btn[^{]*\{[^}]*\}/g)) {
    for (const [, prop, value] of rule.matchAll(/(background|color|border-color)\s*:\s*([^;]+);/g)) {
      if (value.trim() === 'transparent') continue;
      assert.match(value, /var\(--ds-(btn-|danger)/, `${rule.split('{')[0].trim()} ${prop} uses a button token`);
    }
  }
  assert.match(buttons, /\.ds-btn:is\(:disabled, \[aria-disabled="true"\]\)/);
});

test('the layers are one scale, panels under menus under drawers under dialogs', () => {
  const css = readFileSync(new URL('../app/tokens.css', import.meta.url), 'utf8');
  const z = (n) => Number(new RegExp(`--ds-z-${n}:\\s*(\\d+);`).exec(css)?.[1]);
  const order = ['base', 'panel', 'dropdown', 'drawer', 'modal', 'toast'].map(z);
  assert.ok(order.every(Number.isFinite), 'every layer is a token');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'base < panel < dropdown < drawer < modal < toast');
  assert.equal(new Set(order).size, order.length);
});
