// The name a person sees for where they work: the brand, not the company
// (Phase 3 polish). The company's legal name is only for Company settings,
// Usage and billing. Staff see "Brand · Company" in their switcher, so they
// know whose workspace a brand belongs to.
type Named={id:string;name:string};
export type WorkPlace={org:Named;brand?:Named|null};

export function workName(a:WorkPlace){return a.brand?.name||a.org.name}

export function staffLabel(brand:Named|null|undefined,org:Named){return brand?`${brand.name} · ${org.name}`:org.name}

export function initialsOf(name:string){
 const w=name.trim().split(/\s+/).filter(Boolean);
 return (w.length>1?w[0][0]+w[1][0]:(w[0]||'?').slice(0,2)).toUpperCase();
}
