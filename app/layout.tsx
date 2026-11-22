import type {Metadata} from "next";
import "./globals.css";
// The design system (Phase 0): tokens and the .ds- components, for every screen.
// Neither restyles anything outside .ds- or [data-theme], so existing screens
// keep their look until they move onto it (Phase 2b and 3).
import "./tokens.css";
import "./design-system.css";
// Phase 2b: the one top bar on every screen (components/studio-topbar.tsx).
import "./studio-shell.css";
// Phase 3: the rebuilt screens (components/workspace).
import "./workspace.css";
// Phase 3 group 2: the one editor (components/editor).
import "./editor.css";
import "./panels.css";
import "./inputs.css";
// The shell: the left navigation, the account menu and its panels (References, Uploads), Brand and Share.
import "./side-nav.css";
import "./references.css";
import "./brand.css";
import "./share.css";
import "./elements.css";
import "./account.css";
import "./canvas.css";
import {LinkLanding} from "@/components/link-landing";
import {StudioProviders} from "@/components/studio-providers";
// The Studio's interface fonts, self-hosted (app/brand-fonts.ts). preload stays
// off, so no page fetches a font it does not draw.
import {fontVariables} from "./brand-fonts";
export const metadata:Metadata={title:"Nmesis Studio — Automotive key visuals",description:"Choose a vehicle view, direct the atmosphere, and create automotive campaign visuals.",icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" className={fontVariables}><body><StudioProviders>{children}</StudioProviders><LinkLanding/></body></html>}
