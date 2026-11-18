import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

// A dialog has one scroll area: its body. The line-up references dialog showed
// two scrollbars (the browser's own overflow on an open <dialog>, plus the
// body's). These checks read the CSS so it can't come back.

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

/** Every rule in a stylesheet: its selector, its declarations and the at-rules around it. */
function rules(css){
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [], within = [];
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '{') {
      const prelude = css.slice(start, i).trim();
      if (prelude.startsWith('@')) { within.push(prelude); start = i + 1; continue; }
      const end = css.indexOf('}', i);
      out.push({selector: prelude.replace(/\s+/g, ' '), body: css.slice(i + 1, end), at: within.join(' ')});
      i = end; start = i + 1;
    } else if (c === '}') { within.pop(); start = i + 1; }
    else if (c === ';' && !within.length) start = i + 1;
  }
  return out;
}
const rule = (css, selector) => rules(css).filter((r) => r.selector === selector && !r.at).map((r) => r.body).join(';');
const scrolls = (body) => /overflow(-[xy])?\s*:\s*(auto|scroll|overlay)/.test(body);
// The new design system's stylesheets. globals.css is the legacy screens' (the
// shadcn dialog there is not the design system's Dialog and is not used).
const SHEETS = readdirSync(new URL('../app/', import.meta.url)).filter((f) => f.endsWith('.css') && f !== 'globals.css');

test('the dialog never scrolls itself: a column whose body is the one scroll area, head and foot in view', () => {
  const css = read('app/design-system.css');
  const open = rule(css, '.ds-dialog[open]');
  assert.match(open, /display:\s*flex/);
  assert.match(open, /flex-direction:\s*column/);
  assert.match(open, /overflow:\s*hidden/, 'the browser gives an open modal <dialog> overflow: auto');
  // Never on the closed dialog: display there would override the browser's display: none.
  assert.doesNotMatch(rule(css, '.ds-dialog'), /display:/);
  const inner = rule(css, '.ds-dialog-inner');
  assert.match(inner, /min-height:\s*0/);
  assert.doesNotMatch(inner, /max-height:\s*inherit/, 'inherit ignores the border: the inner box came out taller than the dialog');
  const body = rule(css, '.ds-dialog-body');
  assert.match(body, /overflow-y:\s*auto/);
  assert.match(body, /min-height:\s*0/);
  assert.match(body, /flex:\s*1 1 auto/);
  assert.match(rule(css, '.ds-dialog-head, .ds-dialog-foot, .ds-sheet-grip'), /flex:\s*none/, 'the title and the buttons stay on screen');
  // The Dialog component keeps that order: head, body, foot.
  const dialog = read('components/ds/dialog.tsx');
  const at = (c) => dialog.indexOf('className="' + c + '"');
  assert.ok(at('ds-dialog-head') > 0 && at('ds-dialog-head') < at('ds-dialog-body') && at('ds-dialog-body') < at('ds-dialog-foot'));
});

test('nothing inside a dialog adds a scroll area of its own', () => {
  const inDialog = /ds-dialog|ds-drawer|ds-sheet|tp-dialog|studio-menu|trash-drawer/;
  for (const f of SHEETS) {
    for (const r of rules(read('app/' + f))) {
      if (!scrolls(r.body) || !inDialog.test(r.selector)) continue;
      assert.equal(r.selector, '.ds-dialog-body', `${f}: ${r.selector} scrolls inside a dialog`);
    }
  }
});

test('every scroll area in the design system is known, and none sits in a dialog body', () => {
  // A new one is added here on purpose, with where it lives.
  const known = new Map([
    ['.ds-combo-list, .ds-menu-list', 'a dropdown list over the page'],
    ['.ds-dialog-body', 'the one scroll area of a dialog'],
    ['.ds-tabs', 'a row of tabs, sideways'],
    ['.ds-scroller', 'Home’s strips, sideways'],
    ['.ds-editor-rail', 'the editor’s tool rail'],
    ['.ds-canvas-stage', 'the editor’s canvas'],
    ['.ds-settings-body', 'the editor’s settings column (the phone sheet holds the settings without it)'],
    ['.ds-gallery-toc', 'the design-system gallery’s contents'],
    ['.ds-frames', 'the design-system gallery’s frames, sideways'],
    ['.editor-history', 'the versions strip under the canvas, sideways'],
    ['.editor-match-prompt', 'the fixed prompt in the editor’s settings (not shown when refining in a dialog)'],
    ['.lab-details pre', 'a long prompt shown on the Smart reference lab page (no dialog)'],
    ['.tp-viewport', 'the area editor’s drawing surface: it pans a zoomed picture (2×, 3×)'],
    ['.studio-side', 'the left navigation, when the window is too short for all of it (never in a dialog: on phones the drawer’s body scrolls)'],
    ['.studio-account-pop', 'the account menu over the page, on a very short window'],
    ['.studio-panel-body', 'the References and Uploads panel beside the navigation (on phones the drawer’s body scrolls instead)'],
  ]);
  const found = [];
  for (const f of SHEETS) for (const r of rules(read('app/' + f))) if (scrolls(r.body)) found.push(r.selector);
  for (const s of found) assert.ok(known.has(s), `${s} scrolls: is it inside a dialog? Add it to this list only if not.`);
  // The line-up references dialog: none of those inside it, and no inline overflow.
  const capture = read('components/editor/lineup-capture.tsx');
  for (const s of known.keys()) {
    if (s === '.ds-dialog-body') continue;
    for (const name of s.split(',').map((x) => x.trim().slice(1))) assert.ok(!capture.includes(`"${name}"`) && !capture.includes(`${name} `), `${name} in the line-up references dialog`);
  }
  // No dialog body sets its own overflow inline.
  for (const f of ['components/editor/lineup-capture.tsx', 'components/editor/lineup-parts.tsx', 'components/editor/swap-parts.tsx', 'components/editor/storyboard-board.tsx', 'components/editor/storyboard-car.tsx', 'components/editor/films-parts.tsx', 'components/workspace/library.tsx', 'components/workspace/projects.tsx']) {
    assert.doesNotMatch(read(f), /overflow(Y|X)?:\s*['"](auto|scroll)/, f);
  }
});
