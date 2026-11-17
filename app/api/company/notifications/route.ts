export const runtime='nodejs';
import {context,fail,readJson} from '@/lib/studio-server';
import {notificationsState,saveNotifications} from '@/lib/company';
// Company settings → Notifications: who gets the 80% and 100% credit emails.
// GET: everyone in the company. PUT { userIds }: the company's own owners.
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){try{return Response.json(await notificationsState(await context(request)),{headers})}catch(e){return fail(e)}}
export async function PUT(request:Request){try{const ctx=await context(request,true),d=await readJson(request,4000);return Response.json(await saveNotifications(ctx,d),{headers})}catch(e){return fail(e)}}
