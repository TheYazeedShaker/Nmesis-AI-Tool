'use client';
import * as React from 'react';
import {Car} from 'lucide-react';

// A small picture in a fixed box: a car's real picture (the configurator's
// opening exterior frame, made into a thumbnail once by the server,
// /api/cars/<id>/picture, a signed link), or a tool's sample (lib/tool-samples.ts).
// The box keeps its shape while it loads (its class sets the aspect ratio), so
// nothing moves; no picture, or one that fails, shows the neutral mark instead.
export function SamplePicture({src,className,fallback}:{src?:string|null;className:string;fallback:React.ReactNode}){
 const [failed,setFailed]=React.useState<string|null>(null);
 const shown=src&&failed!==src?src:null;
 return <span className={className} aria-hidden="true" data-sample={shown?'picture':'none'}>
  {shown
   // eslint-disable-next-line @next/next/no-img-element -- a private picture on a signed link, sized by its box
   ?<img src={shown} alt="" width={320} height={200} loading="lazy" decoding="async" onError={()=>setFailed(shown)}/>
   :fallback}
 </span>;
}

export function CarPicture({src,className='ds-car-art'}:{src?:string|null;className?:string}){
 return <SamplePicture src={src} className={className} fallback={<Car/>}/>;
}
