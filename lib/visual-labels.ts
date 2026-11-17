import type {Visual} from './studio';
// What a library card says about a visual (owner's decision F-050, 2026-11-15):
// the tool that made it and, at most, a plain quality. Never the provider or the
// model; Nmesis staff and companies using their own keys see those in the card's
// details.
export function visualToolLabel(v:Pick<Visual,'lineup'|'areaEdit'|'upscale'>):string{
 if(v.upscale)return 'Upscale';
 if(v.areaEdit)return 'Area edit';
 if(v.lineup)return 'Line-up';
 return 'Key visual';
}
// "High detail" from about 3K on the long edge (4K and 8K outputs and their
// upscales); "Standard" below. From the image's own size when known.
export const HIGH_DETAIL_EDGE=3000;
export function visualQualityLabel(v:Pick<Visual,'width'|'height'|'size'>):'Standard'|'High detail'{
 let edge=Math.max(Number(v.width)||0,Number(v.height)||0);
 if(!edge&&typeof v.size==='string'){const m=/^(\d{2,5})x(\d{2,5})$/.exec(v.size);if(m)edge=Math.max(Number(m[1]),Number(m[2]))}
 return edge>=HIGH_DETAIL_EDGE?'High detail':'Standard';
}
