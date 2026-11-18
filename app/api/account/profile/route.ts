export const runtime='nodejs';
import {context,fail,readJson,StudioError} from '@/lib/studio-server';
import {saveOwnName} from '@/lib/auth/supabase';
// Your account → your name. PATCH {name}: one line of text, 1–80 characters
// after trimming (spaces inside collapse to one, as the name is read back by
// profileName). Always the signed-in person's own sign-in profile (ctx.userId,
// from the verified session), never an id from the body. Staff viewing a
// company change nothing there, their own name included.
const NAME_MAX=80;
const headers={'Cache-Control':'private, no-store'};
function parseName(value:unknown):string{
 if(typeof value!=='string')throw new StudioError('Enter your name.');
 // Control characters (new lines, tabs and the like) and the Unicode line breaks.
 if(/[\p{Cc}\u2028\u2029]/u.test(value))throw new StudioError('Write your name on one line, without special characters.');
 const name=value.replace(/\s+/g,' ').trim();
 if(!name)throw new StudioError('Enter your name.');
 if(name.length>NAME_MAX)throw new StudioError(`Keep your name to ${NAME_MAX} characters or fewer.`);
 return name;
}
export async function PATCH(request:Request){try{
 const ctx=await context(request,true);
 if(ctx.account.viewingAs)throw new StudioError('You are viewing this company as Nmesis staff, so your name can’t be changed here.',403);
 const name=parseName((await readJson(request,2000)).name);
 const saved=await saveOwnName(ctx.userId,name);
 if(!saved.ok)throw new StudioError('The sign-in service did not save your name. Try again in a moment.',502);
 return Response.json({name:saved.name},{headers});
}catch(e){return fail(e)}}
