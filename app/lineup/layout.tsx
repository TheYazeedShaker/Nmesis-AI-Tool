import type {Metadata} from 'next';
// The page itself is a client component; its title lives here.
export const metadata:Metadata={title:'Line-up · Nmesis Studio'};
export default function LineupLayout({children}:{children:React.ReactNode}){return <>{children}</>}
