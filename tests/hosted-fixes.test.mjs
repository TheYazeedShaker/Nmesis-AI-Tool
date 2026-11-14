// S2.1, fixes from the first hosted run: where sign-in links return to, the
// KEY_ENCRYPTION_SECRET rule, a provider account with no credit, and the staff
// six-digit code helpers. Route-level checks are in tests/accounts-access.test.mjs
// and tests/image-server.test.mjs; the setup SQL as a non-superuser is in
// tests/postgres.test.mjs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {publicOrigin,resolveLinkOrigin} from '../lib/auth/origin.ts';
import {validKeySecret,keySecretState,requireKeySecret,KeyStorageMisconfigured,sealKey} from '../lib/secret-crypto.ts';
import {outOfCredit,noCreditMessage,readProviderError} from '../lib/provider-credit.ts';
import {qrImageSrc,groupedSecret,pickFactor,cleanCode} from '../lib/auth/mfa.ts';

const REQ='https://studio-abc123-team.vercel.app/api/auth/magic';
test('sign-in links: STUDIO_PUBLIC_ORIGIN wins when valid',()=>{
 assert.equal(resolveLinkOrigin(REQ,{STUDIO_PUBLIC_ORIGIN:'https://studio.example.com',VERCEL_ENV:'production',VERCEL_PROJECT_PRODUCTION_URL:'other.example.com'}),'https://studio.example.com');
 assert.equal(resolveLinkOrigin(REQ,{STUDIO_PUBLIC_ORIGIN:' https://Studio.Example.com/ '}),'https://studio.example.com','trailing slash and case are normalised');
 assert.equal(resolveLinkOrigin(REQ,{STUDIO_PUBLIC_ORIGIN:'https://studio.example.com:8443'}),'https://studio.example.com:8443');
});
test('sign-in links: production uses the project production address, a preview its branch address',()=>{
 assert.equal(resolveLinkOrigin(REQ,{VERCEL_ENV:'production',VERCEL_PROJECT_PRODUCTION_URL:'studio.example.com',VERCEL_BRANCH_URL:'branch.example.com'}),'https://studio.example.com');
 assert.equal(resolveLinkOrigin(REQ,{VERCEL_ENV:'preview',VERCEL_PROJECT_PRODUCTION_URL:'studio.example.com',VERCEL_BRANCH_URL:'studio-git-development-team.vercel.app'}),'https://studio-git-development-team.vercel.app');
});
test('sign-in links: otherwise (local development) the request origin',()=>{
 assert.equal(resolveLinkOrigin('http://localhost:3000/api/auth/recover',{}),'http://localhost:3000');
 assert.equal(resolveLinkOrigin('http://localhost:3000/api/auth/recover',{VERCEL_ENV:'development'}),'http://localhost:3000');
 assert.equal(resolveLinkOrigin(REQ,{VERCEL_ENV:'preview'}),'https://studio-abc123-team.vercel.app','a preview without a branch address falls back');
});
test('sign-in links: invalid values are refused, never trusted (one log line, no value)',()=>{
 for(const bad of ['http://studio.example.com','https://studio.example.com/path','https://studio.example.com?x=1','https://user:pass@studio.example.com','javascript:alert(1)','studio.example.com','https://exa mple.com','https://studio.example.com#frag'])assert.equal(publicOrigin(bad),null,bad);
 const lines=[],error=console.error;console.error=(...a)=>lines.push(a.join(' '));
 try{
  assert.equal(resolveLinkOrigin(REQ,{STUDIO_PUBLIC_ORIGIN:'http://evil.example.com/x',VERCEL_ENV:'preview',VERCEL_BRANCH_URL:'branch.example.com'}),'https://branch.example.com');
  assert.equal(resolveLinkOrigin(REQ,{STUDIO_PUBLIC_ORIGIN:'http://evil.example.com/x'}),'https://studio-abc123-team.vercel.app');
 }finally{console.error=error}
 assert.equal(lines.length,1);assert.match(lines[0],/STUDIO_PUBLIC_ORIGIN/);assert.ok(!lines[0].includes('evil'));
 assert.equal(resolveLinkOrigin(REQ,{VERCEL_ENV:'production',VERCEL_PROJECT_PRODUCTION_URL:'evil.example.com/path'}),'https://studio-abc123-team.vercel.app','a malformed system value is ignored');
});

test('KEY_ENCRYPTION_SECRET: exactly 64 hex characters; anything else is "misconfigured"',async()=>{
 const good=randomBytes(32).toString('hex');
 assert.equal(validKeySecret(good),true);assert.equal(validKeySecret(good.toUpperCase()),true);
 for(const bad of ['k'.repeat(48),good.slice(1),good+'0',randomBytes(32).toString('base64'),'g'.repeat(64),''])assert.equal(validKeySecret(bad),false,bad.length+' characters');
 const lines=[],error=console.error,before=process.env.KEY_ENCRYPTION_SECRET;console.error=(...a)=>lines.push(a.join(' '));
 try{
  const value='this-is-not-hex-'+'q'.repeat(30);process.env.KEY_ENCRYPTION_SECRET=value;
  assert.deepEqual({...keySecretState()},{raw:value,value:undefined,misconfigured:true});
  keySecretState();keySecretState();
  assert.equal(lines.length,1,'checked once per process');assert.match(lines[0],/KEY_ENCRYPTION_SECRET must be exactly 64 hex characters \(32 bytes\)/);assert.ok(!lines[0].includes(value));
  assert.throws(()=>requireKeySecret(undefined),e=>e instanceof KeyStorageMisconfigured&&e.status===503&&e.message==='Secure key storage is misconfigured.');
  assert.throws(()=>requireKeySecret('short'),KeyStorageMisconfigured);
  assert.equal(keySecretState(' '+good+'\n').value,good,'surrounding whitespace is ignored');
  assert.doesNotThrow(()=>requireKeySecret(good));
  delete process.env.KEY_ENCRYPTION_SECRET;
  assert.equal(keySecretState().misconfigured,false,'unset is not misconfigured (the caller says "not ready")');assert.doesNotThrow(()=>requireKeySecret(undefined));
 }finally{console.error=error;if(before===undefined)delete process.env.KEY_ENCRYPTION_SECRET;else process.env.KEY_ENCRYPTION_SECRET=before}
 await assert.rejects(()=>sealKey('x','k'.repeat(64),'id'),/Invalid wrapping secret/);
});
test('npm run check:setup names the KEY_ENCRYPTION_SECRET rule and never prints the value',()=>{
 const run=env=>{const r=spawnSync(process.execPath,['scripts/check-setup.mjs','--offline'],{env:{PATH:process.env.PATH,SYSTEMROOT:process.env.SYSTEMROOT,...env},encoding:'utf8'});return {status:r.status,out:r.stdout+r.stderr}};
 const bad=run({KEY_ENCRYPTION_SECRET:'not-a-hex-secret-'+'w'.repeat(30),STUDIO_PUBLIC_ORIGIN:'https://studio.example.com'});
 assert.equal(bad.status,1);assert.match(bad.out,/KEY_ENCRYPTION_SECRET must be exactly 64 hex characters \(32 bytes\), e\.g\. the output of openssl rand -hex 32/);assert.ok(!bad.out.includes('w'.repeat(30)));
 const ok=run({KEY_ENCRYPTION_SECRET:randomBytes(32).toString('hex'),STUDIO_PUBLIC_ORIGIN:'https://studio.example.com'});
 assert.ok(!/KEY_ENCRYPTION_SECRET must be/.test(ok.out),'a valid secret passes the rule');assert.ok(!/STUDIO_PUBLIC_ORIGIN must be/.test(ok.out));
 assert.match(run({STUDIO_PUBLIC_ORIGIN:'http://studio.example.com/x'}).out,/STUDIO_PUBLIC_ORIGIN must be an https address with no path/);
});

test('no credit: each provider\'s own billing codes, and plain rate limits stay rate limits',()=>{
 assert.equal(noCreditMessage('openai'),'Your OpenAI account has no credit left. Add credit at OpenAI, then try again. Nothing was charged here.');
 const openai=(status,error)=>outOfCredit('openai',{status,...readProviderError({error})});
 assert.equal(openai(429,{code:'insufficient_quota',type:'insufficient_quota',message:'You exceeded your current quota, please check your plan and billing details.'}),true);
 assert.equal(openai(400,{code:'billing_hard_limit_reached',message:'Billing hard limit has been reached'}),true);
 assert.equal(openai(403,{message:'Your billing is not active.'}),true);
 assert.equal(openai(402,{}),true);
 assert.equal(openai(429,{code:'rate_limit_exceeded',message:'Rate limit reached for requests per minute.'}),false);
 assert.equal(openai(403,{code:'insufficient_permissions',message:'Missing scopes: api.images.write'}),false);
 assert.equal(openai(400,{code:'invalid_value',message:'Invalid size.'}),false);
 const google=(status,error)=>outOfCredit('google',{status,...readProviderError({error})});
 assert.equal(google(429,{status:'RESOURCE_EXHAUSTED',message:'Your prepayment credits are depleted. Please go to AI Studio to manage your project and billing.'}),true);
 assert.equal(google(400,{status:'FAILED_PRECONDITION',message:'Billing is not enabled for this project.'}),true);
 assert.equal(google(403,{status:'PERMISSION_DENIED',details:[{reason:'BILLING_DISABLED'}],message:'This API method requires billing to be enabled.'}),true);
 assert.equal(google(429,{status:'RESOURCE_EXHAUSTED',message:'You exceeded your current quota, please check your plan and billing details.'}),false,'a per-minute quota is not "no credit"');
 assert.equal(outOfCredit('higgsfield',{status:402}),true);
 assert.equal(outOfCredit('higgsfield',{status:429,...readProviderError({code:'insufficient_credits'})}),true);
 assert.equal(outOfCredit('higgsfield',{status:429,...readProviderError({detail:'Too many requests'})}),false);
 assert.equal(outOfCredit('topaz',{status:402}),true);
 assert.equal(outOfCredit('topaz',{status:403,...readProviderError({message:'Insufficient credits balance'})}),true);
 assert.equal(outOfCredit('topaz',{status:401,...readProviderError({message:'Invalid API key'})}),false);
 for(const p of ['google','higgsfield','topaz'])assert.match(noCreditMessage(p),/^Your .+ account has no credit left\. Add credit .+, then try again\. Nothing was charged here\.$/);
});

test('six-digit code: the QR code becomes an encoded data URL; the key can be typed instead',()=>{
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h1v1H0z" fill="#000"/></svg>';
 const expected='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
 assert.equal(qrImageSrc(svg),expected,'raw SVG markup');
 assert.equal(qrImageSrc('data:image/svg+xml;utf-8,'+svg),expected,'an unencoded data URL is re-encoded');
 assert.equal(qrImageSrc(expected),expected,'an encoded one stays the same');
 for(const bad of ['<script>alert(1)</script>','data:text/html,<svg></svg>','javascript:alert(1)',null,42])assert.equal(qrImageSrc(bad),null);
 assert.equal(groupedSecret('jbswy3dpehpk3pxpjbswy3dp'),'JBSW Y3DP EHPK 3PXP JBSW Y3DP');assert.equal(groupedSecret('not a secret!'),'');
 assert.equal(cleanCode(' 123 456 '),'123456');for(const bad of ['12345','1234567','abcdef',123456])assert.equal(cleanCode(bad),'');
 const factors=[{id:'f-new',factor_type:'totp',status:'unverified'},{id:'f-phone',factor_type:'phone',status:'verified'},{id:'f-app',factor_type:'totp',status:'verified'}];
 assert.equal(pickFactor(factors)?.id,'f-app','the verified authenticator app');
 assert.equal(pickFactor(factors,'f-new')?.id,'f-new','the one being added');
 assert.equal(pickFactor(factors,'f-phone'),null,'never another kind of factor');assert.equal(pickFactor(factors,'someone-elses'),null);
 assert.equal(pickFactor([{id:'f-new',factor_type:'totp',status:'unverified'}]),null);
});
