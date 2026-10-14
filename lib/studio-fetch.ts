// Multipart bodies go directly to private storage to avoid Vercel's 4.5 MB request limit.
export const studioFetch:typeof fetch=async(input,init)=>{
 if(!(init?.body instanceof FormData))return fetch(input,init);
 const target=typeof input==='string'?input:input instanceof URL?input.href:input.url;
 const url=new URL(target,window.location.origin);
 if(url.origin!==window.location.origin)throw new Error('Uploads must start from your studio.');
 const encoded=new Response(init.body),blob=await encoded.blob();
 const ticketResponse=await fetch('/api/uploads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({target:url.pathname,type:encoded.headers.get('content-type'),size:blob.size}),signal:init.signal});
 const ticket=await ticketResponse.json() as {url:string;token:string;error?:string};if(!ticketResponse.ok)throw new Error(ticket.error||'Could not prepare the upload.');
 const uploaded=await fetch(ticket.url,{method:'PUT',body:blob,headers:{'Content-Type':encoded.headers.get('content-type')!},credentials:'omit',signal:init.signal});
 if(!uploaded.ok)throw new Error('The file upload failed. Check storage CORS settings and try again.');
 const headers=new Headers(init.headers);headers.set('Content-Type','application/json');
 return fetch(input,{...init,headers,body:JSON.stringify({uploadToken:ticket.token})});
};
