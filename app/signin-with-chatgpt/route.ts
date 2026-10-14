import {chatGPTSignInPath} from '@/app/chatgpt-auth';
export function GET(request:Request){const url=new URL(request.url);return Response.redirect(new URL(chatGPTSignInPath(url.searchParams.get('return_to')||'/'),url.origin));}
