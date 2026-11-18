import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {getDatabase} from '@/lib/portable/database';
import {getStorage} from '@/lib/portable/storage';
import {studioEnvironment} from '@/lib/portable/environment';
import {publicPicture,publicShare} from '@/lib/shares';
// A public view link (lib/shares.ts): no sign-in (proxy.ts lets /view/<token>
// through). Looked up by the token's hash through studio.public_share (0011) on
// every request, so turning the link off or its expiry takes effect at once.
// The picture is a short-lived signed link built on the server from the stored
// owner prefix and id. A link that is off, expired or unknown answers 404 with
// one plain sentence (./not-found.tsx) and nothing else.
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Shared from Nmesis Studio',robots:{index:false,follow:false,nocache:true,googleBot:{index:false,follow:false}},referrer:'no-referrer'};
type Shown={title:string;src:string}|'off'|'unavailable';
async function open(token:string):Promise<Shown>{
 try{
  const share=await publicShare(getDatabase(),token,studioEnvironment());
  if(!share)return 'off';
  const src=await publicPicture(getStorage(),share);
  return src?{title:share.title,src}:'off';
 }catch(e){console.error('Public view link could not be opened',e instanceof Error?e.name:'UnknownError');return 'unavailable'}
}
export default async function View({params}:{params:Promise<{token:string}>}){
 const shown=await open((await params).token);
 if(shown==='off')notFound();
 return <main className="ds-app share-view">
  {shown==='unavailable'
   ?<div className="share-view-gone"><p>This picture can’t be shown right now. Try again in a minute.</p></div>
   :<figure className="share-view-figure">
    {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link to private storage; nothing to optimise or cache */}
    <img className="share-view-img" src={shown.src} alt={shown.title} referrerPolicy="no-referrer"/>
    <figcaption className="share-view-caption"><h1 className="share-view-title">{shown.title}</h1><p className="share-view-from">Shared from Nmesis Studio</p></figcaption>
   </figure>}
 </main>;
}
