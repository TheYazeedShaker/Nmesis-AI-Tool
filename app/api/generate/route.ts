export const runtime='nodejs';
export const maxDuration=300;
import {parseLineup,lineupImageIds,lineupPrompt,lineupCapacity} from '@/lib/lineup';
import {imageSettings,refinementReferences} from '@/lib/image-models';
import {apiKey} from '@/lib/credentials';
import {bucket,context,fail,imageKey,readJson,str,validId,StudioError,providerError} from '@/lib/studio-server';
import {generationPrompt,safePinterest,referenceMode} from '@/lib/studio';
export async function POST(request:Request){let record:any;let store:R2Bucket|undefined;let recordKey='';
 try{
 const ctx=await context(request,true);const key=await apiKey(ctx);if(!key)throw new StudioError('Live generation is not connected yet. Your selected view, brief and inspiration are ready.',503);
 store=bucket(ctx.BUCKET);const d=await readJson(request);
 if(!validId(d.id)||!validId(d.sourceId)||!validId(d.moodId))throw new StudioError('Choose a car view and upload an inspiration image first.');
 let lineup;try{lineup=parseLineup(d.lineup);if(lineup){lineupCapacity(lineup,16,!!d.parentId);if(d.sourceId!==lineup.cars[0].views[0].id)throw new Error('The primary lineup reference changed.');if(d.refinementReferenceIds?.length)throw new Error('Use the references attached to each lineup car.');if(lineup.targetCarId&&!d.parentId)throw new Error('Open a saved lineup before refining a car.')}}catch(e){throw new StudioError((e as Error).message)}
 const brief=str(d.brief);if(brief.length<8)throw new StudioError('Describe the campaign in a little more detail.');
 let size:string;try{const settings=imageSettings(d.provider,d.size||'1536x864');if(settings.provider!=='openai')throw new Error('Use the Higgsfield estimate flow for this generator.');size=settings.size}catch(e){throw new StudioError((e as Error).message)}
 let refinementReferenceIds:string[];try{refinementReferenceIds=refinementReferences(d.refinementReferenceIds,!!d.parentId,'openai')}catch(e){throw new StudioError((e as Error).message)}
 const extraImages:[string,R2ObjectBody][]=[];for(const [index,id] of refinementReferenceIds.entries()){const item=await store.get(imageKey(ctx.prefix,id));if(!item)throw new StudioError(`Reference ${index+1} is no longer available. Upload it again.`,404);extraImages.push(['reference-'+(index+1),item])}
 const source=await store.get(imageKey(ctx.prefix,d.sourceId));const mood=await store.get(imageKey(ctx.prefix,d.moodId));if(!source||!mood)throw new StudioError('A reference is no longer available. Please upload it again.');
 const refinement=str(d.refinement,1000);let parent:R2ObjectBody|null=null;
 if(d.parentId){if(!validId(d.parentId))throw new StudioError('Invalid previous visual.');parent=await store.get(imageKey(ctx.prefix,d.parentId));if(!parent)throw new StudioError('The previous visual could not be found.');}
 let selectedReferenceMode;try{selectedReferenceMode=referenceMode(d.referenceMode)}catch(e){throw new StudioError((e as Error).message)}
 let smart:Awaited<ReturnType<typeof import('@/lib/smart-reference-server').loadSmartPlan>>|undefined;if(d.smartPlanId!==undefined)smart=await (await import('@/lib/smart-reference-server')).loadSmartPlan(ctx,{...d,provider:'openai',size});
 const prompt=smart?smart.plan.prompt:lineup?lineupPrompt(lineup,brief,!!d.parentId,refinement):generationPrompt({referenceMode:selectedReferenceMode,brief,vehicle:str(d.vehicle,100),finish:str(d.finish,120),angle:str(d.angle,120),scene:str(d.scene,1500),variant:Number.isInteger(d.variant)?Math.max(0,d.variant):0,hasMood:true,refinement,refinementReferenceCount:refinementReferenceIds.length});
 const id=d.id;recordKey=ctx.prefix+'visuals/'+id+'.json';record={smartPlanId:smart?.plan.id,smartPriority:smart?.plan.priority,smartTest:d.smartTest===true,id,lineup,title:str(d.title,100)||'Campaign visual',src:'/api/assets/'+id,status:'pending',createdAt:new Date().toISOString(),prompt,brief,vehicle:str(d.vehicle,100),configurator:str(d.configurator,2000),finish:str(d.finish,120),angle:str(d.angle,120),sourceId:d.sourceId,moodId:d.moodId,refinementReferenceIds,pin:safePinterest(str(d.pin,600))||'',size,provider:'openai',model:ctx.OPENAI_IMAGE_MODEL||'gpt-image-2.5-sunburst',parentId:d.parentId||null,referenceMode:selectedReferenceMode};
 const reserved=await store.put(recordKey,JSON.stringify(record),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});if(!reserved)throw new StudioError('This generation has already been submitted. Check your saved visuals.',409);
 const form=new FormData();form.set('model',ctx.OPENAI_IMAGE_MODEL||'gpt-image-2.5-sunburst');form.set('prompt',prompt);form.set('size',size);form.set('quality','high');form.set('n','1');form.set('output_format','png');
 const inputs:[string,R2ObjectBody][]=[];if(lineup){for(const [i,assetId] of lineupImageIds(lineup,d.moodId,d.parentId).entries()){const item=await store.get(imageKey(ctx.prefix,assetId));if(!item)throw new StudioError('A lineup reference is missing. Add it again.',404);inputs.push(['lineup-'+(i+1),item])}}else inputs.push(['product',source],['mood',mood],...(parent?[['previous',parent] as [string,R2ObjectBody]]:[]),...extraImages);
 for(const [label,item]of inputs){form.append('image[]',new Blob([await item.arrayBuffer()],{type:item.httpMetadata?.contentType||'image/png'}),label+'.'+(item.httpMetadata?.contentType==='image/jpeg'?'jpg':item.httpMetadata?.contentType==='image/webp'?'webp':'png'))}
 for(const [i,detail] of (smart?.details||[]).entries())form.append('image[]',new Blob([new Uint8Array(detail.bytes)],{type:detail.type}),'car-detail-'+(i+1)+'.jpg');
 const response=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:'Bearer '+key},body:form,signal:AbortSignal.timeout(240000)});
 if(!response.ok)throw await providerError(response);
 const data:any=await response.json();const encoded=data.data?.[0]?.b64_json;if(!encoded)throw new StudioError('The service returned no image. Your references are preserved.',502);
 const image=Buffer.from(encoded,'base64');if(image.length<24||image[0]!==137)throw new StudioError('The service returned an unreadable image.',502);
 const width=image.readUInt32BE(16),height=image.readUInt32BE(20);
 await store.put(imageKey(ctx.prefix,id),image,{httpMetadata:{contentType:'image/png'}});
 record={...record,status:'ready',width,height};await store.put(recordKey,JSON.stringify(record),{httpMetadata:{contentType:'application/json'}});
 return Response.json({visual:record});
 }catch(e){if(record&&store&&recordKey&&!(e instanceof StudioError&&e.status===409)){record.status='failed';record.error=e instanceof StudioError?e.message:'Generation was interrupted. Check saved visuals before submitting again.';try{await store.put(recordKey,JSON.stringify(record),{httpMetadata:{contentType:'application/json'}})}catch{}}
 return fail(e);}
}
