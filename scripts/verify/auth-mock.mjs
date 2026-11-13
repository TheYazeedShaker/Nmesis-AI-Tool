// A small stand-in for Supabase Auth (GoTrue), for scripts/verify/signin-flow.mjs
// only. It answers the endpoints the Studio uses and behaves like the real
// service where it matters for sign-in:
//  - every session is revoked when the admin API sets a user's password, after
//    which /user answers 403 "Session from session_id claim in JWT does not exist";
//  - emailed links are recorded instead of sent (PKCE: redirect_to?code=…; an
//    invitation from the admin: STUDIO_URL#access_token=…&type=invite);
//  - /otp and /recover answer the same whether or not the address exists.
// Tokens are JWT-shaped but not signed; nothing here is a security boundary.
import http from 'node:http';
import {createHash,randomUUID} from 'node:crypto';
const b64=v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url');
export function startAuthMock({port=0}={}){
 const users=new Map(),sessions=new Map(),refresh=new Map(),flows=new Map(),outbox=[],log=[];
 const byEmail=email=>[...users.values()].find(u=>u.email===String(email||'').toLowerCase());
 const publicUser=u=>({id:u.id,aud:'authenticated',role:'authenticated',email:u.email,email_confirmed_at:u.confirmed?new Date().toISOString():null,app_metadata:{provider:'email',providers:['email'],...u.app_metadata},user_metadata:u.user_metadata||{},created_at:u.created,updated_at:new Date().toISOString(),identities:[]});
 function session(u){
  const sid=randomUUID(),now=Math.floor(Date.now()/1000),exp=now+3600;
  const access=b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:u.id,email:u.email,role:'authenticated',aud:'authenticated',session_id:sid,iat:now,exp,aal:'aal1'})+'.'+b64('mock-signature');
  const rt=randomUUID().replace(/-/g,'');sessions.set(sid,u.id);refresh.set(rt,sid);
  return {access_token:access,token_type:'bearer',expires_in:3600,expires_at:exp,refresh_token:rt,user:publicUser(u)};
 }
 const claims=token=>{try{return JSON.parse(Buffer.from(String(token).split('.')[1],'base64url').toString())}catch{return null}};
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://x'),path=url.pathname.replace(/^\/auth\/v1/,'');
  const chunks=[];for await(const c of req)chunks.push(c);let body={};try{body=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{}}catch{body={}}
  log.push(req.method+' '+path+(url.searchParams.get('grant_type')?'?grant_type='+url.searchParams.get('grant_type'):''));
  const send=(code,data)=>{res.writeHead(code,{'content-type':'application/json','x-supabase-api-version':'2024-01-01'});res.end(data===undefined?'':JSON.stringify(data))};
  const fail=(code,error_code,msg)=>send(code,{code:error_code,error_code,msg,message:msg});
  const bearer=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(req.method==='POST'&&path==='/token'){
   const grant=url.searchParams.get('grant_type');
   if(grant==='password'){const u=byEmail(body.email);if(!u||!u.password||u.password!==body.password)return fail(400,'invalid_credentials','Invalid login credentials');return send(200,session(u))}
   if(grant==='pkce'){const f=flows.get(body.auth_code);flows.delete(body.auth_code);if(!f)return fail(404,'flow_state_not_found','invalid flow state, no valid flow state found');if(createHash('sha256').update(String(body.code_verifier)).digest('base64url')!==f.challenge)return fail(400,'bad_code_verifier','code challenge does not match previously saved code verifier');return send(200,session(users.get(f.user)))}
   if(grant==='refresh_token'){const sid=refresh.get(body.refresh_token);if(!sid||!sessions.has(sid))return fail(400,'refresh_token_not_found','Invalid Refresh Token: Refresh Token Not Found');refresh.delete(body.refresh_token);return send(200,session(users.get(sessions.get(sid))))}
   return fail(400,'unsupported_grant_type','unsupported grant type');
  }
  if(req.method==='GET'&&path==='/user'){const c=claims(bearer);if(!c?.session_id||!sessions.has(c.session_id))return fail(403,'session_not_found','Session from session_id claim in JWT does not exist');return send(200,publicUser(users.get(c.sub)))}
  if(req.method==='POST'&&path==='/logout'){const c=claims(bearer);if(c?.session_id)sessions.delete(c.session_id);res.writeHead(204);return res.end()}
  if(req.method==='POST'&&(path==='/otp'||path==='/recover')){
   const u=byEmail(body.email),to=url.searchParams.get('redirect_to')||'';
   if(u&&body.code_challenge){const code=randomUUID();flows.set(code,{user:u.id,challenge:body.code_challenge});outbox.push({to:u.email,kind:path==='/otp'?'magiclink':'recovery',link:to+(to.includes('?')?'&':'?')+'code='+code})}
   return send(200,{});
  }
  // Mock-only helpers for screenshots (--keep): the last emailed link, and an invitation.
  if(req.method==='GET'&&path==='/__outbox')return send(200,{link:api.lastLink(url.searchParams.get('email')||'')||null});
  if(req.method==='GET'&&path==='/__invite')return send(200,{link:api.invite(url.searchParams.get('email')||'invited@example.test',url.searchParams.get('landing')||'').link});
  const admin=/^\/admin\/users\/([0-9a-f-]{36})$/.exec(path);
  if(admin){
   if(bearer!=='mock-secret-key')return fail(401,'no_authorization','This endpoint requires a valid secret key');
   const u=users.get(admin[1]);if(!u)return fail(404,'user_not_found','User not found');
   if(req.method==='GET')return send(200,publicUser(u));
   if(req.method==='PUT'){
    if(typeof body.password==='string'){u.password=body.password;for(const [sid,uid] of sessions)if(uid===u.id)sessions.delete(sid)}// the real service revokes them all
    if(body.app_metadata)u.app_metadata={...body.app_metadata};
    return send(200,publicUser(u));
   }
  }
  return fail(404,'not_found','Not found');
 });
 const api={users,sessions,outbox,log,
  // The Nmesis admin's invitation: an account without a password, and a link with
  // the session after the # (Supabase's implicit flow for admin invitations).
  invite(email,landing){const u={id:randomUUID(),email:email.toLowerCase(),password:null,app_metadata:{},confirmed:true,created:new Date().toISOString()};users.set(u.id,u);const s=session(u);const link=landing+'#'+new URLSearchParams({access_token:s.access_token,expires_at:String(s.expires_at),expires_in:'3600',refresh_token:s.refresh_token,token_type:'bearer',type:'invite'});outbox.push({to:u.email,kind:'invite',link});return {user:u,link,session:s}},
  addUser(email,password,app_metadata={}){const u={id:randomUUID(),email:email.toLowerCase(),password,app_metadata,confirmed:true,created:new Date().toISOString()};users.set(u.id,u);return u},
  lastLink(email,kind){return [...outbox].reverse().find(m=>m.to===email.toLowerCase()&&(!kind||m.kind===kind))?.link},
 };
 return new Promise(r=>server.listen(port,'127.0.0.1',()=>r({...api,server,url:'http://127.0.0.1:'+server.address().port})));
}
