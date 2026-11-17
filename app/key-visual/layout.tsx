import type {Metadata} from 'next';
// The page itself is a client component; its title lives here.
export const metadata:Metadata={title:'Key visual · Nmesis Studio'};
export default function KeyVisualLayout({children}:{children:React.ReactNode}){return <>{children}</>}
