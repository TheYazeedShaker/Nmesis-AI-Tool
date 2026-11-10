// Upload/storage limits are studio safeguards, not provider model limits.
export const MAX_REFERENCE_BYTES=40_000_000;
export const PREPARED_REFERENCE_BYTES=3_000_000;
export const REFERENCE_TYPES=['image/png','image/jpeg','image/webp'];
export function validateReference(file:Pick<Blob,'size'|'type'>){
 if(!REFERENCE_TYPES.includes(file.type))throw new Error('Choose a PNG, JPEG or WebP image.');
 if(!file.size||file.size>MAX_REFERENCE_BYTES)throw new Error('Choose an image up to 40 MB.');
}
