// The toasts' rule (fix/editor-toasts), on every screen: a toast never covers a panel, a primary action
// (Generate, Save, Download) or the page strip. Written once in the toast component; each layout declares its
// safe corner once with ToastSlot (the canvas editor, the tools' EditorScreen); no screen patches the toasts in
// its own CSS; check:ui counts a toast that covers one (editorToastOverPanels, at zero) on every page check, with
// four shown in the editor and on every tool page (docs/editor-rules.md, rule 1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { EDITOR_JOURNEYS, TOAST_SIZES, TOOL_TOAST_SIZES, TOOL_TOAST_PAGES } from '../scripts/ui/screens.mjs';
import { EDITOR_RULES, RATCHETED } from '../scripts/ui/ratchet.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const TOOLS = { workspace: 'app/key-visual/page.tsx', lineup: 'app/lineup/page.tsx', films: 'app/films/page.tsx', swap: 'app/swap/page.tsx', storyboard: 'app/storyboard/page.tsx' };

test('the rule is written once, in the toast component, with its corners and the primary actions it keeps clear', () => {
  const toast = read('components/ds/toast.tsx');
  assert.match(toast, /a toast never covers a panel, a primary action\n\/\/ \(Generate, Save, Download\) or the page strip\./);
  assert.match(toast, /export type ToastCorner = 'bottom-right' \| 'top-right';/);
  assert.match(toast, /export const KEEP_CLEAR = '\.ds-btn\.primary, a\[download\]';/);
  // The slot is an empty box nothing reaches, with its corner.
  assert.match(toast, /export function ToastSlot\(\{ className, corner = 'bottom-right' \}/);
  assert.match(toast, /data-corner=\{corner\} aria-hidden="true" \/>/);
});

test('each layout declares its safe corner once: the canvas editor bottom right, every tool top right of its stage', () => {
  const editor = read('components/canvas/editor-page.tsx');
  assert.match(editor, /import \{ToastSlot,useToast\} from '@\/components\/ds\/toast';/);
  // Inside .canvas-fit, after the canvas box and before the page strip (the strip and the keys line stay clear).
  const fit = editor.indexOf('<div className="canvas-fit">'), slot = editor.indexOf('<ToastSlot/>'), strip = editor.indexOf('<PageStrip ');
  assert.ok(fit > 0 && fit < slot && slot < strip, 'ToastSlot sits in .canvas-fit, before the page strip');
  assert.equal(editor.split('<ToastSlot').length - 1, 1, 'one slot');
  assert.match(read('app/canvas.css'), /\.canvas-fit \{ position: relative;/);
  // The tools: one slot in EditorScreen, in the stage's middle (above the versions strip), top right.
  const screen = read('components/editor/editor-screen.tsx');
  assert.equal(screen.split('<ToastSlot').length - 1, 1, 'one slot for the five tools');
  assert.match(screen, /<div className="editor-stage-main">\{stage\}<ToastSlot corner="top-right"\/><\/div><div className="editor-stage-history">/);
  assert.match(read('app/editor.css'), /\.editor-stage-main \{ position: relative; \}/);
  // Every tool page is drawn by EditorScreen and declares nothing of its own.
  for (const [id, file] of Object.entries(TOOLS)) {
    const page = read(file);
    assert.match(page, /<EditorScreen tool="/, `${id} is drawn by EditorScreen`);
    assert.doesNotMatch(page, /ToastSlot/, `${id} declares no slot of its own`);
  }
});

test('no per-page toast patches: the toasts are styled only in the design system', () => {
  const css = [];
  const walk = (dir) => { for (const e of readdirSync(new URL('../' + dir, import.meta.url), { withFileTypes: true })) { const p = `${dir}/${e.name}`; if (e.isDirectory()) walk(p); else if (p.endsWith('.css')) css.push(p); } };
  walk('app'); walk('components');
  for (const file of css.filter((f) => f !== 'app/design-system.css')) assert.doesNotMatch(read(file).replace(/\/\*[\s\S]*?\*\//g, ''), /\.ds-toast/, `${file} styles the toasts`);
});

test('one region at the root, placed in the part of its slot on screen, never wider, never taller, short of a primary action', () => {
  const toast = read('components/ds/toast.tsx');
  // Still one live region, rendered by the provider (never moved, so its words are said from one place).
  assert.equal(toast.split('className="ds-toasts"').length - 1, 1);
  assert.match(toast, /aria-live="polite" aria-relevant="additions" role="region" aria-label="Notifications"/);
  assert.doesNotMatch(toast, /createPortal/);
  // The part on screen: cut by every box that scrolls or clips, and the window; nothing on screen, the corner.
  assert.match(toast, /function onScreen\(el: HTMLElement\)/);
  assert.match(toast, /if \(s\.overflowX === 'visible' && s\.overflowY === 'visible'\) continue;/);
  assert.match(toast, /const r = onScreen\(slot\), root = document\.documentElement, top = slot\.dataset\.corner === 'top-right';/);
  // Something laid over all of the slot, corner to corner (a phone's sheet): the window's corner too; a menu over one
  // corner is not.
  assert.match(toast, /const covered = \(x: number, y: number\) => \{ const n = document\.elementsFromPoint\(x, y\)\.find\(\(m\) => !el\.contains\(m\)\); return !n \|\| !\(slot\.parentElement\?\.contains\(n\) \|\| n\.contains\(slot\)\); \};/);
  assert.match(toast, /\(covered\(r\.right - 1, top \? r\.top \+ 1 : r\.bottom - 1\) && covered\(r\.left \+ 1, top \? r\.bottom - 1 : r\.top \+ 1\)\)\) \{ delete el\.dataset\.placed; return; \}/);
  assert.match(toast, /el\.dataset\.placed = top \? 'top' : 'bottom';/);
  // It follows the slot (its resizes, the stack's, the window's, any scroll, a toast coming or going).
  assert.match(toast, /const watch = new ResizeObserver\(later\);\n\s+watch\.observe\(slot\);\n\s+watch\.observe\(el\);/);
  assert.match(toast, /window\.addEventListener\('resize', refit\);/);
  assert.match(toast, /document\.addEventListener\('scroll', scrolled, \{ capture: true, passive: true \}\);/);
  assert.match(toast, /useLayoutEffectOnClient\(\(\) => \{ fit\.current\(\); \}, \[list\]\);/);
  // The room: from the corner to the slot's other end, short of the first primary action in the stack's width;
  // past one at the corner itself.
  assert.match(toast, /slot\.parentElement\?\.querySelectorAll<HTMLElement>\(KEEP_CLEAR\)/);
  assert.match(toast, /if \(near - gap <= from\) \{ from = Math\.max\(from, far \+ gap\); continue; \}\n\s+to = near - gap;\n\s+break;/);
  assert.match(toast, /const room = Math\.max\(0, to - from\);/);
  // Older ones fold while the stack would pass the room; the newest is always shown, a focused one never folds.
  assert.match(toast, /if \(i < stack\.length - 1 && used > room\) \{\n\s+for \(const t of stack\.slice\(0, i \+ 1\)\) if \(!t\.contains\(document\.activeElement\)\) t\.dataset\.folded = '';\n\s+break;/);
  // The latest slot wins; a slot that leaves clears only itself, and everything it set.
  assert.match(toast, /setSlot\(\(s\) => \(on \? el : s === el \? null : s\)\)/);
  assert.match(toast, /for \(const k of PLACE_VARS\) el\.style\.removeProperty\(k\);/);
  const css = read('app/design-system.css');
  assert.match(css, /\.ds-toast-slot \{ position: absolute; inset: 0; pointer-events: none; \}/);
  assert.match(css, /\.ds-toasts\[data-placed\] \{ left: auto; right: var\(--ds-toasts-right\); bottom: var\(--ds-toasts-bottom\); width: min\(400px, var\(--ds-toasts-room\)\); \}/);
  assert.match(css, /\.ds-toasts\[data-placed="top"\] \{ top: var\(--ds-toasts-top\); bottom: auto; \}/);
  assert.match(css, /\.ds-toasts\[data-placed\] > \.ds-toast\[data-folded\] \{ display: none; \}/);
  assert.match(css, /\.ds-toasts\[data-placed\] \.ds-toast-text \{ max-height: calc\(var\(--ds-toasts-room-h\) - 2 \* var\(--ds-space-12\)\); overflow-y: auto;/);
  // A screen without a slot keeps the window's corner, and the phone rule is unchanged.
  assert.match(css, /\.ds-toasts \{\n  position: fixed; z-index: var\(--ds-z-toast\); right: var\(--ds-space-24\); bottom: var\(--ds-space-24\);/);
  assert.match(css, /@media \(max-width: 768px\) \{\n  \.ds-toasts \{ right: var\(--ds-space-16\); left: var\(--ds-space-16\); width: auto; bottom: calc\(var\(--ds-phone-nav-h\) \+ var\(--ds-space-12\)\); \}\n\}/);
});

test('check:ui counts a toast over a panel, a primary action or the page strip on every page, and on every tool page with four shown', () => {
  assert.ok(EDITOR_RULES.includes('editorToastOverPanels'));
  assert.ok(RATCHETED.includes('editorToastOverPanels'));
  const baseline = JSON.parse(read('scripts/ui-baseline.json'));
  assert.equal(baseline.counts.editorToastOverPanels, 0);
  for (const id of ['editor', ...Object.keys(TOOLS)]) assert.equal(baseline.byScreen[id]?.editorToastOverPanels || 0, 0, id);
  const checks = read('scripts/ui/checks.mjs');
  // Measured before the part that needs the canvas editor, so on every page.
  const body = checks.slice(checks.indexOf('export function editorRules()'));
  assert.ok(body.indexOf("out.editorToastOverPanels.push") < body.indexOf("document.querySelector('.canvas-editor:not(.canvas-editor-state)')"), 'the toasts are measured on every page');
  for (const kept of ['.studio-side', '.studio-panel', '.canvas-inspector', '.ds-editor-settings', '.canvas-bar', '.ds-canvas-bar', '.canvas-pages', '.editor-stage-history', '.ds-generate', '.ds-phone-generate', '.ds-btn.primary', 'a[download]']) assert.ok(checks.includes(`'${kept}'`), kept);
  assert.match(checks, /\/\^\(save\|download\)\\b\/i\.test/);
  // The editor: four Ctrl+G with nothing selected, with and without Elements open.
  assert.deepEqual(TOAST_SIZES, [[1440, 900], [1280, 800], [1024, 768]]);
  assert.ok(EDITOR_JOURNEYS.some((j) => j.id === 'editor-toasts' && j.role === 'owner' && j.from === 'editor'));
  const ui = read('scripts/check-ui.mjs');
  assert.match(ui, /for \(let i = 0; i < 4; i\+\+\) await press\(page, 'Control\+g'\);/);
  assert.match(ui, /run\.ruleStates\.push\(\{ screen: 'editor', state, role: 'owner', w, h, theme: 'light', editorRules: await page\.evaluate\(editorRules\) \}\);/);
  // Every tool page (the five tools' own addresses), the phone too, each a rule state under its own screen.
  assert.ok(EDITOR_JOURNEYS.some((j) => j.id === 'tool-toasts' && j.role === 'owner'));
  assert.deepEqual(TOOL_TOAST_SIZES, [[1440, 900], [1280, 800], [1024, 768], [390, 844]]);
  const paths = Object.fromEntries([...read('lib/tools.ts').matchAll(/(\w+):'(\/[\w-]+)'/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(TOOL_TOAST_PAGES.map((p) => p.path).sort(), Object.values(paths).sort());
  assert.deepEqual(TOOL_TOAST_PAGES.map((p) => p.screen).sort(), Object.keys(TOOLS).sort());
  assert.match(ui, /if \(tool\) await page\.locator\('\.ds-toasts\[data-placed="top"\]'\)/);
  assert.match(ui, /run\.ruleStates\.push\(\{ screen, state: tool \? state : `\$\{state\}-home`, role: 'owner', w, h, theme: 'light', editorRules: await page\.evaluate\(editorRules\) \}\);/);
});
