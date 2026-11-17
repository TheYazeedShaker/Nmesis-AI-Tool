import type {Metadata} from 'next';
// The page itself is a client component; its title lives here.
export const metadata:Metadata={title:'Reference lab · Nmesis Studio'};
export default function ReferenceLabLayout({children}:{children:React.ReactNode}){return <>{children}</>}
