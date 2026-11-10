const imageTypes=['image/png','image/jpeg','image/webp'];
export function clipboardImage(data:Pick<DataTransfer,'items'|'files'>):File|null{
 for(const item of Array.from(data.items||[]))if(item.kind==='file'&&item.type.startsWith('image/')){const file=item.getAsFile();if(file)return file;}
 return Array.from(data.files||[]).find(file=>file.type.startsWith('image/'))||null;
}
export function validateClipboardImage(file:File){
 if(!imageTypes.includes(file.type))throw new Error('Paste a PNG, JPEG or WebP image. For other formats, take a screenshot and paste it.');
 if(!file.size||file.size>40_000_000)throw new Error('Paste an image up to 40 MB.');
 return file;
}
export async function readClipboardImage(clipboard:Pick<Clipboard,'read'>){
 const items=await clipboardDeadline(clipboard.read());
 for(const item of items){const type=imageTypes.find(type=>item.types.includes(type));if(type){const blob=await clipboardDeadline(item.getType(type));return validateClipboardImage(new File([blob],'Pasted reference.'+(type==='image/jpeg'?'jpg':type.split('/')[1]),{type}));}}
 throw new Error('No image found. Copy a screenshot or choose “Copy image”, then paste again.');
}

function clipboardDeadline<T>(operation:Promise<T>):Promise<T>{
 return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Clipboard access did not respond. Click the paste area and press ⌘V / Ctrl+V, or upload the image.')),15000);operation.then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)})});
}
