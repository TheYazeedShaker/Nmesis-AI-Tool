'use client';
import * as React from 'react';
import Link from 'next/link';
import {Check,Copy,Pencil} from 'lucide-react';
import {Button,buttonClass} from '@/components/ds/button';
import {Loading,SkeletonPanel,SkeletonTile,State} from '@/components/ds/feedback';
import {useToast,type ToastKind} from '@/components/ds/toast';
import {useBrandKit} from '@/components/brand/brand-kit';
import {addAsReference,addToCanvas,useShell} from '@/components/shell/shell-state';
import {useAccount} from '@/components/studio-account';
import {can} from '@/lib/accounts/can';
import {cleanHex,NOT_YET,type BrandColour,type BrandKit,type BrandLogo} from '@/lib/brand-kit';
import {canvasAddSaid,imageSize,logoCanvasAdd} from '@/lib/elements';
import {removeReference,useReferenceTray,type TrayItem} from '@/lib/reference-tray';

// The Brand panel's body: the company's logos to use as references (inside the
// canvas editor: to add to the design), and its colours and fonts to copy. The shell draws the panel around it (header,
// close button, the drawer on phones: components/shell/panels.tsx). It reads
// the kit with useBrandKit(), so it follows a save in Settings → Brand kit
// (/company/brand), where owners and creators change it. Styles: app/brand.css.

/** Where the brand kit is changed. */
export const EDIT_BRAND_HREF='/company/brand';
/** What the person is told after choosing a logo (addAsReference's answer). */
export const LOGO_SAID={added:'Logo added to your references.',replaced:'Logo is now your reference.',full:'Your references are full. Remove one first.'} as const;

/** A brand logo as a reference-tray item; null for a logo without an id, or
 *  whose address the tray would not keep (only /api/… and https://…). */
export function logoReference(logo:Pick<BrandLogo,'id'|'name'|'url'>):TrayItem|null{
 const src=typeof logo.url==='string'?logo.url:'';
 if(typeof logo.id!=='string'||!logo.id||!(src.startsWith('/api/')||src.startsWith('https://')))return null;
 const name=typeof logo.name==='string'&&logo.name.trim()?logo.name.trim():'Brand logo';
 return {key:'brand:'+logo.id,src,thumb:src,name,provider:'brand'};
}

type Act={add:(item:TrayItem)=>'added'|'replaced'|'full';remove:(key:string)=>void};
/** A press on a logo: in use, it leaves the references; otherwise it becomes one
 *  (addAsReference: added, or swapped in for a tool that takes one, or the tray
 *  is full). Answers what to tell the person. */
export function pressLogo(logo:Pick<BrandLogo,'id'|'name'|'url'>,tray:readonly TrayItem[],act:Act={add:addAsReference,remove:removeReference}):{message:string;kind:ToastKind}{
 const item=logoReference(logo);
 if(!item)return {message:'This logo can’t be used as a reference.',kind:'bad'};
 if(tray.some(t=>t.key===item.key)){act.remove(item.key);return {message:'Logo removed from your references.',kind:'info'}}
 const said=act.add(item);
 return {message:LOGO_SAID[said],kind:said==='full'?'info':'ok'};
}

/** Nothing to show: no logos, no colours and both fonts left at System. */
export const emptyKit=(kit:BrandKit)=>!kit.logos.length&&!kit.colours.length&&kit.headingFont==='System'&&kit.bodyFont==='System';

function useCopy(){
 const {toast}=useToast();
 return React.useCallback(async(text:string)=>{
  try{
   if(!navigator.clipboard?.writeText)throw new Error('No clipboard here.');
   await navigator.clipboard.writeText(text);
   toast({message:`Copied ${text}`,kind:'ok'});
  }catch{
   // Refused (no permission, an insecure page, an old browser): say the value instead.
   toast({message:`Your browser didn’t allow copying. It’s ${text}.`,kind:'info'});
  }
 },[toast]);
}

function Part({title,children}:{title:string;children:React.ReactNode}){
 const id=React.useId();
 return <section className="brand-panel-part" aria-labelledby={id}>
  <h3 className="ds-label-caps" id={id}>{title}</h3>
  {children}
 </section>;
}

/** A press on a logo inside the editor: it goes on the design, at its own size once the <img> has loaded. */
export function addLogo(logo:Pick<BrandLogo,'id'|'name'|'url'>,img:{naturalWidth?:unknown;naturalHeight?:unknown}|null,add:typeof addToCanvas=addToCanvas):{message:string;kind:ToastKind}{
 const item=logoCanvasAdd(logo,imageSize(img));
 return item?canvasAddSaid(item,add(item)):{message:'This logo can’t be added to the design.',kind:'bad'};
}

function Logos({logos}:{logos:BrandLogo[]}){
 const tray=useReferenceTray(),{toast}=useToast(),{canvas}=useShell();
 return <Part title="Logos">
  {logos.length?<ul className="brand-panel-logos">{logos.map(logo=>{
   const name=logo.name||'Brand logo';
   // Inside the editor: one press adds the logo to the design (no reference, no tick).
   if(canvas)return <li key={logo.id}>
    <button type="button" className="brand-panel-logo" aria-label={`Add ${name} to the design`} title={logo.name} onClick={e=>toast(addLogo(logo,e.currentTarget.querySelector('img')))}>
     <span className="brand-panel-logo-media">
      <span className="brand-panel-board" data-theme="light" aria-hidden="true"/>
      {/* eslint-disable-next-line @next/next/no-img-element -- private media on a signed link */}
      <img src={logo.url} alt="" loading="lazy" decoding="async"/>
     </span>
     <span className="brand-panel-logo-name ds-truncate" aria-hidden="true">{logo.name}</span>
    </button>
   </li>;
   const key=logoReference(logo)?.key,on=!!key&&tray.some(t=>t.key===key);
   return <li key={logo.id}>
    <button type="button" className="brand-panel-logo" aria-pressed={on} aria-label={`Use ${name} as a reference`} title={logo.name} onClick={()=>toast(pressLogo(logo,tray))}>
     <span className="brand-panel-logo-media">
      {/* A light checkerboard in both themes: most logos are dark, and transparency shows. */}
      <span className="brand-panel-board" data-theme="light" aria-hidden="true"/>
      {/* eslint-disable-next-line @next/next/no-img-element -- private media on a signed link */}
      <img src={logo.url} alt="" loading="lazy" decoding="async"/>
      {on&&<span className="brand-panel-tick" aria-hidden="true"><Check/></span>}
     </span>
     <span className="brand-panel-logo-name ds-truncate" aria-hidden="true">{logo.name}</span>
    </button>
   </li>;
  })}</ul>:<p className="brand-line">No logos yet.</p>}
 </Part>;
}

function Colours({colours,copy}:{colours:BrandColour[];copy:(text:string)=>Promise<void>}){
 const shown=colours.flatMap(c=>{const hex=cleanHex(c.hex);return hex?[{hex,name:c.name}]:[]});
 return <Part title="Colours">
  {shown.length?<ul className="brand-panel-swatches">{shown.map((c,i)=><li key={i}>
   <button type="button" className="brand-panel-swatch" aria-label={`Copy ${c.name?c.name+', ':''}${c.hex}`} onClick={()=>void copy(c.hex)}>
    <span className="brand-panel-chip" style={{background:c.hex}} aria-hidden="true"/>
    <span className="brand-panel-swatch-text"><b className="ds-truncate">{c.name||c.hex}</b>{c.name&&<span className="brand-hex">{c.hex}</span>}</span>
   </button>
  </li>)}</ul>:<p className="brand-line">No colours yet.</p>}
 </Part>;
}

function Fonts({kit,copy}:{kit:BrandKit;copy:(text:string)=>Promise<void>}){
 const rows=[['Heading',kit.headingFont],['Body',kit.bodyFont]] as const;
 return <Part title="Fonts">
  <ul className="brand-panel-fonts">{rows.map(([role,font])=><li key={role}>
   <button type="button" className="brand-panel-font" aria-label={`Copy ${role} · ${font}`} onClick={()=>void copy(font)}>
    <span className="brand-panel-font-text ds-truncate"><span className="brand-panel-font-role">{role}</span> · {font}</span>
    <Copy aria-hidden="true"/>
   </button>
  </li>)}</ul>
 </Part>;
}

/** Owners and creators get the way to the editor; everyone else is told who can. */
function Footer(){
 const account=useAccount();
 if(!account)return null;
 return <div className="brand-panel-foot">
  {can(account,'brand.edit')
   ?<Link href={EDIT_BRAND_HREF} className={buttonClass({size:'sm'})}><Pencil aria-hidden="true"/>Edit brand kit</Link>
   :<p className="brand-line">Owners and creators can change the brand kit.</p>}
 </div>;
}

export function BrandPanel(){
 const {kit,error,reload}=useBrandKit();
 const copy=useCopy();
 let body:React.ReactNode;
 if(!kit)body=error
  ?<State kind="error" title="The brand kit didn’t load" actions={<Button onClick={()=>void reload()}>Try again</Button>}>{error}</State>
  :<Loading label="Loading the brand kit" className="brand-panel-loading">
   <div className="brand-panel-logos">{[0,1,2,3].map(i=><SkeletonTile key={i}/>)}</div>
   <SkeletonPanel/>
  </Loading>;
 else if(emptyKit(kit))body=<State kind="empty" title="No brand kit yet">{kit.ready?'Logos, colours and fonts added to the brand kit show here, ready to use.':NOT_YET}</State>;
 else body=<>
  <Logos logos={kit.logos}/>
  <Colours colours={kit.colours} copy={copy}/>
  <Fonts kit={kit} copy={copy}/>
 </>;
 return <div className="brand-panel">{body}<Footer/></div>;
}
