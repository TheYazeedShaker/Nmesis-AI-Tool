// Verified against the Higgsfield account model catalog. These are account tools,
// not model paths for api.higgsfield.ai. Do not submit them to that developer API.
export const UPSCALE_MODELS = [
  {id:'topaz-high-fidelity',label:'Topaz · High Fidelity V2',family:'Precision',variant:'High Fidelity V2',recommended:'Recommended for car visuals',description:'Our first choice for an approved, detailed visual. Use gentle enhancement to preserve the car.'},
  {id:'topaz-standard',label:'Topaz · Standard V2',family:'Precision',variant:'Standard V2',recommended:'Recommended for general use',description:'A balanced starting point for everyday enlargement and sharpening.'},
  {id:'bytedance',label:'ByteDance Image Upscale',family:'Simple',variant:'ByteDance',description:'Straightforward 2K or 4K enlargement. Keep background removal off for a finished scene.'},
  {id:'topaz-cgi',label:'Topaz · CGI',family:'Precision',variant:'CGI',description:'An option to compare on clean renders and computer-generated imagery.'},
  {id:'topaz-low-resolution',label:'Topaz · Low Resolution V2',family:'Precision',variant:'Low Resolution V2',description:'For smaller source images. Review reconstructed details carefully.'},
  {id:'topaz-text',label:'Topaz · Text Refine',family:'Precision',variant:'Text Refine',description:'For visuals with text. Check every badge and letter against the original.'},
  {id:'topaz-standard-max',label:'Topaz · Standard MAX',family:'Generative',variant:'Standard MAX',description:'Adds reconstructed detail; inspect the car before approving.'},
  {id:'topaz-redefine',label:'Topaz · Redefine',family:'Generative',variant:'Redefine',description:'Creative reconstruction can change the product. Use with care on car campaigns.'},
  {id:'topaz-recovery',label:'Topaz · Recovery',family:'Generative',variant:'Recovery',description:'Restores degraded sources; may invent missing details.'},
  {id:'topaz-recovery-v2',label:'Topaz · Recovery V2',family:'Generative',variant:'Recovery V2',description:'Another restoration option for degraded images; compare product details closely.'},
] as const;
export const TOPAZ_UPSCALE_MODEL={id:'topaz-high-fidelity-3',label:'Topaz · High Fidelity 3',family:'Precision',variant:'Upscale High Fidelity V3',recommended:'Recommended for car visuals',description:'Direct API upscaling with natural detail and structure preservation.'} as const;
export const HIGGSFIELD_UPSCALE_URL='https://higgsfield.ai/upscale';
export type UpscaleModelId=typeof UPSCALE_MODELS[number]['id'];
export function upscaleModel(id:unknown){const model=id===TOPAZ_UPSCALE_MODEL.id?TOPAZ_UPSCALE_MODEL:UPSCALE_MODELS.find(m=>m.id===id);if(!model)throw new Error('Choose an available upscaler.');return model}
export function upscaleTarget(width:number,height:number,longEdge:number){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||![2048,3840,7680].includes(longEdge))throw new Error('The image dimensions are unavailable.');
  const factor=longEdge/Math.max(width,height);
  return {width:Math.max(1,Math.round(width*factor)),height:Math.max(1,Math.round(height*factor))};
}
export function upscaleInstructions(id:UpscaleModelId,width:number,height:number){
  const m=upscaleModel(id);
  return [`Higgsfield image upscale`, `Model: ${m.label}`, `Output: ${width} × ${height} pixels. Keep the source aspect ratio.`,m.id==='bytedance'?'Background removal: off.':`Variant: ${m.variant}. Face enhancement: off. Sharpening: 0.1. Denoise: 0.`,m.family==='Generative'?'Use the lowest creative settings. Check for changed wheels, badges, lights and body shape.':'Preserve the approved vehicle, composition, color and trim.', 'Compare the result with the original before approval.'].join('\n');
}
