export const runtime='nodejs';
import {serveBrandFont} from '@/lib/brand-fonts/serve';
// The sanitised WOFF2 of one of the company's fonts (lib/brand-fonts/serve.ts).
export function GET(request:Request,{params}:{params:Promise<{id:string}>}){return serveBrandFont(request,params,'font')}
