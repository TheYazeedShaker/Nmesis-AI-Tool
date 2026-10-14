type Raster={width:number;height:number;channels:number;data:ArrayLike<number>};
// For small removals, reuse a coherent nearby texture patch when its surrounding
// detail closely matches the original. The generated image remains
// the fallback for new geometry and cases with no credible texture donor.
export function textureFill(src:Raster,generated:Raster,core:Uint8Array,allowed:Uint8Array){
 if(src.width!==generated.width||src.height!==generated.height)return undefined;
 const {width:w,height:h}=src;let x0=w,y0=h,x1=-1,y1=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(allowed[y*w+x]){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)}
 if(x1<0)return undefined;const bw=x1-x0+1,bh=y1-y0+1;if(bw>w*.28||bh>h*.4)return undefined;
 const rgb=(a:Raster,x:number,y:number,c:number)=>a.data[(y*w+x)*a.channels+(a.channels<=2?0:c)];
 const points:number[][]=[];const step=Math.max(3,Math.ceil(Math.sqrt(bw*bh/900)));
 for(let y=Math.max(0,y0-8);y<=Math.min(h-1,y1+8);y+=step)for(let x=Math.max(0,x0-8);x<=Math.min(w-1,x1+8);x+=step)if(!core[y*w+x])points.push([x,y]);
 if(points.length<30)return undefined;
 const score=(dx:number,dy:number,model=false)=>{
  const mean=[0,0,0];for(const [x,y]of points)for(let c=0;c<3;c++)mean[c]+=rgb(src,x,y,c)-rgb(model?generated:src,x+dx,y+dy,c);for(let c=0;c<3;c++)mean[c]/=points.length;
  let error=0;for(const [x,y]of points)for(let c=0;c<3;c++){const d=rgb(src,x,y,c)-rgb(model?generated:src,x+dx,y+dy,c)-mean[c];error+=d*d}
  return error/(points.length*3)+mean.reduce((a,v)=>a+v*v,0)/30;
 };
 const modelError=score(0,0,true);let best=Infinity,offset: {x:number;y:number}|undefined;
 const radius=Math.min(640,Math.max(bw,bh)*3),stride=Math.max(6,Math.round(Math.max(bw,bh)/22));
 for(let dy=-Math.min(radius,Math.round(bh*1.25));dy<=Math.min(radius,Math.round(bh*1.25));dy+=stride)for(let dx=-radius;dx<=radius;dx+=stride){
  if(x0+dx<8||y0+dy<8||x1+dx>=w-8||y1+dy>=h-8)continue;
  // Donor must not include any of the selected object or its cleanup region.
  if(!(x1+dx<x0||x0+dx>x1||y1+dy<y0||y0+dy>y1))continue;
  const cost=score(dx,dy);if(cost<best){best=cost;offset={x:dx,y:dy}}
 }
 if(!offset||best>80)return undefined;
 const coarse=offset;for(let dy=coarse.y-stride;dy<=coarse.y+stride;dy+=2)for(let dx=coarse.x-stride;dx<=coarse.x+stride;dx+=2){
  if(x0+dx<8||y0+dy<8||x1+dx>=w-8||y1+dy>=h-8||!(x1+dx<x0||x0+dx>x1||y1+dy<y0||y0+dy>y1))continue;const cost=score(dx,dy);if(cost<best){best=cost;offset={x:dx,y:dy}}
 }
 // Compare broad fill colors to the model's semantic proposal. Reject donors
 // that match the perimeter but contain a different scene in the middle.
 const guide=[0,0,0],donor=[0,0,0];let samples=0;
 for(let y=y0;y<=y1;y+=step)for(let x=x0;x<=x1;x+=step)if(core[y*w+x]){samples++;for(let c=0;c<3;c++){guide[c]+=rgb(generated,x,y,c);donor[c]+=rgb(src,x+offset.x,y+offset.y,c)}}
 if(!samples||guide.some((v,c)=>Math.abs(v-donor[c])/samples>45))return undefined;
 const data=new Uint8Array(w*h*3);for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++)data[(y*w+x)*3+c]=rgb(src,Math.max(0,Math.min(w-1,x+offset.x)),Math.max(0,Math.min(h-1,y+offset.y)),c);
 return{width:w,height:h,channels:3 as const,data,score:best,modelScore:modelError};
}
