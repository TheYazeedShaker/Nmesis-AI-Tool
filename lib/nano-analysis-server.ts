import {googleResponseFailure,type GoogleImageInput} from './gemini-server';
import {StudioError} from './studio-server';
import {NANO_ANALYSIS_PROMPT,NANO_ANALYSIS_SCHEMA,parseNanoAnalysis} from './nano-reference';
export async function inspectNanoReferences(key:string,images:GoogleImageInput[]){
 if(images.length!==2||images.reduce((n,i)=>n+i.bytes.length,0)>12_000_000)throw new StudioError('Use two references under 12 MB total.');
 const input=[{type:'text',text:NANO_ANALYSIS_PROMPT},...images.map(i=>({type:'image',mime_type:i.type,data:Buffer.from(i.bytes).toString('base64')}))];
 let r:Response;try{r=await fetch('https://generativelanguage.googleapis.com/v1beta/interactions',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify({model:'gemini-3.8-flash',input,store:false,response_format:{type:'text',mime_type:'application/json',schema:NANO_ANALYSIS_SCHEMA}}),signal:AbortSignal.timeout(90000),redirect:'manual'})}catch{throw new StudioError('Reference inspection was interrupted. No image generation was started.',504)}
 if(!r.ok)throw await googleResponseFailure(r,key);
 const data:any=await r.json(),text=data.output_text||(data.steps||[]).filter((s:any)=>s.type==='model_output').flatMap((s:any)=>s.content||[]).filter((p:any)=>p.type==='text').map((p:any)=>p.text).join('');
 try{return parseNanoAnalysis(JSON.parse(text))}catch{throw new StudioError('Google returned an incomplete reference inspection. No image was generated.',502)}
}
