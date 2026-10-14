export const GEMINI_IMAGE_MODELS = [
  {id:'gemini-3-pro-image',label:'Nano Banana Pro',description:'Recommended for precise car details and complex reference edits.'},
  {id:'gemini-nano-banana-2.1',label:'Nano Banana 2.1',description:'Faster creative exploration and reference-based variations.'},
] as const;
export function geminiImageModel(value:unknown){
  const model=GEMINI_IMAGE_MODELS.find(m=>m.id===value);
  if(!model)throw new Error('Choose Nano Banana Pro or Nano Banana 2.1.');
  return model;
}
export function geminiSize(value:unknown){
  if(value==='1024x576')return '1K';
  if(value==='2048x1152')return '2K';
  if(value==='3840x2160')return '4K';
  throw new Error('Choose 1K, 2K or 4K for Nano Banana.');
}
export type GoogleConnectionStatus={connected:boolean;keySetup:boolean;models:string[];checkedAt?:string};

export const HIGGSFIELD_IMAGE_MODEL='xai/grok-imagine-image-2.0';
export const HIGGSFIELD_IMAGE_MODELS=[
 {id:'marketing-studio/image/sunburst',label:'Marketing Studio · Sunburst 2.5',max4k:true,variableCost:true,maxImages:16},
 {id:'marketing-studio/image/flare',label:'Marketing Studio · Flare 2.5',max4k:true,variableCost:true,maxImages:16},
 {id:HIGGSFIELD_IMAGE_MODEL,label:'Grok Imagine 2.0',max4k:false,variableCost:false,maxImages:3},
] as const;
export const EXTERNAL_IMAGE_MODELS=[
 {label:'Nano Banana Pro',url:'https://higgsfield.ai/ai/image?model=nano-banana-pro'},
 {label:'Seedream',url:'https://higgsfield.ai/ai/image?model=seedream'},
] as const;
export type ImageProvider='openai'|'higgsfield'|'google';
export const OPENAI_IMAGE_SIZES=['1536x864','2048x1152','3840x2160'] as const;
export function higgsImageModel(model:unknown=HIGGSFIELD_IMAGE_MODEL){
 const found=HIGGSFIELD_IMAGE_MODELS.find(m=>m.id===model);
 if(!found)throw new Error('This image model is not connected to the studio. Choose Sunburst, Flare or Grok.');
 return found;
}
export function imageSettings(provider:unknown,size:unknown,model:unknown=HIGGSFIELD_IMAGE_MODEL){
 if(provider==='google'){const info=geminiImageModel(model);geminiSize(size);return {provider:'google' as ImageProvider,size:size as string,model:info.id}}
 if(provider!==undefined&&provider!=='openai'&&provider!=='higgsfield')throw new Error('Choose OpenAI or Higgsfield.');
 const selected=provider==='higgsfield'?'higgsfield':'openai';
 const value=typeof size==='string'?size:'2048x1152';
 const info=selected==='higgsfield'?higgsImageModel(model):null;
 const allowed=info?['1024x576','2048x1152',...(info.max4k?['3840x2160']:[])]:OPENAI_IMAGE_SIZES;
 if(!allowed.includes(value as never))throw new Error(info?'Choose a supported output size. Grok supports 1K or 2K; Sunburst and Flare also support 4K.':'Choose Preview, 2K or 4K.');
 return {provider:selected as ImageProvider,size:value,model:info?.id};
}
export function higgsImageBody(prompt:string,size:string,imageUrls:string[],model:unknown=HIGGSFIELD_IMAGE_MODEL){
 imageSettings('higgsfield',size,model);const info=higgsImageModel(model);
 if(imageUrls.length<2||imageUrls.length>info.maxImages)throw new Error(`This model accepts 2–${info.maxImages} images in the studio, including the car, inspiration and previous visual.`);
 return{prompt,image_urls:imageUrls,resolution:size==='3840x2160'?'4k':size==='2048x1152'?'2k':'1k',aspect_ratio:'16:9',quality:info.max4k?'high':'medium',...(info.max4k?{enhance_prompt:false,moderation:'auto'}:{})};
}

export type HiggsBudget={connected:boolean;sponsored:boolean;dailyLimit:number;used:number;paused:boolean};
export const imageMoney=(micros:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:3}).format(micros/1e6);
export function imageBudgetIssue(b:Pick<HiggsBudget,'dailyLimit'|'used'|'paused'>,estimate:number){
 if(b.paused)return 'Higgsfield spending is paused in this studio. Resume spending in Higgsfield budget settings.';
 const remaining=Math.max(0,b.dailyLimit-b.used);
 if(estimate>remaining)return `This image needs ${imageMoney(estimate)}, but only ${imageMoney(remaining)} remains of your ${imageMoney(b.dailyLimit)} daily Higgsfield budget. Images and videos share this limit. Increase it in budget settings or wait until midnight UTC.`;
 return '';
}

// This is a studio reservation, never a provider quote or a billing ceiling.
export const TOKEN_IMAGE_RESERVATION=2_000_000;
export function tokenImagePricing(result:unknown){
 const d=result as {type?:unknown;pricing_description?:unknown};
 if(d?.type!=='description'||typeof d.pricing_description!=='string'||!d.pricing_description.trim()||d.pricing_description.length>4000)throw new Error('Higgsfield did not return readable usage pricing. No generation was started.');
 return d.pricing_description.trim();
}

// Studio attachment cap leaves room for the product, inspiration and base visual.
export const MAX_REFINEMENT_REFERENCES=6;
export function refinementReferenceLimit(provider:ImageProvider,model?:string){
 return provider==='higgsfield'?Math.min(MAX_REFINEMENT_REFERENCES,higgsImageModel(model).maxImages-3):MAX_REFINEMENT_REFERENCES;
}
export function refinementReferences(value:unknown,hasParent:boolean,provider:ImageProvider,model?:string):string[]{
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.some(id=>typeof id!=='string'||!/^[a-z0-9-]{8,80}$/.test(id)))throw new Error('Choose valid refinement reference images.');
 if(value.length&&!hasParent)throw new Error('Open a saved visual before adding refinement references.');
 const limit=refinementReferenceLimit(provider,model);
 if(value.length>limit)throw new Error(limit?`Use up to ${limit} refinement references.`:'Choose ChatGPT, Sunburst or Flare to use extra refinement references.');
 if(new Set(value).size!==value.length)throw new Error('Remove duplicate refinement references.');
 return value;
}
