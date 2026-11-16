import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('Phase 3 group 1: Home, Library, Projects and a folder are routes; the key-visual tool moved', () => {
  assert.match(read('app/page.tsx'), /<HomePage\/>/);
  assert.match(read('app/library/page.tsx'), /<LibraryPage\/>/);
  assert.match(read('app/projects/page.tsx'), /<ProjectsPage\/>/);
  assert.match(read('app/projects/[id]/page.tsx'), /<FolderPage id=/);
  assert.ok(existsSync(new URL('../app/key-visual/page.tsx', import.meta.url)));
  const bar = read('components/studio-topbar.tsx');
  assert.match(bar, /export const KEY_VISUAL_HREF='\/key-visual';/);
  for (const href of ["href:'/'", "href:'/library'", "href:'/projects'"]) assert.ok(bar.includes(href), href);
  // Old "back to key visuals" links follow the move.
  assert.doesNotMatch(read('app/films/page.tsx'), /href="\/"/);
  // Home's car and words reach the key-visual tool.
  assert.match(read('app/key-visual/page.tsx'), /asked\.get\('car'\)/);
  assert.match(read('app/key-visual/page.tsx'), /asked\.get\('brief'\)/);
});

test('the new screens follow light and dark; the tool screens keep their dark bar', () => {
  const frame = read('components/workspace/frame.tsx');
  assert.match(frame, /<div className="ds-app ds-shell workspace">/);
  assert.match(frame, /<StudioTopBar current=\{current\} theme="system"/);
  // Phones use the top bar's menu: a fixed bottom bar covered the work under it (check:ui).
  assert.doesNotMatch(frame, /PhoneNav/);
  assert.match(read('components/studio-topbar.tsx'), /data-theme=\{theme==='dark'\?'dark':undefined\}/);
  assert.match(read('components/workspace/pages.tsx'), /<AccountNotices variant="ds"\/>/);
});

test('the library feed carries no provider, model, cost or error words, and no one else’s address (F-050)', () => {
  const lib = read('lib/library.ts');
  assert.doesNotMatch(lib, /provider:|model:|error:|email|credits:/);
  assert.match(lib, /mine:/);
  const data = read('components/workspace/data.ts');
  assert.match(data, /person:i\.mine\?'You':'A teammate'/);
});

test('viewers, staff viewing a client and an ended plan look but do not change', () => {
  const pages = read('components/workspace/pages.tsx');
  assert.match(pages, /const canChange=\(a:AccountSummary\|null\)=>!!a&&a\.workspace\.open&&a\.role!=='viewer'&&!a\.viewingAs;/);
  const lib = read('components/workspace/library.tsx');
  assert.match(lib, /onSelect=\{readOnly\?undefined:/);
  assert.match(lib, /onDelete=\{deletedView\|\|readOnly\?undefined:/);
});

test('no layout shift while the library loads: skeletons hold the space', () => {
  assert.match(read('components/workspace/pages.tsx'), /<SkeletonTile key=\{i\}\/>/);
  assert.match(read('components/workspace/home.tsx'), /recent===null\?<div className="ds-scroller" aria-busy="true"/);
});

// Phase 3 group 2: a fixed width meant for icon buttons squeezed the text
// buttons "Your car / Result" on phones. Touch sizes come from the control
// tokens and grow with the content; a fixed width is only for what is a
// square by nature (an icon button, a swatch, a tick box, a card's "…").
test('touch sizes never squeeze words: no fixed width from a size token on a control with text', () => {
  const ICON_ONLY = /\.icon\b|swatch|card-actions-menu > summary|ds-tile-select|\.ds-check > input|editor-version-thumb|ds-avatar|ds-brand-mark|ds-toast-close|^\.ds-support$/; // .ds-support: only at 480px and below, where its word is hidden
  const files = ['app/design-system.css', 'app/studio-shell.css', 'app/workspace.css', 'app/editor.css'];
  const found = [];
  for (const f of files) {
    const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1].trim(), body = m[2];
      if (/(^|[;\s])width:\s*var\(--ds-(tap-phone|tap-min|control-h|control-h-sm)\)/.test(body) && !ICON_ONLY.test(selector)) found.push(`${f}: ${selector}`);
    }
  }
  assert.deepEqual(found, []);
  // The tokens make phone controls 44px; the segmented control grows with its words.
  assert.match(read('app/tokens.css'), /@media \(pointer: coarse\), \(max-width: 768px\) \{\s*:root \{\s*--ds-control-h: 44px;\s*--ds-control-h-sm: 44px;/);
  assert.match(read('app/design-system.css'), /\.ds-segmented > button \{ display: inline-flex; flex: none; white-space: nowrap;/);
  assert.match(read('app/design-system.css'), /\.ds-btn, \.ds-chip, \.ds-badge, \.ds-segmented, \.ds-meter \{ flex-shrink: 0; \}/);
  assert.match(read('app/design-system.css'), /\.ds-canvas-bar, \.ds-toolbar, \.ds-filters, \.ds-row \{ flex-wrap: wrap;/);
  // The editor fills what is left (a banner never pushes Generate off the screen).
  assert.match(read('app/editor.css'), /\.workspace > \.ds-main\.bleed > \.ds-editor \{ flex: 1 1 auto; height: auto; min-height: 0; \}/);
  // And check:ui counts controls whose words spill out of their box (ratcheted).
  assert.match(read('scripts/ui/checks.mjs'), /out\.spilling\.push/);
  assert.match(read('scripts/check-ui.mjs'), /const RATCHETED = \['controlsSpilling',/);
});
