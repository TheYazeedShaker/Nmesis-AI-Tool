import type {Metadata} from "next";
import {Inter,Outfit} from "next/font/google";
import "./globals.css";
// The design system (Phase 0): tokens and the .ds- components, for every screen.
// Neither restyles anything outside .ds- or [data-theme], so existing screens
// keep their look until they move onto it (Phase 2b and 3).
import "./tokens.css";
import "./design-system.css";
// Phase 2b: the one top bar on every screen (components/studio-topbar.tsx).
import "./studio-shell.css";
import {LinkLanding} from "@/components/link-landing";
import {StudioProviders} from "@/components/studio-providers";
// The Nmesis fonts. preload stays off until screens use them (Phase 2b), so no
// page fetches a font it does not draw.
const inter=Inter({subsets:["latin"],weight:["400","500","600","700"],variable:"--font-inter",display:"swap",preload:false});
const outfit=Outfit({subsets:["latin"],weight:["500","600","700"],variable:"--font-outfit",display:"swap",preload:false});
export const metadata:Metadata={title:"Nmesis Studio — Automotive key visuals",description:"Choose a vehicle view, direct the atmosphere, and create automotive campaign visuals.",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className={`${inter.variable} ${outfit.variable}`}><body><StudioProviders>{children}</StudioProviders><LinkLanding/></body></html>}
