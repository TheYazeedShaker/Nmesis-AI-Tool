import type {Metadata} from 'next';
import '../settings.css';
export const metadata:Metadata={title:'Company settings · Nmesis Studio'};
export default function CompanyLayout({children}:{children:React.ReactNode}){return <>{children}</>}
