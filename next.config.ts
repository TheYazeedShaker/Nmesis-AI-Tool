import type {NextConfig} from 'next';
// The editor's self-hosted fonts (public/fonts/, docs/fonts.md) change only when the catalogue is
// rebuilt: browsers keep them for 30 days and refresh them in the background after that.
const config:NextConfig={serverExternalPackages:['postgres'],poweredByHeader:false,
 async headers(){return [{source:'/fonts/:path*',headers:[{key:'Cache-Control',value:'public, max-age=2592000, stale-while-revalidate=86400'}]}]}};
export default config;
