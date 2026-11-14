// Sign-in rules and sentences, shared by the pages, the routes and the tests.
// Pure: no I/O. Never show Supabase's own wording; every refusal becomes one of
// these plain sentences.
export const PASSWORD_MIN=10;
// Set in app_metadata (only the secret key can write it) once a password is
// chosen; the same mark the Nmesis admin uses, because it is one account.
export const PASSWORD_FLAG='nmesis_password_set';
export const hasPassword=(user:{app_metadata?:Record<string,unknown>}|null|undefined)=>!!user?.app_metadata?.[PASSWORD_FLAG];
export const RECOVERY_SAID='If that address has a Studio account, an email with a link to choose a new password is on its way.';
export const MAGIC_SAID='If that address has a Studio account, an email with a sign-in link is on its way.';
export const NO_COMPANY='Your account isn\'t linked to a company yet. Ask your administrator.';
export const PROBLEMS={
 expired:'Your sign-in timed out. Start again.',
 bad_credentials:'That email address and password do not go together.',
 unconfirmed:'That address has not been confirmed yet. Open the link in your invitation email.',
 rate_limited:'Too many attempts. Wait a minute and try again.',
 link_invalid:'That link has expired or has already been used. Ask for a new one.',
 other_browser:'Open the link in the same browser you asked for it from, or ask for a new one.',
 unreachable:'Sign-in could not be reached. Try again in a moment.',
 not_configured:'Signing in is not set up on this Studio yet.',
 weak:'That password was not accepted. Choose a longer one.',
 same_password:'That is your current password. Choose a new one.',
 google_off:'Google sign-in is not available. Use your email address.',
 bad_code:'That code did not work. Enter the newest six-digit code from your authenticator app.',
 unknown:'Something went wrong while signing you in. Start again.',
} as const;
export type Problem=keyof typeof PROBLEMS;
export const problemText=(code:unknown)=>typeof code==='string'&&code in PROBLEMS?PROBLEMS[code as Problem]:PROBLEMS.unknown;
// Map whatever Supabase answered (code, status, message) to one of the codes above.
export function problemFor(error:unknown):Problem{
 const e=(error&&typeof error==='object'?error:{}) as {code?:unknown;status?:unknown;message?:unknown;name?:unknown};
 const code=String(e.code||''),said=String(e.message||''),status=Number(e.status)||0,both=code+' '+said;
 if(e.name==='TimeoutError'||e.name==='AbortError'||/fetch failed|network|timed? ?out|ECONN|ENOTFOUND/i.test(said)&&!status)return 'unreachable';
 if(status===429||/rate[_ ]limit|over_.*_limit|too many/i.test(both))return 'rate_limited';
 if(/session[_ ]not[_ ]found|session from session_id|refresh_token_not_found|refresh[_ ]token.*(not found|invalid|already used)|bad_jwt|jwt expired|no_authorization/i.test(both))return 'expired';
 if(/invalid[_ ]credentials|invalid[_ ]login|invalid[_ ]grant/i.test(both))return 'bad_credentials';
 if(/email[_ ]not[_ ]confirmed/i.test(both))return 'unconfirmed';
 if(/same[_ ]password|should be different/i.test(both))return 'same_password';
 if(/weak[_ ]password|password.*(short|weak|characters)/i.test(both))return 'weak';
 if(/mfa_verification_failed|mfa_challenge_expired|invalid totp|totp code/i.test(both))return 'bad_code';
 if(/code verifier|code_verifier|flow_state|pkce/i.test(both))return 'other_browser';
 if(/otp[_ ]expired|expired|invalid.*(token|code|link)|bad_code_verifier|token.*(not found|invalid)/i.test(both))return 'link_invalid';
 return 'unknown';
}
// What is wrong with a chosen password, as one sentence, or '' when nothing is.
export function passwordProblem(password:unknown,confirm:unknown,email:unknown){
 const pass=typeof password==='string'?password:'',again=typeof confirm==='string'?confirm:'';
 const address=typeof email==='string'?email.trim().toLowerCase():'',local=address.includes('@')?address.split('@')[0]:'';
 if(!pass)return 'Choose a password.';
 if(pass.length<PASSWORD_MIN)return `That is ${pass.length} character${pass.length===1?'':'s'}. It needs at least ${PASSWORD_MIN}.`;
 if(pass.length>200)return 'That is too long. Use at most 200 characters.';
 if(address&&(pass.toLowerCase()===address||(local.length>=PASSWORD_MIN&&pass.toLowerCase()===local)))return 'That is your email address. Choose something else.';
 if(again!==pass)return 'The two passwords are not the same.';
 return '';
}
export const cleanEmail=(value:unknown)=>{const v=typeof value==='string'?value.trim().toLowerCase():'';return v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)?v:''};
// Only same-site paths survive as a destination after signing in.
export function safeNext(value:unknown){const v=typeof value==='string'?value:'';return v.startsWith('/')&&!v.startsWith('//')&&!v.includes('\\')&&!v.startsWith('/api/')&&!v.startsWith('/auth/')&&v.length<300?v:'/'}
