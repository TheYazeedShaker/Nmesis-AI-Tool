import {redirect} from 'next/navigation';
// The brand kit moved into Settings (Settings → Brand kit); beside a tool, the
// Brand panel shows it to use. An old link to /brand lands there. The proxy
// has already asked for a signed-in person, as on every workspace page.
export default function Brand():never{
 redirect('/company/brand');
}
