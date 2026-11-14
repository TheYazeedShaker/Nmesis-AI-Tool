// Sign-in flows end to end: the built Studio (`next start`, after `npm run build`)
// against a MOCKED Supabase Auth (./auth-mock.mjs) that, like the real service,
// revokes every session when the admin API sets a password. Not a hosted project.
// Checks: invitation → choose password → workspace in one go; recovery → choose
// password → workspace; skip, then the card returns on the next link sign-in;
// the same answer for a known and an unknown address.
// usage: npm run build && node scripts/verify/signin-flow.mjs [--keep]
//   --keep leaves the Studio and the mock running (for screenshots) and prints
//   their addresses; stop it with Ctrl+C.
import {spawn} from 'node:child_process';
import {startAuthMock} from './auth-mock.mjs';
const PORT=Number(process.env.STUDIO_PORT)||3917,ORIGIN='http://localhost:'+PORT,keep=process.argv.includes('--keep');
const auth=await startAuthMock();
const studio=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(PORT)],{env:{...process.env,SUPABASE_URL:auth.url,SUPABASE_PUBLISHABLE_KEY:'mock-publishable-key',SUPABASE_SECRET_KEY:'mock-secret-key',STUDIO_GOOGLE_SIGNIN:'off'},stdio:['ignore','pipe','pipe']});
let output='';studio.stdout.on('data',d=>output+=d);studio.stderr.on('data',d=>output+=d);
const stop=()=>{studio.kill();auth.server.close()};
for(let i=0;;i++){try{if((await fetch(ORIGIN+'/signin')).ok)break}catch{/* not listening yet */}if(i>120){console.error(output);stop();process.exit(1)}await new Promise(r=>setTimeout(r,500))}
// A browser's cookie jar, enough for these flows (Secure cookies are kept: this is localhost).
function browser(){
 const jar=new Map();
 const take=r=>{for(const line of r.headers.getSetCookie()){const [pair,...attrs]=line.split(';');const i=pair.indexOf('=');const name=pair.slice(0,i).trim(),value=pair.slice(i+1).trim();const gone=attrs.some(a=>/^\s*max-age=0\b/i.test(a)||(/^\s*expires=/i.test(a)&&Date.parse(a.split('=')[1])<Date.now()));if(gone||!value)jar.delete(name);else jar.set(name,value)}};
 const go=async(method,path,body)=>{const r=await fetch(new URL(path,ORIGIN),{method,redirect:'manual',headers:{origin:ORIGIN,cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...body?{'content-type':'application/json'}:{}},...body?{body:JSON.stringify(body)}:{}});take(r);const text=await r.text();let data=null;try{data=JSON.parse(text)}catch{data=null}return {status:r.status,location:r.headers.get('location')?new URL(r.headers.get('location'),ORIGIN).pathname+new URL(r.headers.get('location'),ORIGIN).search:null,text,data}};
 return {jar,get:p=>go('GET',p),post:(p,b)=>go('POST',p,b)};
}
let failures=0;const check=(ok,what,detail='')=>{console.log((ok?'PASS ':'FAIL ')+what+(ok||!detail?'':'  ['+detail+']'));if(!ok)failures++};
const tokenOf=b=>{const v=[...b.jar].filter(([k])=>k.includes('auth-token')).map(([,v])=>v).join('');try{const raw=decodeURIComponent(v);const json=JSON.parse(raw.startsWith('base64-')?Buffer.from(raw.slice(7),'base64url').toString():raw);return json.access_token}catch{return null}};
console.log('Sign-in flows against a MOCKED Supabase Auth (scripts/verify/auth-mock.mjs), Studio built with `next build`, served by `next start`.\n');
try{
 // 1. Invitation → choose password → workspace, in one go.
 {const b=browser(),email='invited@example.test',{link,session,user}=auth.invite(email,ORIGIN+'/');
  check(link.includes('#access_token=')&&link.includes('type=invite'),'1. the admin\'s invitation link carries the session after the #');
  let r=await b.get('/');check(r.status===303&&r.location.startsWith('/signin'),'1. opening the Studio address redirects to sign in (the # stays in the browser)',r.status+' '+r.location);
  r=await b.post('/api/auth/session',{accessToken:session.access_token,refreshToken:session.refresh_token,type:'invite',next:'/'});
  check(r.status===200&&r.data?.next==='/auth/password','1. the page hands the tokens over; the server says: choose your password',r.status+' '+r.text);
  r=await b.get('/');check(r.status===303&&r.location==='/auth/password','1. the workspace holds at "Choose your password"',r.status+' '+r.location);
  r=await b.get('/auth/password');check(r.status===200&&r.text.includes('Choose your password')&&r.text.includes(email),'1. "Choose your password" shows the account');
  r=await b.post('/api/auth/choose-password',{password:'short',confirm:'short'});check(r.status===400&&r.data?.error==='That is 5 characters. It needs at least 10.','1. too short: a plain sentence',r.text);
  r=await b.post('/api/auth/choose-password',{password:email,confirm:email});check(r.status===400&&/your email address/.test(r.data?.error),'1. the email address is refused',r.text);
  const before=tokenOf(b);
  r=await b.post('/api/auth/choose-password',{password:'a sturdy passphrase',confirm:'a sturdy passphrase',next:'/'});check(r.status===200&&r.data?.next==='/'&&!r.data?.signInAgain,'1. password saved and a fresh session swapped in',r.status+' '+r.text);
  check(auth.users.get(user.id).app_metadata.nmesis_password_set===true,'1. "has a password" recorded in app_metadata');
  const old=await fetch(auth.url+'/auth/v1/user',{headers:{authorization:'Bearer '+before,apikey:'x'}});const oldBody=await old.json();
  check(old.status===403&&oldBody.msg==='Session from session_id claim in JWT does not exist','1. (the admin password change revoked the old session, as Supabase does)',old.status+' '+JSON.stringify(oldBody));
  check(tokenOf(b)&&tokenOf(b)!==before,'1. the browser now holds the new session');
  r=await b.get('/');check(r.status===200,'1. the next request reaches the workspace (no "session_id … does not exist")',r.status+' '+r.location);
 }
 // 2. Recovery → choose password → workspace.
 {const b=browser(),email='recovering@example.test';const user=auth.addUser(email,'the old long password',{nmesis_password_set:true});
  let r=await b.post('/api/auth/recover',{email});check(r.status===200&&r.data?.said?.startsWith('If that address has a Studio account'),'2. "Forgot your password?" answers its one sentence',r.text);
  const link=auth.lastLink(email,'recovery');check(!!link&&link.startsWith(ORIGIN+'/auth/callback?code='),'2. the recovery email links back to the Studio with a code',String(link));
  r=await b.get(link.slice(ORIGIN.length));check(r.status===303&&r.location==='/auth/password','2. the recovery link stops at "Choose your password" though a password exists',r.status+' '+r.location);
  r=await b.get('/');check(r.status===303&&r.location==='/auth/password','2. the workspace holds at the card');
  r=await b.post('/api/auth/choose-password',{password:'a brand new passphrase',confirm:'a brand new passphrase'});check(r.status===200&&r.data?.next==='/','2. new password saved, fresh session',r.text);
  r=await b.get('/');check(r.status===200,'2. workspace',r.status+' '+r.location);
  const b2=browser();r=await b2.post('/api/auth/password',{email,password:'a brand new passphrase'});check(r.status===200&&r.data?.next==='/','2. the new password signs in');
  r=await b2.post('/api/auth/password',{email,password:'the old long password'});check(r.status===401&&r.data?.error==='That email address and password do not go together.','2. the old one does not, in a plain sentence',r.text);
  void user;
 }
 // 3. Skip, then the card returns next time.
 {const b=browser(),email='linkonly@example.test';auth.addUser(email,null,{});
  let r=await b.post('/api/auth/magic',{email});check(r.status===200,'3. a sign-in link is emailed');
  r=await b.get(auth.lastLink(email,'magiclink').slice(ORIGIN.length));check(r.status===303&&r.location==='/auth/password','3. no password yet: the link stops at the card',r.status+' '+r.location);
  r=await b.post('/api/auth/skip-password',{next:'/'});check(r.status===200&&r.data?.next==='/','3. "Skip, I\'ll use email links"');
  r=await b.get('/');check(r.status===200,'3. workspace after skipping',r.status+' '+r.location);
  r=await b.post('/auth/signout');check(r.status===303&&r.location.startsWith('/signin'),'3. sign out');
  r=await b.get('/');check(r.status===303&&r.location.startsWith('/signin'),'3. signed out: back to sign in');
  r=await b.post('/api/auth/magic',{email});r=await b.get(auth.lastLink(email,'magiclink').slice(ORIGIN.length));check(r.status===303&&r.location==='/auth/password','3. next sign-in by link: the card returns',r.status+' '+r.location);
 }
 // 4. The same answer for a known and an unknown address.
 {const known=browser(),unknown=browser();auth.addUser('known@example.test','a long known password',{nmesis_password_set:true});
  const a=await known.post('/api/auth/recover',{email:'known@example.test'}),c=await unknown.post('/api/auth/recover',{email:'nobody-here@example.test'});
  check(a.status===c.status&&a.text===c.text,'4. recovery: identical answer for a known and an unknown address',a.text+' | '+c.text);
  const m=await known.post('/api/auth/magic',{email:'known@example.test'}),n=await unknown.post('/api/auth/magic',{email:'nobody-here@example.test'});
  check(m.status===n.status&&m.text===n.text,'4. sign-in link: identical answer for a known and an unknown address',m.text+' | '+n.text);
  check(!auth.lastLink('nobody-here@example.test'),'4. (and nothing was sent to the unknown address)');
 }
 // Plain sentences, never Supabase's own words.
 {const b=browser();let r=await b.get('/auth/callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');check(r.status===303&&r.location==='/signin?problem=link_invalid','an expired link becomes a plain sentence',r.location);
  r=await b.get('/signin?problem=link_invalid');check(r.text.includes('That link has expired or has already been used. Ask for a new one.')&&!r.text.includes('Email link is invalid'),'the sign-in page shows the plain sentence only');
  r=await b.get('/auth/callback?code=made-up-code');check(r.status===303&&/^\/signin\?problem=(other_browser|link_invalid)$/.test(r.location),'a code from another browser is refused plainly',r.location);
 }
}catch(e){failures++;console.error('FAIL (crashed)',e)}
console.log('\n'+(failures?failures+' check(s) failed.':'All checks passed.'));
console.log('Mock Auth requests: '+auth.log.length+' ('+[...new Set(auth.log)].join(', ')+')');
if(keep){console.log('\nKept running: Studio '+ORIGIN+' · mock Auth '+auth.url);globalThis.auth=auth}else{stop();process.exit(failures?1:0)}
