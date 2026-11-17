import type {Metadata} from 'next';
// The page itself is a client component; its title lives here.
export const metadata:Metadata={title:'Swap · Nmesis Studio'};
export default function SwapLayout({children}:{children:React.ReactNode}){return <>{children}</>}
