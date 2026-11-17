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
  // What waits for /api/me appears at the right-hand end, so nothing moves (CLS);
  // the credit meter loads on its own, holding its place with a skeleton of its
  // own box until the credits arrive (speed, finish pass).
  assert.match(bar, /\{account&&<>/);
  assert.doesNotMatch(bar, /Promise\.allSettled\(\[loadAccount\(\),loadCredits\(\)\]\)/, 'the bar does not wait for the credits');
  assert.match(bar, /creditsAnswered\?<Meter credits=\{credits\}\/>:!account\.internal&&<MeterSkeleton\/>/);
  assert.match(bar, /<span className="ds-meter studio-meter studio-meter-loading" aria-hidden="true">/);
  // With no logo the brand's name stands alone: never its initials beside it.
  assert.doesNotMatch(bar, /initialsOf/);
  assert.match(bar, /logoView\(brand,failed\)==='name'\)return blank\?/);
});

test('the notices hold their remembered room instead of hiding the page; the credits never block it', () => {
  const account = read('components/studio-account.tsx');
  assert.match(account, /if\(!settled\)return space===null\?<div className="notices-pending" aria-hidden="true"\/>:<div className="studio-notices" aria-hidden="true" style=\{noticeSpace\(space\)\}\/>/);
  // Watched, so a banner that arrives after the notices settle (the credits) is remembered too.
  assert.match(account, /rememberNoticeSpace\(window\.innerWidth,el\.offsetHeight,undefined,variant\|\|'plain'\)[\s\S]*new ResizeObserver\(remember\)/);
  assert.match(account, /const NOTICES_WAIT_MS=2000;/);
  assert.match(read('app/studio-shell.css'), /\.studio-notices \{ display: flow-root; \}/);
  const credits = read('components/credits.tsx');
  assert.match(credits, /signal:AbortSignal\.timeout\(CREDITS_TIMEOUT_MS\)/, 'a credits request that never answers ends');
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
