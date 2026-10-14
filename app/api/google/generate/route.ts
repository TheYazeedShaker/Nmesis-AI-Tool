export const runtime='nodejs';
export const maxDuration=300;
import {context,bucket,fail,imageKey,readJson,str,validId,StudioError} from '@/lib/studio-server';
import {googleKey,renderGoogleImage,type GoogleImageInput} from '@/lib/gemini-server';
import {geminiImageModel,geminiSize} from '@/lib/image-models';
import {refinementReferences} from '@/lib/image-models';
import {generationPrompt,referenceMode,safePinterest,type Visual} from '@/lib/studio';
import {nanoDetailInputs} from '@/lib/nano-detail-inputs';
import {nanoStrategy,nanoReferencePrompt,type NanoAnalysis} from '@/lib/nano-reference';
export async function POST(request:Request){
  let record:Visual|undefined,store:R2Bucket|undefined,recordKey='',reserved=false;
  try{
    const ctx=await context(request,true),d=await readJson(request);store=bucket(ctx.BUCKET);
    if(d.provider!=='google'||!validId(d.id)||!validId(d.sourceId)||!validId(d.moodId)||d.parentId&&!validId(d.parentId))throw new StudioError('Choose a saved car view and inspiration first.');
    if(d.lineup)throw new StudioError('Nano Banana is currently connected to Single car key visuals.');
    let model:string,size:string,mode,extraIds:string[];
    try{model=geminiImageModel(d.model).id;geminiSize(d.size);size=d.size;mode=referenceMode(d.referenceMode);extraIds=refinementReferences(d.refinementReferenceIds,!!d.parentId,'google',model)}catch(e){throw new StudioError((e as Error).message)}
    const brief=str(d.brief);if(brief.length<8)throw new StudioError('Describe the campaign in a little more detail.');
    const key=await googleKey(ctx),inputs:GoogleImageInput[]=[];let totalBytes=0;
    for(const id of [d.sourceId,d.moodId,...d.parentId?[d.parentId]:[],...extraIds]){
      const asset=await store.get(imageKey(ctx.prefix,id));if(!asset)throw new StudioError('A reference is missing. Please select it again.',404);
      totalBytes+=asset.size;if(totalBytes>12_000_000)throw new StudioError('Use smaller references, up to 12 MB total for Nano Banana.');
      inputs.push({bytes:new Uint8Array(await asset.arrayBuffer()),type:asset.httpMetadata?.contentType||'image/png'});
    }
    let prompt=generationPrompt({provider:'google',referenceMode:mode,brief,vehicle:str(d.vehicle,100),finish:str(d.finish,120),angle:str(d.angle,120),scene:str(d.scene,1500),variant:Number.isInteger(d.variant)?Math.max(0,d.variant):0,hasMood:true,refinement:str(d.refinement,1000),refinementReferenceCount:extraIds.length});
    let strategy;
    if(d.nanoStrategy!==undefined){
     try{strategy=nanoStrategy(d.nanoStrategy)}catch(e){throw new StudioError((e as Error).message)}
     if(d.parentId||extraIds.length)throw new StudioError('Reference tests start from the original pair, without previous generated images.');
     let analysis:NanoAnalysis|undefined;
     if(strategy!=='baseline'){if(!validId(d.analysisId))throw new StudioError('Inspect the references first.');const saved=await store.get(ctx.prefix+'nano-inspections/'+d.analysisId+'.json');analysis=saved?await saved.json<NanoAnalysis>():undefined;if(!analysis||analysis.sourceId!==d.sourceId||analysis.moodId!==d.moodId)throw new StudioError('Inspect this exact reference pair first.')}
     if(strategy==='detail'){if(!analysis?.detailRegions)throw new StudioError('Inspect the references again to detect detail crops.');try{inputs.push(...nanoDetailInputs(inputs[0],analysis.detailRegions))}catch(e){throw new StudioError((e as Error).message)}}
     prompt=nanoReferencePrompt(strategy,analysis,brief);
    }
    let smart:Awaited<ReturnType<typeof import('@/lib/smart-reference-server').loadSmartPlan>>|undefined;if(d.smartPlanId!==undefined){smart=await (await import('@/lib/smart-reference-server')).loadSmartPlan(ctx,d);prompt=smart.plan.prompt;inputs.push(...smart.details)}
    recordKey=ctx.prefix+'visuals/'+d.id+'.json';
    record={smartPlanId:smart?.plan.id,smartPriority:smart?.plan.priority,smartTest:d.smartTest===true,nanoStrategy:strategy,analysisId:strategy?d.analysisId:undefined,id:d.id,title:str(d.title,100)||'Campaign visual',src:'/api/assets/'+d.id,status:'pending',createdAt:new Date().toISOString(),provider:'google',model,size,sourceId:d.sourceId,moodId:d.moodId,parentId:d.parentId||null,refinementReferenceIds:extraIds,prompt,brief,referenceMode:mode,vehicle:str(d.vehicle,100),configurator:str(d.configurator,2000),finish:str(d.finish,120),angle:str(d.angle,120),pin:safePinterest(str(d.pin,600))||''};
    const reservation=await store.put(recordKey,JSON.stringify(record),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
    if(!reservation)throw new StudioError('This request was already submitted. Check your saved visuals.',409);reserved=true;
    const image=await renderGoogleImage(key,model,size,prompt,inputs);
    await store.put(imageKey(ctx.prefix,d.id),image.bytes,{httpMetadata:{contentType:image.type}});
    record={...record,status:'ready',width:image.width,height:image.height};
    await store.put(recordKey,JSON.stringify(record),{httpMetadata:{contentType:'application/json'}});
    return Response.json({visual:record});
  }catch(e){
    if(reserved&&record&&store){record.status='failed';record.error=e instanceof StudioError?e.message:'Generation was interrupted. Check saved visuals before trying again.';try{await store.put(recordKey,JSON.stringify(record),{httpMetadata:{contentType:'application/json'}})}catch{}}
    return fail(e);
  }
}
