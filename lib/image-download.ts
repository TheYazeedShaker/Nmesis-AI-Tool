const IMAGE_EXTENSIONS:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/avif':'avif','image/gif':'gif'};
export function imageExtension(type:string){return IMAGE_EXTENSIONS[type.split(';')[0].trim().toLowerCase()]}
export function imageFilename(name:string,type:string){
 const base=name.replace(/\.[a-z0-9]{2,5}$/i,'').replace(/[^a-z0-9_-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,100)||'nmesis-image';
 return base+'.'+(imageExtension(type)||'png');
}
export async function fetchDownloadImage(src:string,signal?:AbortSignal){
 const response=await fetch(src,{credentials:'same-origin',cache:'no-store',redirect:'follow',signal});
 if(!response.ok)throw new Error(response.status===401||response.status===403?'Your session expired. Refresh the studio, sign in and try again.':response.status===404?'This image is no longer available. Refresh your library and select it again.':'The image could not be downloaded. Try again or open the original.');
 const type=response.headers.get('content-type')||'';
 if(!imageExtension(type))throw new Error('The studio did not return an image. Refresh the page and sign in again.');
 const blob=await response.blob();if(!blob.size)throw new Error('The downloaded image was empty. Please try again.');return blob;
}
