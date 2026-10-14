export type SelectionMode = 'replace'|'add'|'remove';
export type SelectionPoint = {x:number;y:number};
export type SelectionBox = SelectionPoint & {width:number;height:number};

export function selectionBox(a:SelectionPoint,b:SelectionPoint):SelectionBox {
 const clamp=(n:number)=>Math.max(0,Math.min(1,n));
 const x=clamp(Math.min(a.x,b.x)),y=clamp(Math.min(a.y,b.y));
 return {x,y,width:clamp(Math.max(a.x,b.x))-x,height:clamp(Math.max(a.y,b.y))-y};
}

export function combineSelection(base:Uint8Array,next:Uint8Array,mode:SelectionMode):Uint8Array {
 if(base.length!==next.length)throw new Error('Selection dimensions do not match.');
 const result=new Uint8Array(base.length);
 for(let i=0;i<result.length;i++)result[i]=mode==='replace'?next[i]:mode==='add'?Math.max(base[i],next[i]):Math.round(base[i]*(1-next[i]/255));
 return result;
}
