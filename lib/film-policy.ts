// Money stays in integer USD millionths on the server; companies spend credits
// (lib/credits/). The daily per-payer budget and its RESERVE_*_SQL were replaced in
// S3 by credit holds against the company's balance for the billing period.
export function providerUrl(value:unknown,kind:'status'|'cancel',id:string){
 if(typeof value!=='string'||typeof id!=='string'||!/^[\w-]{1,120}$/.test(id))throw new Error('Invalid video request identifier.');
 const u=new URL(value);if(u.origin!=='https://api.higgsfield.ai'||u.username||u.password||u.search||u.hash||u.pathname!==`/requests/${id}/${kind}`)throw new Error('Unexpected video status address.');return u.href;
}
export function requestUrls(id:unknown){
 if(typeof id!=='string'||!/^[\w-]{1,120}$/.test(id))throw new Error('The video service did not return a usable request identifier.');
 return{id,statusUrl:`https://api.higgsfield.ai/requests/${id}/status`,cancelUrl:`https://api.higgsfield.ai/requests/${id}/cancel`};
}
export function publicMediaUrl(value:unknown){
 if(typeof value!=='string')throw new Error('Video media address missing.');const u=new URL(value);
 // Addresses come exclusively from authenticated provider responses. Block local/IP destinations and credentials.
 if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.includes('.')||/^[\d.]+$/.test(u.hostname)||u.hostname.includes(':')||/\.(localhost|local|internal|test|invalid)$/.test(u.hostname))throw new Error('Unexpected media address.');return u.href;
}
export async function keyFingerprint(key:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key)))).map(x=>x.toString(16).padStart(2,'0')).join('')}

