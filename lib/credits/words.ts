// Client-safe credit helpers: cost-table key names, sizes and sentences. No
// prices: the USD cost table and the credit basis stay on the server
// (lib/credits/pricing.ts), so nothing here reveals what an action costs Nmesis.
import type {CostKey} from './pricing';
export type CreditLevel=0|80|100;
export function sizeTier(size:string):'1k'|'2k'|'4k'{
 const m=/^(\d{2,5})x(\d{2,5})$/.exec(size);const edge=m?Math.max(Number(m[1]),Number(m[2])):2048;
 return edge<=1600?'1k':edge<=2048?'2k':'4k';
}
export const openaiImageCost=(size:string):CostKey=>`openai.image.${sizeTier(size)}` as CostKey;
export const googleImageCost=(model:string,size:string):CostKey=>`google.image.${/pro/.test(model)?'pro':'fast'}.${sizeTier(size)}` as CostKey;
export const topazCost=(edge:number):CostKey=>edge>=7680?'topaz.upscale.8k':edge>=3840?'topaz.upscale.4k':'topaz.upscale.2k';
export const CREDITS_USED='Your credits for this month are used. Ask Nmesis to add a pack.';
export const notEnoughCredits=(needed:number,left:number)=>left<=0?CREDITS_USED:`This needs ${needed} ${needed===1?'credit':'credits'} and your company has ${left} left this month. Ask Nmesis to add a pack.`;
export const creditsLabel=(n:number)=>`${n.toLocaleString('en-US')} ${n===1?'credit':'credits'}`;
