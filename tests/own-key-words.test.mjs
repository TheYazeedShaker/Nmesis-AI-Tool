// A company on its own AI keys pays its provider and is charged 0 credits by design. "0 credits" read
// as broken, so wherever a cost shows it says the company's AI key instead; credit-paying companies keep
// the numbers (fix/studio-editor-fixes). The words never name a provider (NO_PROVIDER_NAMES).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {costTag,credits,ownKeysLine,usedOwnKey,OWN_KEY,OWN_KEY_TAG,OWN_KEY_PRICE,OWN_KEY_USED,OWN_KEYS_ALL,OWN_KEYS_SOME,OWN_KEYS_SHORT} from '../lib/ds/words.ts';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const PROVIDERS = /OpenAI|Google|Gemini|Higgsfield|Topaz|Kling|Nano Banana/;
const OWN_WORDS = [OWN_KEY, OWN_KEY_TAG, OWN_KEY_PRICE, OWN_KEY_USED, OWN_KEYS_ALL, OWN_KEYS_SOME, OWN_KEYS_SHORT];

test('own-key words: plain, the same everywhere, never "0 credits", never a provider name', () => {
  assert.equal(OWN_KEY, 'Uses your company’s AI key, no credits');
  assert.equal(costTag('own key'), 'your AI key');
  for (const w of OWN_WORDS) {
    assert.doesNotMatch(w, /\b0 credits?\b/, w);
    assert.doesNotMatch(w, PROVIDERS, w);
    assert.match(w, /AI key/, w);
  }
});

test('who sees which: own-key work and companies, against credit-paying ones', () => {
  const own = { billing: { openai: 'own key', google: 'own key', higgsfield: 'own key', topaz: 'own key' } };
  const some = { billing: { openai: 'own key', google: 'credits', higgsfield: 'credits', topaz: 'credits' } };
  const paying = { billing: { openai: 'credits', google: 'credits', higgsfield: 'credits', topaz: 'credits' } };
  assert.equal(ownKeysLine(own), OWN_KEYS_ALL);
  assert.equal(ownKeysLine(some), OWN_KEYS_SOME);
  assert.equal(ownKeysLine(paying), null);
  assert.equal(ownKeysLine(null), null);
  assert.equal(usedOwnKey(some, 'openai', 0), true);
  assert.equal(usedOwnKey(some, 'google', 0), false, 'a 0 on a credit-paid provider stays a number');
  assert.equal(usedOwnKey(some, 'openai', 4), false);
  assert.equal(usedOwnKey(some, undefined, 0), false);
  assert.equal(usedOwnKey(null, 'openai', 0), false);
});

test('credit-paying companies keep the numbers', () => {
  assert.equal(costTag(4), '4 credits');
  assert.equal(costTag(1), '1 credit');
  assert.equal(costTag(1250), '1,250 credits');
  assert.equal(credits(0), '0 credits');// a real zero (nothing charged) is still said as a number for them
});

test('the shared pieces choose: Generate, the cost label, the history and result badges, Home and the account', () => {
  // Generate (every tool, components/editor/editor-screen.tsx): the payer's billing decides, in one place.
  const screen = read('components/editor/editor-screen.tsx'), ds = read('components/ds/editor.tsx');
  assert.match(screen, /const own=!!payer&&credits\?\.billing\[payer\]==='own key';/);
  assert.match(screen, /<GenerateButton cost=\{own\?'own key':cost\}/);
  assert.match(ds, /cost: Cost;/);
  assert.match(ds, /<span className="ds-btn-meta">· \{costTag\(cost\)\}<\/span>/);
  // The label before smaller actions and inside sentences.
  const credit = read('components/credits.tsx');
  assert.match(credit, /if\(billing==='own key'\)return OWN_KEY_PRICE;/);
  assert.doesNotMatch(credit, /Your own key · 0 credits/);
  // What a result used: only work that used 0 credits on a provider the company pays itself.
  const parts = read('components/editor/parts.tsx');
  assert.match(parts, /if\(used&&usedOwnKey\(o,provider,credits\)\)return <Badge icon=\{<KeyRound aria-hidden="true"\/>\}>\{OWN_KEY_USED\}<\/Badge>;/);
  assert.match(parts, /<CostBadge credits=\{v\.used\} used provider=\{v\.provider\}\/>/);
  for (const [f, p] of [['app/key-visual/page.tsx', /provider:r\.provider\|\|'openai'/], ['app/lineup/page.tsx', /provider:v\.provider\|\|'openai'/], ['components/editor/films-parts.tsx', /provider:'higgsfield'/], ['components/editor/swap-parts.tsx', /provider:'higgsfield' as const/]]) assert.match(read(f), p, f);
  // Home, the account page and the account menu.
  assert.match(read('components/workspace/pages.tsx'), /credits=\{own===OWN_KEYS_ALL\?\{left:null,own,/);
  assert.match(read('components/shell/account-page.tsx'), /\{own&&<Fact label="AI keys">\{own\}<\/Fact>\}/);
  assert.match(read('components/shell/side-nav.tsx'), /\{own\?<span className="ds-muted">\{OWN_KEYS_SHORT\}<\/span>/);
  // No "0 credits" left in the Studio's own-key sentences.
  for (const f of ['app/key-visual/page.tsx', 'app/films/page.tsx', 'components/editor/lineup-parts.tsx']) assert.doesNotMatch(read(f), /key: 0 credits|Your own key: no credits/, f);
});
