import localFont from "next/font/local";
// The Studio's own interface fonts (Inter for text, Outfit for display; app/tokens.css),
// from the self-hosted font catalogue's files (public/fonts/, built by
// scripts/fonts/build-catalogue.mjs from the official open font repository), so
// neither a build nor a page ever asks a third party for a font. Each is named by
// a CSS variable on <html>; preload stays off, so a page downloads a font only when
// it draws it. The canvas editor's fonts (the brand kit's and the whole catalogue)
// are loaded by the editor itself, by name, only when a design uses them
// (components/canvas/fonts.ts). The loader reads each call's options as written:
// literal objects only (tests/editor-fonts.test.mjs holds them to the catalogue).
const inter=localFont({src:[{path:"../public/fonts/inter/inter-normal.woff2",weight:"100 900",style:"normal"},{path:"../public/fonts/inter/inter-italic.woff2",weight:"100 900",style:"italic"}],variable:"--font-inter",display:"swap",preload:false,fallback:["-apple-system","Segoe UI","system-ui","sans-serif"]});
const outfit=localFont({src:[{path:"../public/fonts/outfit/outfit-normal.woff2",weight:"100 900",style:"normal"}],variable:"--font-outfit",display:"swap",preload:false,fallback:["Segoe UI","system-ui","sans-serif"]});

/** The classes that put each interface font's variable on <html>. */
export const fontVariables=[inter,outfit].map(f=>f.variable).join(" ");
