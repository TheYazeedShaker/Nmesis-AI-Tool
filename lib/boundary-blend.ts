type Raster={width:number;height:number;channels:number;data:ArrayLike<number>};
type Region={x:number;y:number;width:number;height:number};
const rgb=(image:Raster,x:number,y:number,c:number)=>image.data[(y*image.width+x)*image.channels+(image.channels<=2?0:c)];
function sample(image:Raster,x:number,y:number,c:number){
 x=Math.max(0,Math.min(image.width-1,x));y=Math.max(0,Math.min(image.height-1,y));
 const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(image.width-1,x0+1),y1=Math.min(image.height-1,y0+1),dx=x-x0,dy=y-y0;
 return(rgb(image,x0,y0,c)*(1-dx)+rgb(image,x1,y0,c)*dx)*(1-dy)+(rgb(image,x0,y1,c)*(1-dx)+rgb(image,x1,y1,c)*dx)*dy;
}
// Solve a smooth color correction from the protected surroundings. No pixels
// from the removed object are used as anchors, and generated texture is kept.
// Bounded coarse grids keep this practical in a Worker even for a 4K original.
export function boundaryCorrection(original:Raster,generated:Raster,matte:Uint8Array,region:Region){
 let x0=original.width,y0=original.height,x1=-1,y1=-1;
 for(let y=region.y;y<region.y+region.height;y++)for(let x=region.x;x<region.x+region.width;x++)if(matte[y*original.width+x]){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)}
 if(x1<0)return()=>0;
 x0=Math.max(region.x,x0-8);y0=Math.max(region.y,y0-8);x1=Math.min(region.x+region.width-1,x1+8);y1=Math.min(region.y+region.height-1,y1+8);
 const local={x:x0,y:y0,width:x1-x0+1,height:y1-y0+1};
 const editable=(x:number,y:number)=>x>=0&&y>=0&&x<original.width&&y<original.height&&matte[y*original.width+x]>0;
 const interior=(x:number,y:number)=>editable(x,y)&&editable(x-1,y)&&editable(x+1,y)&&editable(x,y-1)&&editable(x,y+1);
 let previous:Raster|undefined;
 // Localize the solve to the actual join. At ordinary brush sizes the final
 // grid is pixel-for-pixel, not one correction sample per 16–32 image pixels.
 // Fix the inner edge to the source as a Dirichlet boundary; the generated
 // texture is retained through the interior, with no old object as an anchor.
 for(const limit of [16,32,64,128,256,512]){
  if(previous&&previous.width===local.width&&previous.height===local.height)break;
  const scale=Math.min(1,limit/Math.max(local.width,local.height));
  const width=Math.max(2,Math.ceil(local.width*scale)),height=Math.max(2,Math.ceil(local.height*scale)),unknown=new Uint8Array(width*height);
  for(let y=0;y<local.height;y++)for(let x=0;x<local.width;x++)if(interior(local.x+x,local.y+y))unknown[Math.min(height-1,Math.floor(y*height/local.height))*width+Math.min(width-1,Math.floor(x*width/local.width))]=1;
  const data=new Float32Array(width*height*3),mean=[0,0,0];let anchors=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const i=y*width+x;if(unknown[i])continue;anchors++;
   const sx=local.x+(x+.5)*local.width/width-.5,sy=local.y+(y+.5)*local.height/height-.5;
   for(let c=0;c<3;c++){
    const value=sample(original,sx,sy,c)-sample(generated,(sx-region.x+.5)*generated.width/region.width-.5,(sy-region.y+.5)*generated.height/region.height-.5,c);
    data[i*3+c]=value;mean[c]+=value;
   }
  }
  if(!anchors)continue;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(unknown[y*width+x])for(let c=0;c<3;c++)data[(y*width+x)*3+c]=previous?sample(previous,(x+.5)*previous.width/width-.5,(y+.5)*previous.height/height-.5,c):mean[c]/anchors;
  for(let iteration=0;iteration<160;iteration++){
   let change=0;
   for(let parity=0;parity<2;parity++)for(let y=0;y<height;y++)for(let x=(y+parity)%2;x<width;x+=2){
    const i=y*width+x;if(!unknown[i])continue;
    const count=Number(x>0)+Number(x+1<width)+Number(y>0)+Number(y+1<height);
    for(let c=0;c<3;c++){
     const k=i*3+c,value=((x?data[k-3]:0)+(x+1<width?data[k+3]:0)+(y?data[k-width*3]:0)+(y+1<height?data[k+width*3]:0))/count;
     const next=data[k]+1.8*(value-data[k]);change=Math.max(change,Math.abs(next-data[k]));data[k]=next;
    }
   }
   if(change<.02)break;
  }
  previous={width,height,channels:3,data};
 }
 const correction=previous;
 return correction?(x:number,y:number,c:number)=>sample(correction,(x-local.x+.5)*correction.width/local.width-.5,(y-local.y+.5)*correction.height/local.height-.5,c):()=>0;
}
