import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const SCREENS = ['app/page.tsx', 'app/films/page.tsx', 'app/lineup/page.tsx', 'app/storyboard/page.tsx', 'app/swap/page.tsx', 'app/usage/page.tsx', 'app/company/page.tsx', 'app/nano-lab/page.tsx', 'components/studio-account.tsx'];

test('every screen uses the one top bar, with one shared navigation (Phase 2b)', () => {
  for (const file of SCREENS) {
    const s = read(file);
    assert.match(s, /<StudioTopBar[ />]/, file);
    assert.doesNotMatch(s, /<header className="topbar">/, file);
    assert.doesNotMatch(s, /className="film-nav"/, file);
  }
  const bar = read('components/studio-topbar.tsx');
  for (const href of ["href:'/'", "href:'/lineup'", "href:'/storyboard'", "href:'/films'", "href:'/swap'"]) assert.ok(bar.includes(href), href);
  assert.match(bar, /<nav className="ds-nav studio-nav" aria-label="Main">/);
  assert.match(bar, /aria-current=\{current===tool\.key\?'page':undefined\}/);
  assert.ok(!existsSync(new URL('../app/topbar-phone.css', import.meta.url)), 'the 2a stopgap is gone');
});

test('the top bar holds the credit meter, the company switcher and the account; phones get one menu', () => {
  const bar = read('components/studio-topbar.tsx');
  assert.match(bar, /<Meter credits=\{credits\}\/>/);
  assert.match(bar, /<Switcher account=\{account\}/);
  assert.match(bar, /<SignOut account=\{account\}\/>/);
  assert.match(bar, /<PhoneMenu account=\{account\}/);
  assert.match(bar, /aria-label="Menu"/);
  assert.match(bar, /<Dialog open=\{open\} onClose=\{\(\)=>setOpen\(false\)\} title="Menu" variant="drawer"/);
  // Everything that waits for /api/me and /api/credits appears at once, at the
  // right-hand end, so nothing moves (CLS).
  assert.match(bar, /Promise\.allSettled\(\[loadAccount\(\),loadCredits\(\)\]\)/);
  assert.match(bar, /\{ready&&account&&<>/);
});

test('the shell is drawn from tokens; phone account controls are 44px', () => {
  const css = read('app/studio-shell.css');
  assert.match(read('app/layout.tsx'), /import "\.\/studio-shell\.css";/);
  assert.match(read('app/tokens.css'), /--ds-tap-phone: 44px;/);
  assert.match(css, /\.studio-menu-row \{[^}]*min-height: var\(--ds-tap-phone\);/);
  assert.match(css, /@media \(max-width: 768px\) \{[^@]*\.studio-meter, \.studio-menu-button \{ min-height: var\(--ds-tap-phone\); \}/);
  assert.match(css, /\.studio-topbar \{[^}]*height: var\(--ds-topbar-h\);/);
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media \([^)]*\)/g, ''), /#[0-9a-f]{3,8}\b|\d+px/i, 'tokens only');
});
