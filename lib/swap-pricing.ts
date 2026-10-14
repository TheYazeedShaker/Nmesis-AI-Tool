// Genjutsu currently returns a per-second pricing description instead of a USD amount.
// A strict parse gives an upper bound before any customer discount.
export function descriptionPriceMicros(result:unknown,resolution:'480p'|'720p',duration:number){
 if(!result||typeof result!=='object'||Array.isArray(result))return null;
 const value=result as {type?:unknown;pricing_description?:unknown};
 if(value.type!=='description'||typeof value.pricing_description!=='string'||!Number.isFinite(duration)||duration<4||duration>30)return null;
 const copy=value.pricing_description;
 if(!copy.includes('Per-second pricing.')||!copy.includes('Input duration is rounded up to the nearest whole second.')||!copy.includes('Rates shown are before any applicable customer discount.'))return null;
 const rates=[...copy.matchAll(/\$([0-9]+(?:\.[0-9]+)?) at (480p|720p)/g)];
 if(rates.length!==2||new Set(rates.map(x=>x[2])).size!==2)return null;
 const rate=rates.find(x=>x[2]===resolution)?.[1];if(!rate)return null;
 const micros=Math.ceil(Number(rate)*1_000_000)*Math.ceil(duration);
 return Number.isSafeInteger(micros)&&micros>0&&micros<=1_000_000_000?micros:null;
}
