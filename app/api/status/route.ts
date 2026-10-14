export const runtime='nodejs';
export const maxDuration=300;
import {context,fail} from '@/lib/studio-server';
import {credentialStatus} from '@/lib/credentials';
export async function GET(request:Request){try{const e=await context(request);return Response.json({...await credentialStatus(e),storage:!!e.BUCKET,model:e.OPENAI_IMAGE_MODEL||'gpt-image-2.5-sunburst',pinterest:'public-pin-import'},{headers:{'Cache-Control':'no-store'}})}catch(e){return fail(e)}}
