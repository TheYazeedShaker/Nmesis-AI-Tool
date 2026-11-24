import type {NextConfig} from 'next';
// The editor's self-hosted fonts (public/fonts/, docs/fonts.md) change only when the catalogue is
// rebuilt: browsers keep them for 30 days and refresh them in the background after that.
// The brand-font sanitiser's tools (lib/brand-fonts/sanitise.ts) load their WebAssembly from their own
// package folders at run time: they stay outside the bundle, and the upload route's function carries the
// HarfBuzz file it reads by path.
const config:NextConfig={serverExternalPackages:['postgres','subset-font','fontverter','wawoff2','harfbuzzjs'],poweredByHeader:false,
 outputFileTracingIncludes:{'/api/brand-fonts':['./node_modules/harfbuzzjs/dist/harfbuzz-subset.wasm']},
 async headers(){return [{source:'/fonts/:path*',headers:[{key:'Cache-Control',value:'public, max-age=2592000, stale-while-revalidate=86400'}]}]}};
export default config;
