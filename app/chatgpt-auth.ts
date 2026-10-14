// Compatibility names keep the existing studio interface unchanged. Identity now
// comes exclusively from a verified NextAuth session, never client-supplied headers.
import {getServerSession} from 'next-auth';
import {redirect} from 'next/navigation';
import {authOptions,allowedEmail} from '@/lib/portable/auth-options';
export type ChatGPTUser={userId:string;displayName:string;email:string;fullName:string|null};
export async function getChatGPTUser():Promise<ChatGPTUser|null>{
 if(!process.env.NEXTAUTH_SECRET||!process.env.GOOGLE_CLIENT_ID||!process.env.GOOGLE_CLIENT_SECRET)return null;
 const session=await getServerSession(authOptions);const email=session?.user?.email?.trim().toLowerCase();
 if(!email||!allowedEmail(email))return null;
 return {userId:'google-email:'+email,email,displayName:session?.user?.name||email,fullName:session?.user?.name||null};
}
export function chatGPTSignInPath(returnTo='/'){return '/api/auth/signin?callbackUrl='+encodeURIComponent(safePath(returnTo));}
export function chatGPTSignOutPath(returnTo='/'){return '/api/auth/signout?callbackUrl='+encodeURIComponent(safePath(returnTo));}
export async function requireChatGPTUser(returnTo:string){const user=await getChatGPTUser();if(user)return user;redirect(chatGPTSignInPath(returnTo));}
function safePath(value:string){return value.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\')?value:'/';}
