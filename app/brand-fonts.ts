import {Inter,Lato,Montserrat,Oswald,Outfit,Playfair_Display,Poppins,Roboto} from "next/font/google";
// Every font of the brand kit's list (lib/brand-kit.ts BRAND_FONTS), served
// by the Studio itself: Next's font loader fetches the files when the Studio
// is built and serves them from its own address, so drawing them on the canvas
// asks no third party and never taints the export. Each is named by a CSS
// variable on <html> (lib/editor/fonts.ts FONT_VARS); preload stays off, so a
// page downloads a font only when it draws it (the canvas asks for it first,
// components/canvas/fonts.ts). Latin only, the weights text layers use.
// Inter and Outfit are the Studio's own fonts as well (app/tokens.css).
// The loader reads each call's options as written: literal objects only.
const inter=Inter({subsets:["latin"],weight:["400","500","600","700"],variable:"--font-inter",display:"swap",preload:false});
const outfit=Outfit({subsets:["latin"],weight:["400","500","600","700"],variable:"--font-outfit",display:"swap",preload:false});
const poppins=Poppins({subsets:["latin"],weight:["400","600","700"],variable:"--font-poppins",display:"swap",preload:false});
const montserrat=Montserrat({subsets:["latin"],weight:["400","600","700"],variable:"--font-montserrat",display:"swap",preload:false});
const playfair=Playfair_Display({subsets:["latin"],weight:["400","600","700"],variable:"--font-playfair",display:"swap",preload:false});
const roboto=Roboto({subsets:["latin"],weight:["400","600","700"],variable:"--font-roboto",display:"swap",preload:false});
// Lato has no 600: a semibold heading in Lato draws in its bold.
const lato=Lato({subsets:["latin"],weight:["400","700"],variable:"--font-lato",display:"swap",preload:false});
const oswald=Oswald({subsets:["latin"],weight:["400","600","700"],variable:"--font-oswald",display:"swap",preload:false});

/** The classes that put every font's variable on <html>. */
export const fontVariables=[inter,outfit,poppins,montserrat,playfair,roboto,lato,oswald].map(f=>f.variable).join(" ");
