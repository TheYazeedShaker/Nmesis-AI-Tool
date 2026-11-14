// Credits (PR S3), with the real lib/credits modules over the SQLite stand-in for
// the admin's ledger (tests/support/credits-ledger.mjs): a fake clock, emails
// mocked. The same statements run on Postgres in tests/postgres.test.mjs, which
// also proves the concurrency with real parallel transactions (V1).
// V1 exactly-N · V2 failure releases · V3 80% / 100% · V4 billing day and packs ·
// V5 own keys record 0 credits; other companies cannot use own keys.
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {register} from 'node:module';
register('../scripts/verify/hooks.mjs',import.meta.url);
import {sqliteDatabase} from './support/state.mjs';
const pricing=await import('../lib/credits/pricing.ts');
const charge=await import('../lib/credits/charge.ts');
const alerts=await import('../lib/credits/alerts.ts');
const {clearPriceBookCache}=await import('../lib/credits/store.ts');
const {StudioError}=await import('../lib/studio-server.ts');
const {NO_CREDIT_STATUS,noCreditMessage}=await import('../lib/provider-credit.ts');
const ORG='0000000a-0000-4000-8000-00000000000a',NMESIS='00000001-0000-4000-8000-000000000001';
const OWNER='00000000-0000-4000-8000-0000000000a1',CREATOR='00000000-0000-4000-8000-0000000000a2';
const mails=[];
beforeEach(()=>{mails.length=0;alerts.setMailer(async m=>{mails.push(m)});alerts.resetAlertsForTests();clearPriceBookCache()});
function company({monthly=100,startsOn='2026-11-01',kind='client',now=Date.parse('2026-11-14T10:00:00Z')}={}){
 const clock={now:()=>now,set(t){now=typeof t==='number'?t:Date.parse(t)}};
 const db=sqliteDatabase({clock}),org=kind==='internal'?NMESIS:ORG;
 if(kind!=='internal')db.ledger.allowance(org,monthly,startsOn);
 db.ledger.person(org,OWNER,'owner','owner@example.test');db.ledger.person(org,CREATOR,'creator','creator@example.test');
 const ctx={DB:db,org,userId:CREATOR,role:'creator',entitlements:{legacy:false,status:'active',planId:'growth',planName:'Growth',endsOn:null,features:{'studio.enabled':true}},account:{org:{id:org,name:'Demo Co',kind},viewingAs:false}};
 return {db,ctx,clock,ledger:db.ledger};
}
const spend=(extra={})=>({tool:'studio.key_visuals',action:'Key visual',provider:'openai',own:false,cost:{micros:400_000},...extra});
const holds=db=>db.raw.prepare('SELECT status,credits,charged,billing FROM credit_holds ORDER BY created_at').all().map(r=>({...r}));

test('pricing: ceil(provider cost ÷ 0.04), the cost table overridable from the price book, bad entries ignored',()=>{
 assert.equal(pricing.creditsFor(400_000),10);assert.equal(pricing.creditsFor(400_001),11);assert.equal(pricing.creditsFor(1),1);assert.equal(pricing.creditsFor(0),0);
 assert.equal(pricing.creditsForKey('openai.image.2k'),8,'0.30 → 8');
 const book=pricing.readPriceBook([{key:'credit_basis',value:0.05},{key:'studio_cost.openai.image.2k',value:0.5},{key:'studio_cost.unknown',value:9},{key:'studio_cost.google.text',value:-1},{key:'credit_retail',value:0.12}]);
 assert.equal(book.basisMicros,50_000);assert.equal(pricing.creditsForKey('openai.image.2k',book),10);assert.equal(book.costs['google.text'],20_000,'a negative price is ignored');
 assert.equal(pricing.sizeTier('1536x864'),'1k');assert.equal(pricing.sizeTier('2048x1152'),'2k');assert.equal(pricing.sizeTier('3840x2160'),'4k');
 assert.equal(pricing.googleImageCost('gemini-3-pro-image','3840x2160'),'google.image.pro.4k');assert.equal(pricing.topazCost(7680),'topaz.upscale.8k');
});

test('V1: 20 actions at once against a balance that fits 10: exactly 10 succeed, the ledger and holds add up',async()=>{
 const {db,ctx,ledger}=company({monthly:100});
 let provider=0;
 const results=await Promise.allSettled(Array.from({length:20},()=>charge.charged(ctx,spend(),async()=>{provider++;return 'image'})));
 const ok=results.filter(r=>r.status==='fulfilled'),refused=results.filter(r=>r.status==='rejected');
 assert.equal(ok.length,10);assert.equal(refused.length,10);assert.equal(provider,10,'the provider is called only for the 10 that hold credits');
 for(const r of refused){assert.equal(r.reason.status,402);assert.equal(r.reason.message,pricing.CREDITS_USED)}
 for(const r of ok)assert.equal(r.value.credits,10);
 const rows=ledger.rows(ORG);assert.equal(rows.length,10);assert.equal(rows.reduce((s,r)=>s-r.credits,0),100);assert.ok(rows.every(r=>r.provider==='openai'&&r.provider_cost_usd===0.4&&r.actor===CREATOR&&r.feature_key==='studio.key_visuals'));
 assert.deepEqual(holds(db).map(h=>h.status).sort(),Array(10).fill('settled'),'ten holds, all settled; refusals wrote none');
 assert.equal(ledger.balance(ORG).total,0);
});

test('V2: a provider failure releases the hold and charges nothing; on Nmesis\'s key a "no credit" refusal tells Nmesis',async()=>{
 const {db,ctx,ledger}=company({monthly:100});
 process.env.NMESIS_ALERT_EMAIL='ops@example.test';
 try{
  await assert.rejects(()=>charge.charged(ctx,spend(),async()=>{throw new StudioError('OpenAI could not complete this request.',502)}),/could not complete/);
  assert.deepEqual(holds(db).map(h=>h.status),['released']);assert.equal(ledger.rows(ORG).length,0);assert.equal(ledger.balance(ORG).total,100);assert.equal(mails.length,0);
  // Nmesis's account has no credit: one plain sentence for the client, an alert for Nmesis, nothing charged.
  const refusal=()=>new StudioError(noCreditMessage('openai'),NO_CREDIT_STATUS);
  await assert.rejects(()=>charge.charged(ctx,spend(),async()=>{throw refusal()}),e=>e.status===503&&e.message===charge.nmesisProviderDown('openai'));
  assert.equal(mails.length,1);assert.deepEqual(mails[0].to,['ops@example.test']);assert.match(mails[0].subject,/OpenAI account has no credit/);
  await assert.rejects(()=>charge.charged(ctx,spend(),async()=>{throw refusal()}),e=>e.status===503);
  assert.equal(mails.length,1,'one alert per provider per 30 minutes');
  // On the company's own key the refusal is theirs: it is passed on as it was, and Nmesis is not alerted.
  await assert.rejects(()=>charge.charged(ctx,spend({own:true}),async()=>{throw refusal()}),e=>e.status===402&&e.message===noCreditMessage('openai'));
  assert.equal(mails.length,1);
  assert.ok(holds(db).every(h=>h.status==='released'));assert.equal(ledger.rows(ORG).length,0,'nothing was ever charged');
 }finally{delete process.env.NMESIS_ALERT_EMAIL}
});

test('V3: at 80% the owners get one email and the meter turns amber; at 100% one more, then paid actions stop',async()=>{
 const {ctx,db}=company({monthly:100});
 const levels=[];
 for(let i=1;i<=10;i++){await charge.charged(ctx,spend(),async()=>'ok');levels.push((await charge.storeOf(ctx).meter(ORG)).level)}
 assert.deepEqual(levels,[0,0,0,0,0,0,0,80,80,100]);
 assert.equal(mails.length,2,'one email at 80%, one at 100%');
 assert.deepEqual(mails.map(m=>m.to),[['owner@example.test'],['owner@example.test']],'to the owners only');
 assert.match(mails[0].subject,/80% used/);assert.match(mails[0].text,/Demo Co has used 80 of its 100/);assert.match(mails[1].subject,/for this month are used/);
 for(const m of mails)assert.doesNotMatch(m.text,/\$|USD|provider/i,'credits only, never a provider cost');
 await assert.rejects(()=>charge.charged(ctx,spend(),async()=>'never'),e=>e.status===402&&e.message==='Your credits for this month are used. Ask Nmesis to add a pack.');
 const m=await charge.storeOf(ctx).meter(ORG);assert.deepEqual({used:m.used,left:m.left,percent:m.percent,level:m.level},{used:100,left:0,percent:100,level:100});
 assert.equal(db.raw.prepare('SELECT alert_level FROM credit_accounts WHERE org_id=?').get(ORG).alert_level,100);
 // Not enough for a bigger action names what is left.
 const c2=company({monthly:15});await charge.charged(c2.ctx,spend(),async()=>'ok');
 await assert.rejects(()=>charge.charged(c2.ctx,spend(),async()=>'never'),e=>e.message==='This needs 10 credits and your company has 5 left this month. Ask Nmesis to add a pack.');
});

test('V4: the allowance resets on the billing day; packs are used after it and expire on their own date (fake clock)',async()=>{
 const {ctx,ledger,clock}=company({monthly:20,startsOn:'2026-01-09',now:Date.parse('2026-03-09T10:00:00Z')});
 const meter=()=>charge.storeOf(ctx).meter(ORG);
 assert.deepEqual([(await meter()).periodFrom,(await meter()).periodTo,(await meter()).resetsOn],['2026-03-09','2026-04-08','2026-04-09']);
 await charge.charged(ctx,spend(),async()=>'ok');await charge.charged(ctx,spend(),async()=>'ok');
 await assert.rejects(()=>charge.charged(ctx,spend(),async()=>'never'),/credits for this month are used/,'allowance spent');
 const pack=ledger.pack(ORG,15,'2026-03-20','2026-03-10');
 const used=await charge.charged(ctx,spend(),async()=>'ok');assert.equal(used.credits,10,'the pack pays once the allowance is spent');
 assert.equal(ledger.rows(ORG).at(-1).pack_id,pack);assert.equal(ledger.balance(ORG).packs,5);
 clock.set('2026-03-21T10:00:00Z');
 assert.equal(ledger.balance(ORG).total,0,'the pack expired on its own date; its 5 credits are gone');
 await assert.rejects(()=>charge.charged(ctx,spend(),async()=>'never'),/credits for this month are used/);
 clock.set('2026-04-08T23:00:00Z');assert.equal(ledger.balance(ORG).total,0,'still the March period on the 8th');
 clock.set('2026-04-09T00:30:00Z');assert.equal(ledger.balance(ORG).total,20,'reset on the billing day');
 mails.length=0;
 await charge.charged(ctx,spend(),async()=>'ok');assert.equal(mails.length,0,'10 of 20: no warning');
 await charge.charged(ctx,spend(),async()=>'ok');
 assert.equal(mails.length,1,'warnings start again in the new period: 20 of 20 sends the "used" email (it skips past 80%)');assert.match(mails[0].subject,/for this month are used/);
 assert.equal((await meter()).periodFrom,'2026-04-09');
 // A subscription from the 31st: the period that starts on 31 March is the one the meter shows on that day.
 const end=company({monthly:20,startsOn:'2026-01-31',now:Date.parse('2026-03-31T12:00:00Z')});
 assert.equal((await charge.storeOf(end.ctx).meter(ORG)).periodFrom,'2026-03-31');
});

test('V5: the company\'s own key records 0 credits as "own key"; Nmesis\'s own workspace is recorded and never limited',async()=>{
 const {db,ctx,ledger}=company({monthly:0});
 assert.equal(ledger.balance(ORG).total,0);
 await assert.rejects(()=>charge.charged(ctx,spend(),async()=>'never'),/credits for this month are used/,'no credits, Nmesis\'s key: refused');
 const own=await charge.charged(ctx,spend({own:true}),async()=>'ok');assert.equal(own.credits,0);
 const row=ledger.rows(ORG).at(-1);assert.equal(row.credits,0);assert.equal(row.provider,'own key');assert.equal(row.provider_cost_usd,null,'not Nmesis\'s cost');
 assert.equal(holds(db).at(-1).billing,'own key');
 const n=company({kind:'internal'});
 const internal=await charge.charged(n.ctx,spend(),async()=>'ok');assert.equal(internal.credits,0);
 const nrow=n.ledger.rows(NMESIS).at(-1);assert.equal(nrow.credits,0);assert.equal(nrow.provider,'openai');assert.equal(nrow.provider_cost_usd,0.4,'Nmesis still sees its own cost');
});

test('V5: without studio.own_keys a stored company key is ignored (not deleted), Nmesis\'s key is used, and keys cannot be saved',async()=>{
 const {openaiKey,saveKey}=await import('../lib/credentials.ts');
 const {ignoredKeys,KEYS_NOT_ON_PLAN}=await import('../lib/org-keys.ts');
 const objects=new Map(),BUCKET={head:async k=>objects.has(k)?{}:null,get:async k=>objects.has(k)?{json:async()=>JSON.parse(objects.get(k))}:null,put:async(k,v)=>{objects.set(k,String(v))},delete:async k=>{objects.delete(k)}};
 const path=`orgs/${ORG}/keys/credentials/openai.json`;objects.set(path,JSON.stringify({sealed:'a key saved while the plan had own keys'}));
 const growth={legacy:false,status:'active',planId:'growth',planName:'Growth',endsOn:null,features:{'studio.enabled':true,'studio.own_keys':false}};
 const ctx={BUCKET,org:ORG,role:'owner',entitlements:growth,prefix:`orgs/${ORG}/users/${OWNER}/`,OPENAI_API_KEY:'nmesis-provided',KEY_ENCRYPTION_SECRET:'5e'.repeat(32)};
 assert.deepEqual(await openaiKey(ctx),{key:'nmesis-provided',own:false});
 assert.deepEqual(await ignoredKeys(ctx),['openai']);
 await assert.rejects(()=>saveKey(ctx,'sk-'+'x'.repeat(40)),e=>e.status===403&&e.message===KEYS_NOT_ON_PLAN);
 assert.ok(objects.has(path),'the stored key is kept');
 assert.deepEqual(await ignoredKeys({...ctx,entitlements:{...growth,features:{...growth.features,'studio.own_keys':true}}}),[],'with the feature back, nothing is ignored');
});
