export const runtime='nodejs';
import {serveBrandFont} from '@/lib/brand-fonts/serve';
// The small preview of one of the company's fonts: its family's name alone (lib/brand-fonts/serve.ts).
export function GET(request:Request,{params}:{params:Promise<{id:string}>}){return serveBrandFont(request,params,'preview')}
