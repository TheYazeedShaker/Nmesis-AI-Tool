import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PROVIDER_PATTERN,ENGINE_LABEL,imageModelLabel,filmModelLabel,upscaleModelLabel,plainProviderText,namesProvider} from '../lib/provider-words.ts';
import {clientText,setClientTextRewrite} from '../lib/client-text.ts';

// F-050: a client without its own keys never reads a provider or model name.
const MUST_NOT_NAME=['OpenAI','ChatGPT','GPT','Higgsfield','Google','Gemini','Nano','Topaz'];

test('the provider pattern catches every name the owner listed, and plain words do not',()=>{
 for(const name of MUST_NOT_NAME)assert.ok(namesProvider(`Made with ${name}`),name);
 assert.ok(namesProvider('nano banana pro'));
 for(const plain of ['Standard','High detail','Fast','Quick','4K','Studio','Reference match','Campaign look','Single shot','From your car','Animate image','Expressive','Simple'])assert.ok(!namesProvider(plain),plain);
});

test('quality choices and engine names are plain',()=>{
 for(const label of Object.values(ENGINE_LABEL))assert.ok(!PROVIDER_PATTERN.test(label),label);
 for(const id of ['sunburst','flare','gemini-3-pro-image','nano-banana-2.1','grok-image','gpt-image-1','unknown'])assert.ok(!namesProvider(imageModelLabel(id)),id);
 for(const id of ['kling-v2','seedance-reference','seedance-image','pixverse-v5','higgsfield-turbo','dop-v3.0-pro','unknown'])assert.ok(!namesProvider(filmModelLabel(id)),id);
 assert.equal(upscaleModelLabel({id:'bytedance',label:'ByteDance upscaler'}),'Simple');
 assert.ok(!namesProvider(upscaleModelLabel({id:'standard',label:'Topaz Standard V2'})));
});

test('provider errors are rewritten in plain words',()=>{
 const cases=[
  'Your Higgsfield account has no credit left.',
  'OpenAI rejected the request: billing hard limit reached.',
  "The company's Google AI Studio key is invalid.",
  'Gemini could not read the reference image.',
  'Nano Banana is not available for this size.',
  'Topaz could not upscale this image.',
  'Kling 2.1 · Master failed to render the shot.',
  'ChatGPT / OpenAI is busy, try again.',
  'GPT Image returned no image.',
 ];
 for(const text of cases){
  const plain=plainProviderText(text);
  assert.ok(!namesProvider(plain),`${text} → ${plain}`);
  assert.match(plain,/^[A-Z]/,plain);
 }
 assert.equal(plainProviderText('Your Higgsfield account has no credit left.'),'Your provider account has no credit left.');
 assert.equal(plainProviderText('Nothing to change here.'),'Nothing to change here.');
});

test('job errors go through the per-request rewrite; outside a request they stay',()=>{
 setClientTextRewrite(text=>text);
 assert.equal(clientText('Higgsfield failed.'),'Higgsfield failed.');
 setClientTextRewrite(plainProviderText);
 assert.ok(!namesProvider(clientText('Higgsfield failed.')));
 assert.equal(clientText(undefined),undefined);
 setClientTextRewrite(text=>text);
});

test('server errors, job errors and diagnostics pass through the client rewrite',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 assert.match(read('lib/studio-server.ts'),/enterProviderScope\(providerNamesVisible\(got\.ctx\)\)/);
 assert.match(read('lib/studio-server.ts'),/error:forClient\(error\.message\)/);
 for(const file of ['lib/films.ts','lib/swaps.ts','lib/image-server.ts','lib/topaz-server.ts'])assert.match(read(file),/error:clientText\(/,file);
 assert.match(read('lib/visual-library.ts'),/error:clientText\(v\.error\)/);
 assert.match(read('app/api/swaps/[id]/diagnostic/route.ts'),/reason:forClient\(/);
 // The original words stay in the server log.
 assert.match(read('lib/provider-scope.ts'),/console\.info\('Provider message shown in plain words'/);
});
