import {cookies} from 'next/headers';
import {adminAuth,cookieOptions,serverAuth,toSessionUser,type SessionUser} from './supabase';
import {hasPassword,PASSWORD_FLAG,problemFor,safeNext,type Problem} from './words';
// The steps between "a link was opened" and "the workspace", decided on the server.
// Our own short-lived cookies, all httpOnly:
//  studio_link : which kind of email this browser last asked for ('recovery' or
//                'magic'), set when the email is sent, because a recovering person
//                already has a password and the flag alone would skip the card.
//  studio_step : 'password' while the "Choose your password" card is owed.
export const LINK_COOKIE='studio_link',STEP_COOKIE='studio_step';
const HOUR=60*60;
export async function markLink(kind:'recovery'|'magic'){(await cookies()).set(LINK_COOKIE,kind,{...cookieOptions(),maxAge:HOUR})}
export async function owePassword(){(await cookies()).set(STEP_COOKIE,'password',{...cookieOptions(),maxAge:HOUR*12})}
export async function clearSteps(){const jar=await cookies();jar.delete(LINK_COOKIE);jar.delete(STEP_COOKIE)}
// An invitation or a recovery link always stops at the card. The link type from
// the browser (an invitation's fragment) is only believed in the harmless
// direction: claiming "invite" shows the card; nothing can skip it, because
// otherwise the decision is the server's own (the recovery cookie, then the flag
// in app_metadata, which only the secret key can write).
export async function stepAfterLink(user:SessionUser,claimedType?:unknown):Promise<'password'|'workspace'>{
 const marked=(await cookies()).get(LINK_COOKIE)?.value;
 if(marked==='recovery'||claimedType==='invite'||claimedType==='recovery')return 'password';
 return hasPassword({app_metadata:user.appMetadata})?'workspace':'password';
}
// Finish a sign-in that arrived by link: remember the card if owed, and say where to go.
export async function landing(user:SessionUser,next:unknown,claimedType?:unknown){
 const step=await stepAfterLink(user,claimedType),dest=safeNext(next);
 const jar=await cookies();jar.delete(LINK_COOKIE);
 if(step==='password'){await owePassword();return '/auth/password'+(dest!=='/'?'?next='+encodeURIComponent(dest):'')}
 jar.delete(STEP_COOKIE);return dest;
}
// Set the password through the admin API (which revokes every session the user
// has), mark it in app_metadata, then start a fresh session with the new password
// (grant_type=password) and swap it in. Without the swap, the next request fails
// with "Session from session_id claim in JWT does not exist".
export async function setPasswordAndResume(user:SessionUser,password:string):Promise<{ok:true;resumed:boolean}|{ok:false;problem:Problem}>{
 const admin=adminAuth().auth.admin;
 const current=await admin.getUserById(user.id);
 if(current.error)return {ok:false,problem:problemFor(current.error)};
 const already=(current.data.user?.app_metadata||{}) as Record<string,unknown>;
 const saved=await admin.updateUserById(user.id,{password,app_metadata:{...already,[PASSWORD_FLAG]:true}});
 if(saved.error)return {ok:false,problem:problemFor(saved.error)};
 const fresh=await (await serverAuth()).auth.signInWithPassword({email:user.email,password});
 if(fresh.error||!fresh.data.session){
  // The password is saved; only the session is missing. Sign in again with it.
  console.warn('Sign-in: a fresh session could not be started after a password was set',fresh.error?.code||'no-session');
  await (await serverAuth()).auth.signOut({scope:'local'}).catch(()=>console.warn('Sign-in: local sign-out failed'));
  return {ok:true,resumed:false};
 }
 return {ok:true,resumed:!!toSessionUser(fresh.data.user)};
}
// Links in emails come back to the address the request was made on (each
// deployment's address must be in Supabase's redirect URL list).
export const linkOrigin=(request:Request)=>new URL(request.url).origin;
