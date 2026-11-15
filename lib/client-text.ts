// A message on its way to the page. On the server, lib/provider-scope.ts plugs
// in the per-request rewrite (no provider or model names for clients without
// their own keys, F-050); in the browser, and outside a request, the text is
// unchanged. Safe to import from code the browser also loads. The hook lives on
// globalThis so a module that imports nothing (lib/films.ts) can use it too.
type Rewrite=(text:string)=>string;
const KEY='__studioClientText';
export function setClientTextRewrite(fn:Rewrite){(globalThis as Record<string,unknown>)[KEY]=fn}
export function clientText<T extends string|null|undefined>(text:T):T{const fn=(globalThis as Record<string,unknown>)[KEY] as Rewrite|undefined;return (text&&fn?fn(text):text) as T}
