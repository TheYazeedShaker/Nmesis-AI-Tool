// Phase 2a (design/quick): the wrong-information fixes, the provider-free card
// labels (F-050), the Usage link rule, the configurator choice as a radio group
// (axe critical), and the phone top bar's stylesheet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = new URL('../', import.meta.url);
const rootPath = path.resolve(new URL('.', ROOT).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const read = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');
const nodeRequire = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
  const abs = path.resolve(file);
  if (cache.has(abs)) return cache.get(abs).exports;
  const mod = { exports: {} };
  cache.set(abs, mod);
  const code = ts.transpileModule(readFileSync(abs, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const req = (spec) => {
    const target = spec.startsWith('@/') ? path.join(rootPath, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(abs), spec) : null;
    if (!target) return nodeRequire(spec);
    for (const ext of ['.tsx', '.ts', '/index.ts', '']) if (existsSync(target + ext) && /\.(tsx?|mjs|js)$/.test(target + ext)) return load(target + ext);
    throw new Error(`Cannot resolve ${spec} from ${abs}`);
  };
  new Function('require', 'module', 'exports', code)(req, mod, mod.exports);
  return mod.exports;
}
const h = React.createElement;
const html = (el) => renderToStaticMarkup(el);

test('cards say the tool and a plain quality, never the provider or model (F-050)', () => {
  const { visualToolLabel, visualQualityLabel } = load(path.join(rootPath, 'lib/visual-labels.ts'));
  assert.equal(visualToolLabel({}), 'Key visual');
  assert.equal(visualToolLabel({ lineup: {} }), 'Line-up');
  assert.equal(visualToolLabel({ areaEdit: {} }), 'Area edit');
  assert.equal(visualToolLabel({ upscale: {} }), 'Upscale');
  assert.equal(visualQualityLabel({ width: 1536, height: 864 }), 'Standard');
  assert.equal(visualQualityLabel({ width: 3840, height: 2160 }), 'High detail');
  assert.equal(visualQualityLabel({ size: '4096x2304' }), 'High detail');
  assert.equal(visualQualityLabel({}), 'Standard');
  // The card line itself names no provider; "Made with …" sits in the card's
  // details, only for staff and companies using their own keys.
  const page = read('app/page.tsx');
  assert.match(page, /<p className="visual-generator-label">\{visualToolLabel\(r\)\} · \{visualQualityLabel\(r\)\}/);
  assert.match(page, /\{r\.provider&&showProvider&&<p className="visual-generator-label">Made with /);
  assert.match(page, /const showProvider=!!account&&\(account\.staff\|\|account\.features\['studio\.own_keys'\]===true\)/);
  assert.doesNotMatch(page, /'Creating with Higgsfield'|ChatGPT \/ OpenAI'\)\}\{r\.status/);
});

test('an ended plan says it has ended and to ask Nmesis, never "Available on <the plan it had>" (F-051)', () => {
  const { UpsellChip, planEnded, PLAN_ENDED_CHIP } = load(path.join(rootPath, 'components/studio-account.tsx'));
  const base = { upsell: { 'studio.lineups': 'Growth' }, features: { 'studio.lineups': false } };
  const ended = { ...base, workspace: { open: false, libraryOpen: true, libraryUntil: '2026-12-10', noPlan: false } };
  const missing = { ...base, workspace: { open: true, libraryOpen: true, libraryUntil: null } };
  const noPlan = { ...base, workspace: { open: false, libraryOpen: true, libraryUntil: null, noPlan: true } };
  assert.equal(planEnded(ended), true);
  assert.equal(planEnded(missing), false);
  assert.equal(planEnded(noPlan), false, 'a company that never had a plan is not "ended"');
  assert.equal(PLAN_ENDED_CHIP, 'Plan ended');
  const endedChip = html(h(UpsellChip, { feature: 'studio.lineups', account: ended }));
  assert.match(endedChip, /Plan ended/);
  assert.doesNotMatch(endedChip, /Available on/);
  assert.match(html(h(UpsellChip, { feature: 'studio.lineups', account: missing })), /Available on Growth/);
  const src = read('components/studio-account.tsx');
  assert.match(src, /Your company’s Studio plan has ended, so new work is paused\. Ask your Nmesis contact to renew it\./);
  assert.match(src, /<h1>Your Studio plan has ended<\/h1>/);
});

test('a teammate\'s work in progress does not ask this person to keep the page open (F-034 as it really is)', () => {
  const page = read('app/page.tsx');
  assert.match(page, /r\.mine===false\?<>Someone in your company started this visual\.<br\/>It appears here when it is ready\.<\/>:<>Lighting, materials and atmosphere\.<br\/>Keep this page open while it renders\.<\/>/);
  assert.match(page, /Open the Studio within seven days so the finished image can be saved to your library\./);
  assert.doesNotMatch(page, /archive the finished image/);
  assert.match(read('lib/visual-library.ts'), /mine:x\.owner===ctx\.prefix/);
});

test('the credit meter and banner link to Usage only for people who may open it (F-033)', () => {
  const usage = read('lib/credits/usage.ts');
  assert.match(usage, /export const canSeeUsage=\(ctx:Pick<Ctx,'role'\|'account'>\)=>ctx\.role==='owner'\|\|!!ctx\.account\.viewingAs;/);
  assert.match(usage, /usage:canSeeUsage\(ctx\)/);
  assert.match(usage, /if\(!canSeeUsage\(ctx\)\)throw new StudioError\(/);
  const credits = read('components/credits.tsx');
  assert.match(credits, /return o\.usage\n  \?<Link href="\/usage"/);
  assert.match(credits, /\{o\.usage\?<> <Link href="\/usage">Usage<\/Link><\/>:null\}/);
});

test('the configurator choice is a radio group, not tabs without panels (axe critical, F-025)', () => {
  const { ChoiceTabs } = load(path.join(rootPath, 'components/choice-tabs.tsx'));
  const markup = html(h(ChoiceTabs, { label: 'Car view source', value: 'live', onValueChange: () => {}, choices: [{ value: 'capture', label: 'Captured view' }, { value: 'live', label: 'Live configurator' }] }));
  assert.match(markup, /role="radiogroup" aria-label="Car view source"/);
  assert.equal((markup.match(/role="radio"/g) || []).length, 2);
  assert.match(markup, /aria-checked="true" tabindex="0"[^>]*data-state="active"[^>]*>Live configurator/);
  assert.match(markup, /aria-checked="false" tabindex="-1"[^>]*data-state="inactive"[^>]*>Captured view/);
  assert.doesNotMatch(markup, /aria-controls|role="tab"/);
  assert.doesNotMatch(read('app/page.tsx'), /from '@\/components\/ui\/tabs'/);
});

test('the phone top bar keeps the account controls on screen, using tokens only (F-006)', () => {
  const css = read('app/topbar-phone.css');
  assert.match(read('app/layout.tsx'), /import "\.\/topbar-phone\.css";/);
  assert.match(css, /@media \(max-width: 768px\)/);
  assert.match(css, /header\.topbar\.topbar > \.account-bar \{[^}]*flex: 1 1 100%;[^}]*flex-wrap: nowrap;/);
  assert.match(css, /header\.topbar\.topbar > \.heading-actions,\n  header\.topbar\.topbar > \.film-nav \{[^}]*overflow-x: auto;/);
  // The account row keeps its height while the account loads (no layout shift),
  // and stays one row on phones with an icon-only Sign out that keeps its name.
  assert.match(css, /> \.account-bar \{[^}]*min-height: var\(--ds-control-h\);/);
  assert.match(read('components/studio-account.tsx'), /if\(!account\)return <div className="account-bar account-bar-pending" aria-hidden="true"\/>;/);
  assert.match(read('components/studio-account.tsx'), /aria-label="Sign out"[^>]*><LogOut size=\{14\}\/><span className="account-signout-word">Sign out<\/span>/);
  assert.match(css, /@media \(max-width: 480px\) \{[^@]*\.account-signout-word \{ display: none; \}/);
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media \([^)]*\)/g, ''), /#[0-9a-f]{3,8}\b|\d+px/i, 'tokens only');
});

test('internal links no longer say they open elsewhere, and the client never reads an operator\'s sentence (F-005, F-066)', () => {
  const page = read('app/page.tsx');
  assert.doesNotMatch(page, /Story studio ↗|Replace car in ad ↗/);
  assert.doesNotMatch(page + read('app/swap/page.tsx'), /connected on this Studio yet/);
  assert.match(page, /Image generation isn’t available in your Studio right now\. Ask Nmesis\./);
});
