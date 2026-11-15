import { Inter, Outfit } from 'next/font/google';
import '../tokens.css';
import '../design-system.css';

// The design-system routes (the gallery and the wireframes) load the tokens,
// the components and the Nmesis fonts. Phase 0 keeps them here so no existing
// screen changes; Phase 3 moves these three lines into the root layout as the
// screens move onto the system. preload is off until then, so nothing is
// fetched before a page uses the fonts.
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-inter', display: 'swap', preload: false });
const outfit = Outfit({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-outfit', display: 'swap', preload: false });

export default function DesignSystemLayout({ children }: { children: React.ReactNode }) {
  return <div className={`${inter.variable} ${outfit.variable}`}>{children}</div>;
}
