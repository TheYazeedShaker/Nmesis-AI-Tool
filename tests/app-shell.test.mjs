import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const SCREENS = ['app/key-visual/page.tsx', 'app/films/page.tsx', 'app/lineup/page.tsx', 'app/storyboard/page.tsx', 'app/swap/page.tsx', 'app/usage/page.tsx', 'app/company/page.tsx', 'app/nano-lab/page.tsx', 'components/workspace/upgrade.tsx'];

test('every screen uses the one top bar, with one shared navigation (Phase 2b)', () => {
  for (const file of SCREENS) {
    const s = read(file);
    // The rebuilt editor screens (Phase 3 group 2) get it through the workspace frame.
    assert.match(s, /<StudioTopBar[ />]|<WorkspaceFrame[ />]/, file);
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

test('no browser dialogs: the design system asks before unsaved changes are lost', () => {
  for (const file of ['app/films/page.tsx', 'app/swap/page.tsx', 'app/storyboard/page.tsx', 'app/key-visual/page.tsx']) assert.doesNotMatch(read(file), /window\.confirm|\balert\(|\bprompt\(/, file);
  const films = read('app/films/page.tsx');
  assert.match(films, /ask=useConfirm\(\),discardChanges=\(\)=>ask\(\{title:'Discard your changes\?'/);
  assert.match(films, /if\(dirty&&!await discardChanges\(\)\)return;/);
  assert.match(read('components/studio-providers.tsx'), /<ConfirmProvider theme="dark"><ToastProvider theme="dark">/);
  assert.match(read('app/layout.tsx'), /<StudioProviders>\{children\}<\/StudioProviders>/);
});

test('removing a provider key waits for Undo and is sent when the toast closes or the page is left', () => {
  const undo = read('components/undo-removal.tsx');
  assert.match(undo, /window\.addEventListener\('pagehide'/);
  assert.match(undo, /keepalive/);
  assert.match(undo, /onExpire:\(\)=>commit\(\)/);
  assert.match(undo, /action:\{label:'Undo'/);
  const toast = read('components/ds/toast.tsx');
  assert.match(toast, /window\.setTimeout\(\(\) => \{ toast\.onExpire\?\.\(\); onDone\(\); \}/);
  assert.match(toast, /for \(const old of l\.slice\(0, -3\)\) old\.onExpire\?\.\(\);/);
  for (const [file, url] of [['components/connection-settings.tsx', '/api/connection'], ['components/google-connection.tsx', '/api/google/connection'], ['components/topaz-upscale.tsx', '/api/topaz/connection'], ['app/films/page.tsx', '/api/video-connection']]) {
    const s = read(file);
    assert.ok(s.includes(`url:'${url}'`), file);
    assert.match(s, /removeLater\(\{message:/, file);
  }
  assert.doesNotMatch(read('app/films/page.tsx'), /api\('\/api\/video-connection','DELETE'\)/);
});

test('films, swaps and stories have Delete with Undo and a Deleted view, by button (touch and keyboard)', () => {
  const t = read('components/trash-controls.tsx');
  assert.match(t, /undo\(`“\$\{title\}” moved to Deleted\.`/);
  assert.match(t, /\/api\/\$\{words\.path\}\?deleted=1/);
  assert.match(t, /\/api\/\$\{words\.path\}\/\$\{id\}\/restore/);
  for (const [file, kind] of [['app/films/page.tsx', 'films'], ['app/swap/page.tsx', 'swaps'], ['app/storyboard/page.tsx', 'storyboards']]) assert.match(read(file), new RegExp(`<TrashControls kind="${kind}"`), file);
});

test('job polling backs off while nothing changes, and no screen polls on a fixed interval (F-061)', async () => {
  const {nextDelay} = await import('../lib/use-backoff-poll.ts');
  let d = 12000;
  const waits = [];
  for (let i = 0; i < 6; i++) { d = nextDelay(d, 'same', 12000, 60000); waits.push(d); }
  assert.deepEqual(waits, [19200, 30720, 49152, 60000, 60000, 60000]);
  assert.equal(nextDelay(60000, 'changed', 12000, 60000), 12000);
  const hook = read('lib/use-backoff-poll.ts');
  assert.match(hook, /if\(!live\|\|document\.hidden\)return;/);
  assert.match(hook, /document\.addEventListener\('visibilitychange',shown\)/);
  for (const file of ['app/films/page.tsx', 'app/swap/page.tsx', 'app/storyboard/page.tsx', 'app/lineup/page.tsx', 'app/key-visual/page.tsx']) {
    const s = read(file);
    assert.match(s, /useBackoffPoll\(async\(\)=>/, file);
    assert.doesNotMatch(s, /setInterval\(\(\)=>\{if\((document\.hidden|working\.current|action\.current)/, file);
  }
});

test('no generic rule outranks the 44px menu rows', () => {
  const css = read('app/studio-shell.css');
  assert.doesNotMatch(css, /body \.studio-menu button/);
});
