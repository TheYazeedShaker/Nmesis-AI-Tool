// Seedance returns a pricing description rather than a numeric estimate.
// Convert its published video-token formula into a conservative ceiling.
export function seedancePriceMicros(result:unknown,model:string,body:unknown){
 if(!model.startsWith('bytedance/seedance-')||!result||typeof result!=='object'||Array.isArray(result)||!body||typeof body!=='object'||Array.isArray(body))return null;
 const estimate=result as {type?:unknown;pricing_description?:unknown};
 const input=body as {duration?:unknown;resolution?:unknown;image_url?:unknown;image_urls?:unknown;video_urls?:unknown;aspect_ratio?:unknown};
 const copy=estimate.pricing_description;
 if(estimate.type!=='description'||typeof copy!=='string'||input.resolution!=='720p'||!Number.isInteger(input.duration)||Number(input.duration)<4||Number(input.duration)>30)return null;
 if(!copy.includes('Billable video tokens')||!copy.includes('24')||!copy.includes('1024')||!copy.includes('Rates shown are before any applicable customer discount.'))return null;
 // This workflow supplies only still images; video references change the rate and billable duration.
 if(input.video_urls!==undefined||!input.image_url&&!Array.isArray(input.image_urls))return null;
 const rateText=copy.match(/(?:each|per)\s+1,?000\s+video\s+tokens\s+costs?\s+\$([0-9]+(?:\.[0-9]+)?)(?:\s+without video input|\s+at 480p or 720p|\s*[.,])/i)?.[1]
  ??copy.match(/(?:without video input\s*[—–:-]\s*)?480p\/720p(?:\/1080p)?\s+\$([0-9]+(?:\.[0-9]+)?)/i)?.[1];
 if(!rateText)return null;
 const rate=Number(rateText);
 if(!Number.isFinite(rate)||rate<=0||rate>1)return null;
 // Reference-to-video fixes 16:9. Image-to-video follows the input image, so
 // allow the widest supported 720p framing (21:9) rather than underquoting.
 const width=input.image_url?1680:input.aspect_ratio==='16:9'||input.aspect_ratio===undefined?1280:null;
 if(!width)return null;
 const tokens=Math.ceil(Number(input.duration)*width*720*24/1024);
 const micros=Math.ceil(tokens*rate*1000);
 return Number.isSafeInteger(micros)&&micros>0&&micros<=1_000_000_000?micros:null;
}
