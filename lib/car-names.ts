// A car's name as people say it: the brand, then the model, unless the model's
// own name already starts with the brand ("IM 6", never "IM IM 6"). Used for
// every car name the Studio shows or saves (Home, the car picker, the library,
// cards). Work saved before this rule may carry the doubled brand; tidyCarText
// mends that when it is shown or filtered.

const words=(s:string)=>s.trim().split(/\s+/).filter(Boolean);

export function carName(brandName:string|null|undefined,modelName:string|null|undefined){
 const brand=(brandName||'').trim(),model=(modelName||'').trim();
 if(!brand)return model;
 if(!model)return brand;
 const b=words(brand),m=words(model);
 const starts=b.length<=m.length&&b.every((w,i)=>w.localeCompare(m[i],undefined,{sensitivity:'accent'})===0);
 return starts?model:`${brand} ${model}`;
}

/** "IM IM 6 · Coast road" → "IM 6 · Coast road": a brand doubled at the start (one to three words, matched without regard to case). */
export function tidyCarText(text:string|null|undefined){
 if(!text)return text??null;
 const w=text.split(' ');
 for(let n=Math.min(3,Math.floor(w.length/2));n>=1;n--){
  const lead=w.slice(0,n).join(' '),next=w.slice(n,2*n).join(' ');
  if(lead&&lead.localeCompare(next,undefined,{sensitivity:'accent'})===0)return w.slice(n).join(' ');
 }
 return text;
}

/** Every name a car's work may have been saved under: today's and the doubled one. */
export function carNameVariants(brandName:string,modelName:string){
 const now=carName(brandName,modelName),old=[brandName,modelName].map(s=>(s||'').trim()).filter(Boolean).join(' ');
 return [...new Set([now,old])];
}
