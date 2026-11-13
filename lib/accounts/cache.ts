// A small time-boxed cache per serverless instance (no imports: a leaf module).
export function ttlCache<T>(ms:number,max=500){
 const map=new Map<string,{at:number;value:Promise<T>}>();
 return (key:string,load:()=>Promise<T>)=>{const hit=map.get(key);if(hit&&Date.now()-hit.at<ms)return hit.value;if(map.size>=max)map.clear();const value=load();map.set(key,{at:Date.now(),value});value.catch(()=>map.delete(key));return value};
}
