// What a paid action costs in credits. Pure: no I/O, so routes, pages and tests
// share one answer. Money stays in integer USD millionths ("micros") on the
// server; the browser only ever sees credits.
// An action costs ceil(provider cost ÷ credit basis) credits. The basis (what
// one credit may cost Nmesis, USD) comes from the price book (`credit_basis`);
// 0.04 until it is read.
export const DEFAULT_CREDIT_BASIS_USD=0.04;
export type CreditProvider='openai'|'google'|'higgsfield'|'topaz';
export const PROVIDERS:CreditProvider[]=['openai','google','higgsfield','topaz'];
export const PROVIDER_LABELS:Record<CreditProvider,string>={openai:'OpenAI',google:'Google AI Studio',higgsfield:'Higgsfield',topaz:'Topaz'};
// Fixed-cost actions without a provider quote: what one action may cost Nmesis
// (USD). A price-book entry `studio_cost.<key>` (USD) overrides any of them.
// Higgsfield films, swaps and fixed-price images are quoted by Higgsfield itself.
export const DEFAULT_COSTS_USD={
 'openai.image.1k':0.20,
 'openai.image.2k':0.30,
 'openai.image.4k':0.60,
 'openai.text':0.03,
 'google.image.pro.1k':0.14,
 'google.image.pro.2k':0.14,
 'google.image.pro.4k':0.24,
 'google.image.fast.1k':0.04,
 'google.image.fast.2k':0.07,
 'google.image.fast.4k':0.15,
 'google.text':0.02,
 'topaz.upscale.2k':0.08,
 'topaz.upscale.4k':0.16,
 'topaz.upscale.8k':0.40,
 // Higgsfield's token-priced image models give no fixed quote.
 'higgsfield.image.token':0.30,
} as const;
export type CostKey=keyof typeof DEFAULT_COSTS_USD;
export const COST_KEYS=Object.keys(DEFAULT_COSTS_USD) as CostKey[];
export const isCostKey=(v:unknown):v is CostKey=>typeof v==='string'&&v in DEFAULT_COSTS_USD;
const MAX_USD=1000;
export {sizeTier,openaiImageCost,googleImageCost,topazCost,CREDITS_USED,notEnoughCredits,creditsLabel} from './words';
const micros=(usd:number)=>Math.round(usd*1_000_000);
// The price book as the Studio reads it: credit_basis and studio_cost.* only.
export type PriceBook={basisMicros:number;costs:Record<CostKey,number>};
export function readPriceBook(rows:{key:unknown;value:unknown}[]):PriceBook{
 const costs=Object.fromEntries(COST_KEYS.map(k=>[k,micros(DEFAULT_COSTS_USD[k])])) as Record<CostKey,number>;
 let basisMicros=micros(DEFAULT_CREDIT_BASIS_USD);
 const usd=(v:unknown)=>{const n=typeof v==='number'?v:typeof v==='string'&&v.trim()!==''?Number(v):NaN;return Number.isFinite(n)&&n>0&&n<=MAX_USD?n:null};
 for(const row of rows){
  const key=typeof row.key==='string'?row.key:'',value=usd(typeof row.value==='string'&&row.value.startsWith('"')?JSON.parse(row.value):row.value);
  if(value===null)continue;
  if(key==='credit_basis')basisMicros=micros(value);
  else if(key.startsWith('studio_cost.')&&isCostKey(key.slice(12)))costs[key.slice(12) as CostKey]=micros(value);
 }
 return {basisMicros,costs};
}
export const DEFAULT_PRICE_BOOK=readPriceBook([]);
// ceil(cost ÷ basis), in whole credits; 0 for nothing.
export function creditsFor(costMicros:number,book:Pick<PriceBook,'basisMicros'>=DEFAULT_PRICE_BOOK):number{
 if(!Number.isFinite(costMicros)||costMicros<=0)return 0;
 const basis=Math.max(1,Math.round(book.basisMicros));
 return Math.floor((Math.ceil(costMicros)+basis-1)/basis);
}
export const costMicros=(key:CostKey,book:PriceBook=DEFAULT_PRICE_BOOK)=>book.costs[key];
export const creditsForKey=(key:CostKey,book:PriceBook=DEFAULT_PRICE_BOOK)=>creditsFor(costMicros(key,book),book);
// Every fixed price in credits, for the pages ("8 credits" before an action starts).
export function creditPrices(book:PriceBook=DEFAULT_PRICE_BOOK):Record<CostKey,number>{
 return Object.fromEntries(COST_KEYS.map(k=>[k,creditsForKey(k,book)])) as Record<CostKey,number>;
}
// What the meter shows: credits spent this period and credits left now.
export type CreditMeter={used:number;left:number;held:number;percent:number;level:0|80|100;periodFrom:string|null;periodTo:string|null;resetsOn:string|null};
export const WARN_AT=0.8;
export function creditMeter(input:{spent:number;total:number;held:number;periodFrom:string|null;periodTo:string|null}):CreditMeter{
 const used=Math.max(0,Math.round(input.spent)),held=Math.max(0,Math.round(input.held)),left=Math.max(0,Math.floor(input.total)-held);
 const capacity=used+left;
 const percent=capacity>0?Math.min(100,Math.round(used/capacity*100)):100;
 const level:0|80|100=left<=0?100:used>=WARN_AT*capacity?80:0;
 const resetsOn=input.periodTo?new Date(Date.parse(input.periodTo+'T00:00:00Z')+86_400_000).toISOString().slice(0,10):null;
 return {used,left,held,percent,level,periodFrom:input.periodFrom,periodTo:input.periodTo,resetsOn};
}
