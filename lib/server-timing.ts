// Server-Timing (speed, finish pass): how long each part of an answer took,
// shown in the browser's developer tools (Network → Timing) on the Preview and
// in Production. Durations and fixed names only: never an id, a value or a
// cache key. No imports: tests load it under Node's strip-only mode.
export type Timing={
 /** Adds a measured part (milliseconds). */
 add(name:string,ms:number):void;
 /** Measures a part while it runs; a failure is measured too, then thrown on. */
 time<T>(name:string,run:()=>Promise<T>):Promise<T>;
 /** The header value: every part, then `total` since the timing began. */
 header():string;
};
const NAME=/^[a-z][a-z0-9-]{0,31}$/;
export function serverTiming(clock:()=>number=()=>performance.now()):Timing{
 const start=clock(),parts:[string,number][]=[];
 const add=(name:string,ms:number)=>{if(NAME.test(name)&&Number.isFinite(ms)&&parts.length<20)parts.push([name,Math.max(0,ms)])};
 return {
  add,
  async time(name,run){const at=clock();try{return await run()}finally{add(name,clock()-at)}},
  header(){return [...parts,['total',clock()-start] as [string,number]].map(([n,ms])=>`${n};dur=${ms.toFixed(1)}`).join(', ')},
 };
}
/** The response with its Server-Timing header (a response whose headers cannot change is returned as it is). */
export function timed(response:Response,timing:Timing|undefined):Response{
 if(!timing)return response;
 try{response.headers.set('Server-Timing',timing.header())}catch(e){console.warn('Server-Timing not added',e instanceof Error?e.name:'UnknownError')}
 return response;
}
