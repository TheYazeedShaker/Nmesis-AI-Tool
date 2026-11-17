// A brand's logo in the top bar, the switcher and the menu (BrandMark in
// components/studio-topbar.tsx). /api/brands/<id>/logo answers with a signed
// link to the logo, or 204 when the brand truly has none (or it cannot be read
// now). With no logo the brand's name stands alone: never its initials next to
// the same name. A brand found to have no logo is remembered for the rest of
// this browser session, so later pages do not reserve a plate for it and then
// take it away. No imports: tests load it under Node's strip-only mode.
export type LogoBrand={id:string;name:string}|null|undefined;
export const LOGO_MISSING_KEY='studio-logo-missing';
type Store=Pick<Storage,'getItem'|'setItem'>;
const session=():Store|null=>{try{return typeof sessionStorage==='undefined'?null:sessionStorage}catch{return null}};
let missing:Set<string>|undefined;
function known(store:Store|null):Set<string>{
 if(missing)return missing;
 missing=new Set();
 try{const v=JSON.parse(store?.getItem(LOGO_MISSING_KEY)||'[]');if(Array.isArray(v))for(const id of v.slice(0,200))if(typeof id==='string')missing.add(id)}catch{/* unreadable: start empty */}
 return missing;
}
/** Where the logo is read from. */
export const logoSrc=(id:string)=>'/api/brands/'+encodeURIComponent(id)+'/logo';
/** 'logo': draw the logo (it is loading or loaded); 'name': the name alone. */
export function logoView(brand:LogoBrand,failed:boolean,store:Store|null=session()):'logo'|'name'{
 if(!brand||!brand.id||failed)return 'name';
 return known(store).has(brand.id)?'name':'logo';
}
/** The logo answered with nothing (204) or could not load: the name alone from now on. */
export function logoMissing(id:string,store:Store|null=session()){
 const set=known(store);if(set.has(id))return;
 set.add(id);
 try{store?.setItem(LOGO_MISSING_KEY,JSON.stringify([...set].slice(-200)))}catch{/* storage off: remembered for this page only */}
}
/** For tests: forget what this page learned. */
export function forgetLogoMisses(){missing=undefined}
