// Provider and model names, and what a client sees instead (owner's decision
// F-050, 2026-11-15): a client without its own keys never sees a provider or a
// model name — not on cards, pickers, cost lines, progress, errors, recovery
// messages or notices. Nmesis staff, and companies whose plan includes their own
// keys, may see them. Every screen takes its words from here.

// What the harness and the tests look for. Model names included: they name the
// provider as surely as the provider does.
export const PROVIDER_NAMES=['OpenAI','ChatGPT','GPT','Higgsfield','Google','Gemini','Nano Banana','Nano','Topaz','Kling','Seedance','Seedream','PixVerse','ByteDance','Genjutsu','Grok','Sunburst','Flare','Marketing Studio','Gigapixel'];
export const PROVIDER_PATTERN=new RegExp(`\\b(${PROVIDER_NAMES.map(n=>n.replace(/ /g,'\\s+')).join('|')})\\b`,'i');

// Image engines (key visuals, line-ups, area edits): the provider choice.
export type Engine='openai'|'google'|'higgsfield';
export const ENGINE_LABEL:Record<Engine,string>={openai:'Studio',google:'Reference match',higgsfield:'Campaign look'};
// Image models, by id: a plain quality name.
const IMAGE_MODEL_LABEL:Record<string,string>={
 'gpt-image-2.6-sunburst':'High detail','gpt-image-2.6-flare':'Fast',
 'gemini-3-pro-image':'High detail','gemini-nano-banana-2.1':'Fast',
 'marketing-studio/image/sunburst':'High detail','marketing-studio/image/flare':'Fast',
};
export const imageModelLabel=(id:string|undefined|null)=>(id&&IMAGE_MODEL_LABEL[id])||(id&&/grok/i.test(id)?'Quick · up to 2K':'Standard');
// Film models, by id.
const FILM_MODEL_LABEL:[RegExp,string][]=[
 [/kling-video\/v3\.0\/pro/,'High detail'],[/kling-video\/v3\.0\/4k/,'4K'],[/kling-video\/v3\.0-turbo/,'Quick'],[/kling-video\/v3\.0/,'Standard'],
 [/kling/,'Single shot'],[/seedance-2\.0\/reference/,'From your car'],[/seedance-2\.0\/image/,'Animate image'],[/pixverse/,'Expressive'],
];
export const filmModelLabel=(id:string|undefined|null)=>FILM_MODEL_LABEL.find(([re])=>id&&re.test(id))?.[1]||'Standard';
// Upscale models: their own variant, without the maker.
export const upscaleModelLabel=(m:{id:string;variant?:string;label:string})=>m.id==='bytedance'?'Simple':(m.variant||m.label).replace(/\b(Topaz|Gigapixel|ByteDance)\b\s*[·:-]?\s*/gi,'').replace(/^Upscale\s+/,'').trim()||'Standard';

// Plain words for a message that came from a provider or names one (errors,
// recovery, notices). The original belongs in the server log, not on screen.
const REWRITES:[RegExp,string][]=[
 [/\b(your|the|their)\s+(company['’]s\s+)?(Google(\s+AI\s+Studio)?|OpenAI|Higgsfield|Topaz)\b/gi,'$1 $2provider'],
 [/\bNano\s+Banana(\s+(Pro|2\.1))?\b/gi,'the reference engine'],
 [/\bHiggsfield(['’]s)?(\s+(API|Marketing Studio))?\b/gi,'the generation service'],
 [/\b(ChatGPT\s*\/\s*OpenAI|OpenAI|ChatGPT)(['’]s)?\b/gi,'the image service'],
 [/\bGPT[-\s]?Image[\w.\s-]*?\b(?=[.,:;)]|\s|$)/gi,'the image model'],
 [/\bGoogle(\s+AI\s+Studio)?(['’]s)?\b|\bGemini\b/gi,'the image service'],
 [/\bTopaz(\s+(Labs|Gigapixel))?(['’]s)?\b/gi,'the upscaling service'],
 [/\b(Kling|Seedance|Seedream|PixVerse|ByteDance|Genjutsu|Grok)\b(\s*\d+(\.\d+)?)?(\s*·\s*[A-Z]\w*)?/g,'the video model'],
 [/\b(Sunburst|Flare)\s*\d(\.\d)?\b/gi,'the image model'],
];
export function plainProviderText(text:string):string{
 let out=text;
 for(const [re,word] of REWRITES)out=out.replace(re,word);
 // "the image service is" → keep sentences starting with a capital.
 return out.replace(/(^|[.!?]\s+)the /g,(m,p)=>p+'The ');
}
export const namesProvider=(text:string)=>PROVIDER_PATTERN.test(text);
