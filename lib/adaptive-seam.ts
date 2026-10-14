type Raster={width:number;height:number;channels:number;data:ArrayLike<number>};
type Region={x:number;y:number;width:number;height:number};
// Find a low-difference join in the permitted overlap, instead of using the
// painted outline as the join. Core pixels must be replaced; outside stays exact.
export function adaptiveSeam(src:Raster,out:Raster,core:Uint8Array,allowed:Uint8Array,r:Region){
 let x0=src.width,y0=src.height,x1=-1,y1=-1;
 for(let y=r.y;y<r.y+r.height;y++)for(let x=r.x;x<r.x+r.width;x++)if(allowed[y*src.width+x]){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)}
 if(x1<0)return allowed;
 x0=Math.max(r.x,x0-4);y0=Math.max(r.y,y0-4);x1=Math.min(r.x+r.width-1,x1+4);y1=Math.min(r.y+r.height-1,y1+4);
 const bw=x1-x0+1,bh=y1-y0+1,scale=Math.min(1,160/Math.max(bw,bh)),w=Math.max(2,Math.ceil(bw*scale)),h=Math.max(2,Math.ceil(bh*scale)),n=w*h,S=n,T=n+1;
 const required=new Uint8Array(n),possible=new Uint8Array(n),cost=new Float64Array(n);
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const j=Math.min(h-1,Math.floor((y-y0)*h/bh))*w+Math.min(w-1,Math.floor((x-x0)*w/bw)),i=y*src.width+x;if(core[i])required[j]=1;if(allowed[i])possible[j]=1}
 for(let gy=0;gy<h;gy++)for(let gx=0;gx<w;gx++){
  const x=Math.min(x1,Math.floor(x0+(gx+.5)*bw/w)),y=Math.min(y1,Math.floor(y0+(gy+.5)*bh/h)),ox=Math.max(0,Math.min(out.width-1,Math.floor((x-r.x+.5)*out.width/r.width))),oy=Math.max(0,Math.min(out.height-1,Math.floor((y-r.y+.5)*out.height/r.height)));
  let error=0;for(let c=0;c<3;c++){const a=src.data[(y*src.width+x)*src.channels+(src.channels<=2?0:c)],b=out.data[(oy*out.width+ox)*out.channels+(out.channels<=2?0:c)];error+=(a-b)**2}
  cost[gy*w+gx]=1+error/3;
 }
 const head=new Int32Array(n+2).fill(-1),to=new Int32Array(n*10+8),next=new Int32Array(to.length),capacity=new Float64Array(to.length);let count=0;
 const edge=(a:number,b:number,c:number,back=0)=>{to[count]=b;capacity[count]=c;next[count]=head[a];head[a]=count++;to[count]=a;capacity[count]=back;next[count]=head[b];head[b]=count++};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(required[i])edge(S,i,1e12);else if(!possible[i])edge(i,T,1e12);if(x+1<w){const c=cost[i]+cost[i+1];edge(i,i+1,c,c)}if(y+1<h){const c=cost[i]+cost[i+w];edge(i,i+w,c,c)}}
 const level=new Int32Array(n+2),queue=new Int32Array(n+2),cursor=new Int32Array(n+2);
 const bfs=()=>{level.fill(-1);let first=0,last=0;queue[last++]=S;level[S]=0;while(first<last){const a=queue[first++];for(let e=head[a];e>=0;e=next[e])if(capacity[e]>1e-7&&level[to[e]]<0){level[to[e]]=level[a]+1;queue[last++]=to[e]}}return level[T]>=0};
 const push=(a:number,f:number):number=>{if(a===T)return f;for(let e=cursor[a];e>=0;cursor[a]=e=next[e])if(capacity[e]>1e-7&&level[to[e]]===level[a]+1){const v=push(to[e],Math.min(f,capacity[e]));if(v>1e-7){capacity[e]-=v;capacity[e^1]+=v;return v}}return 0};
 while(bfs()){cursor.set(head);while(push(S,1e12)>1e-7){/* drain this level graph */}}
 const result=new Uint8Array(allowed.length);
 const at=(x:number,y:number)=>level[Math.max(0,Math.min(h-1,y))*w+Math.max(0,Math.min(w-1,x))]>=0?255:0;
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
  const i=y*src.width+x;if(core[i]){result[i]=255;continue}if(!allowed[i])continue;
  const fx=(x-x0+.5)*w/bw-.5,fy=(y-y0+.5)*h/bh-.5,xx=Math.floor(fx),yy=Math.floor(fy),dx=fx-xx,dy=fy-yy;
  result[i]=Math.min(allowed[i],Math.round((at(xx,yy)*(1-dx)+at(xx+1,yy)*dx)*(1-dy)+(at(xx,yy+1)*(1-dx)+at(xx+1,yy+1)*dx)*dy));
 }
 return result;
}
