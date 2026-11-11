export const runtime='nodejs';
import {context,fail} from '@/lib/studio-server';
import {configuratorPresets} from '@/lib/configurators';
// Presets are served only to signed-in users, never built into the browser bundle.
export async function GET(request:Request){try{await context(request);return Response.json({configurators:configuratorPresets()},{headers:{'Cache-Control':'private, no-store'}})}catch(e){return fail(e)}}
