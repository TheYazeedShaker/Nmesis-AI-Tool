export function providerFailureMessage(value:unknown,fallback:string){
 const raw=typeof value==='string'?value:value&&typeof value==='object'&&'message' in value&&typeof value.message==='string'?value.message:null;
 if(!raw)return fallback;
 const safe=raw.replace(/https?:\/\/\S+/g,'[link]').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,400);
 return safe?`Higgsfield: ${safe}`:fallback;
}
