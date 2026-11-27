// Toasts in the canvas editor (fix/editor-toasts): they lie in the canvas column, never over its panels or
// the controls under the canvas, and check:ui counts one that does (docs/editor-rules.md, rule 1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EDITOR_JOURNEYS, TOAST_SIZES } from '../scripts/ui/screens.mjs';
import { EDITOR_RULES, RATCHETED } from '../scripts/ui/ratchet.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('the editor gives the toasts its canvas column: the slot fills what lies between the notices and the page strip', () => {
  const editor = read('components/canvas/editor-page.tsx');
  assert.match(editor, /import \{ToastSlot,useToast\} from '@\/components\/ds\/toast';/);
  // Inside .canvas-fit, after the canvas box and before the page strip (the strip and the keys line stay clear).
  const fit = editor.indexOf('<div className="canvas-fit">'), slot = editor.indexOf('<ToastSlot/>'), strip = editor.indexOf('<PageStrip ');
  assert.ok(fit > 0 && fit < slot && slot < strip, 'ToastSlot sits in .canvas-fit, before the page strip');
  assert.equal(editor.split('<ToastSlot').length - 1, 1, 'one slot');
  const canvas = read('app/canvas.css');
  assert.match(canvas, /\.canvas-fit \{ position: relative;/, 'the slot is laid out in the canvas column');
});

test('one region at the root, drawn in the slot\'s bottom right corner while there is one', () => {
  const toast = read('components/ds/toast.tsx');
  // Still one live region, rendered by the provider (never moved, so its words are said from one place).
  assert.equal(toast.split('className="ds-toasts"').length - 1, 1);
  assert.match(toast, /aria-live="polite" aria-relevant="additions" role="region" aria-label="Notifications"/);
  assert.doesNotMatch(toast, /createPortal/);
  // It follows the slot's box (its own resizes, the window's, a toast coming or going), and falls back to the
  // corner without one.
  assert.match(toast, /new ResizeObserver\(\(\) => \{ cancelAnimationFrame\(frame\); frame = requestAnimationFrame\(refit\); \}\)/);
  assert.match(toast, /watch\.observe\(slot\);\n    watch\.observe\(el\);/);
  assert.match(toast, /window\.addEventListener\('resize', refit\)/);
  assert.match(toast, /useLayoutEffectOnClient\(\(\) => \{ fit\.current\(\); \}, \[list\]\);/);
  assert.match(toast, /if \(r\.width < 1 \|\| r\.height < 1\) \{ delete el\.dataset\.placed; return; \}/);
  // Never taller than the slot: the newest is always shown, older ones fold while they would reach past its top.
  assert.match(toast, /if \(i < stack\.length - 1 && used > r\.height\) \{\n\s+for \(const t of stack\.slice\(0, i \+ 1\)\) if \(!t\.contains\(document\.activeElement\)\) t\.dataset\.folded = '';\n\s+break;/);
  // The latest slot wins; a slot that leaves clears only itself.
  assert.match(toast, /setSlot\(\(s\) => \(on \? el : s === el \? null : s\)\)/);
  // The slot is an empty box nothing reaches.
  assert.match(toast, /className=\{className \? `ds-toast-slot \$\{className\}` : 'ds-toast-slot'\} aria-hidden="true" \/>/);
  const css = read('app/design-system.css');
  assert.match(css, /\.ds-toast-slot \{ position: absolute; inset: 0; pointer-events: none; \}/);
  assert.match(css, /\.ds-toasts\[data-placed\] \{ left: auto; right: var\(--ds-toasts-right\); bottom: var\(--ds-toasts-bottom\); width: min\(400px, var\(--ds-toasts-room\)\); \}/);
  assert.match(css, /\.ds-toasts\[data-placed\] > \.ds-toast\[data-folded\] \{ display: none; \}/);
  // Every other screen keeps the window's corner, and the phone rule is unchanged.
  assert.match(css, /\.ds-toasts \{\n  position: fixed; z-index: var\(--ds-z-toast\); right: var\(--ds-space-24\); bottom: var\(--ds-space-24\);/);
  assert.match(css, /@media \(max-width: 768px\) \{\n  \.ds-toasts \{ right: var\(--ds-space-16\); left: var\(--ds-space-16\); width: auto; bottom: calc\(var\(--ds-phone-nav-h\) \+ var\(--ds-space-12\)\); \}\n\}/);
});

test('check:ui counts a toast over a panel or a control of the canvas, with four shown, ratcheted at zero', () => {
  assert.ok(EDITOR_RULES.includes('editorToastOverPanels'));
  assert.ok(RATCHETED.includes('editorToastOverPanels'));
  const baseline = JSON.parse(read('scripts/ui-baseline.json'));
  assert.equal(baseline.counts.editorToastOverPanels, 0);
  assert.equal(baseline.byScreen.editor?.editorToastOverPanels || 0, 0);
  assert.deepEqual(TOAST_SIZES, [[1440, 900], [1280, 800], [1024, 768]]);
  assert.ok(EDITOR_JOURNEYS.some((j) => j.id === 'editor-toasts' && j.role === 'owner' && j.from === 'editor'));
  const checks = read('scripts/ui/checks.mjs');
  assert.match(checks, /'\.studio-side, \.studio-panel, \.canvas-inspector, \.canvas-bar, \.canvas-notice, \.canvas-pages, \.canvas-keys'/);
  const ui = read('scripts/check-ui.mjs');
  assert.match(ui, /for \(let i = 0; i < 4; i\+\+\) await press\(page, 'Control\+g'\);/);
  assert.match(ui, /for \(const state of \['four-toasts', 'four-toasts-elements-open'\]\)/);
  assert.match(ui, /run\.ruleStates\.push\(\{ screen: 'editor', state, role: 'owner', w, h, theme: 'light', editorRules: await page\.evaluate\(editorRules\) \}\);/);
});
