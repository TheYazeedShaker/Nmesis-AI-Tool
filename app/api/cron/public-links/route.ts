export const runtime='nodejs';
export const dynamic='force-dynamic';
import {getDatabase} from '@/lib/portable/database';
import {getStorage} from '@/lib/portable/storage';
import {studioEnvironment} from '@/lib/portable/environment';
import {cronAuthorized,SWEEP_LIMIT,sweepPublicCopies} from '@/lib/shares';
// The daily job (vercel.json "crons"): deletes the picture copies of public view
// links that expired or were turned off and that nothing has cleared yet
// (lib/shares.ts; the link routes and the public page sweep too). Not a
// person's route: Vercel calls it with Authorization: Bearer <CRON_SECRET>, and
// anything else is refused. It reads only dead links' neutral keys, through
// migration 0011's SECURITY DEFINER pair, and deletes only those objects.
const headers={'Cache-Control':'no-store'};
export async function GET(request:Request){
 if(!process.env.CRON_SECRET)return Response.json({error:'The daily job isn’t set up on this Studio.'},{status:503,headers});
 if(!cronAuthorized(request.headers.get('authorization')))return Response.json({error:'Not allowed.'},{status:401,headers});
 let cleared=0;
 // At most four batches a day; whatever is left goes tomorrow (or on the next link change).
 for(let i=0;i<4;i++){const n=await sweepPublicCopies(getDatabase(),getStorage(),studioEnvironment(),SWEEP_LIMIT);cleared+=n;if(n<SWEEP_LIMIT)break}
 console.info('Public link pictures swept',JSON.stringify({cleared}));
 return Response.json({cleared},{headers});
}
