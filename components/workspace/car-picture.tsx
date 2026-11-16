'use client';
import * as React from 'react';
import {Car} from 'lucide-react';

// A car's real picture: the configurator's opening exterior frame, made into a
// small thumbnail once by the server (/api/cars/<id>/picture, a signed link).
// The box keeps its 16:9 shape while it loads, so nothing moves; a car with no
// frames, or a picture that fails, shows the neutral car instead.
export function CarPicture({src,className='ds-car-art'}:{src?:string|null;className?:string}){
 const [failed,setFailed]=React.useState(false);
 return <span className={className} aria-hidden="true">
  {src&&!failed
   // eslint-disable-next-line @next/next/no-img-element -- a private picture on a signed link, sized by its box
   ?<img src={src} alt="" loading="lazy" decoding="async" onError={()=>setFailed(true)}/>
   :<Car/>}
 </span>;
}
