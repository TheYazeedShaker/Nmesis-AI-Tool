import type {Metadata} from 'next';
// The page itself is a client component; its title lives here.
export const metadata:Metadata={title:'Film · Nmesis Studio'};
export default function FilmLayout({children}:{children:React.ReactNode}){return <>{children}</>}
