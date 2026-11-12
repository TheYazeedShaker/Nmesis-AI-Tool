// Module hooks for scripts/verify: Node's own ESM loader runs the studio's
// TypeScript sources, with three additions registered by studio-flow.mjs:
//  - '@/…' resolves to the repository root (the tsconfig "@/*" path);
//  - extensionless relative imports from the studio's sources try .ts, .tsx, /index.ts;
//  - stand-ins: '@/lib/studio-context' resolves to ./auth-stub.mjs (sign-in is stubbed
//    here only); a caller may pass other stand-ins with register(…, {data:{stubs}}).
// .ts/.tsx files outside node_modules are transpiled with the repository's TypeScript.
import {readFile,stat} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const ROOT=new URL('../../',import.meta.url);
let STUBS={'@/lib/studio-context':new URL('./auth-stub.mjs',import.meta.url).href};
export function initialize(data){if(data?.stubs)STUBS={...STUBS,...data.stubs}}
const ts=createRequire(new URL('package.json',ROOT))('typescript');
const isSource=url=>url.startsWith(ROOT.href)&&!url.includes('/node_modules/');

async function existing(base){
 for(const candidate of [base,base+'.ts',base+'.tsx',base+'/index.ts']){
  try{if((await stat(fileURLToPath(candidate))).isFile())return candidate}catch{/* try the next candidate */}
 }
}

export async function resolve(specifier,context,next){
 if(STUBS[specifier])return {url:STUBS[specifier],shortCircuit:true};
 const parent=context.parentURL;
 const base=specifier.startsWith('@/')?new URL(specifier.slice(2),ROOT).href
  :(specifier.startsWith('./')||specifier.startsWith('../'))&&parent&&isSource(parent)?new URL(specifier,parent).href:undefined;
 if(base){
  const url=await existing(base);
  if(url)return {url,format:/\.tsx?$/.test(url)?'module':undefined,shortCircuit:true};
 }
 return next(specifier,context);
}

export async function load(url,context,next){
 if(/\.tsx?$/.test(url)&&isSource(url)){
  const path=fileURLToPath(url);
  const {outputText}=ts.transpileModule(await readFile(path,'utf8'),{fileName:path,compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,sourceMap:false}});
  return {format:'module',source:outputText,shortCircuit:true};
 }
 return next(url,context);
}
