import type {Metadata} from 'next';
// The page itself is a client component; its title lives here.
export const metadata:Metadata={title:'Story · Nmesis Studio'};
export default function StoryLayout({children}:{children:React.ReactNode}){return <>{children}</>}
