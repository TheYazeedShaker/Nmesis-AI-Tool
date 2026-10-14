import {chatGPTSignOutPath} from '@/app/chatgpt-auth';
export function GET(request:Request){return Response.redirect(new URL(chatGPTSignOutPath(),request.url));}
