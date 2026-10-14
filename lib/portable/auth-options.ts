import type {NextAuthOptions} from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
export function allowedEmail(email:string){const allowed=[process.env.STUDIO_ALLOWED_EMAILS,process.env.SHARED_OPENAI_OWNER_EMAIL,process.env.SHARED_OPENAI_GUEST_EMAILS].filter(Boolean).join(',').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);return allowed.includes(email.trim().toLowerCase());}
export const authOptions:NextAuthOptions={
 secret:process.env.NEXTAUTH_SECRET,
 session:{strategy:'jwt',maxAge:12*60*60},
 providers:[GoogleProvider({clientId:process.env.GOOGLE_CLIENT_ID||'',clientSecret:process.env.GOOGLE_CLIENT_SECRET||''})],
 callbacks:{async signIn({profile,user}){return !!user.email&&!!(profile as {email_verified?:boolean}|undefined)?.email_verified&&allowedEmail(user.email);}},
};
