'use client';
import * as React from 'react';
import Link from 'next/link';
import { Aperture, Building2, ChevronDown, Eye, FolderOpen, Home, LayoutGrid, LifeBuoy, Shapes } from 'lucide-react';
import { Dialog } from './dialog';
import { matches, type ComboOption } from './combobox';
import { meterWords, type Meter } from '@/lib/ds/words';

// The app shell: one top bar on every screen (brand, navigation, the credit
// meter, Nmesis support-access status, the company switcher), the "Viewing as"
// banner for staff inside a client, and the phone navigation below 768px.
// Presentational: the page passes what getStudioContext() and the credits
// overview already know. Phase 3 wires it into every screen.

export type NavItem = { href: string; label: string; icon: React.ReactNode; current?: boolean };
type NavKey = 'home' | 'library' | 'projects' | 'tools';
export const NAV_HREFS: Record<NavKey, string> = { home: '/', library: '/library', projects: '/projects', tools: '/tools' };
export const DEFAULT_NAV = (current: string, hrefs: Record<NavKey, string> = NAV_HREFS): NavItem[] => [
  { href: hrefs.home, label: 'Home', icon: <Home />, current: current === 'home' },
  { href: hrefs.library, label: 'Library', icon: <LayoutGrid />, current: current === 'library' },
  { href: hrefs.projects, label: 'Projects', icon: <FolderOpen />, current: current === 'projects' },
  { href: hrefs.tools, label: 'Tools', icon: <Shapes />, current: current === 'tools' },
];

const hidden = (node: React.ReactNode) => (React.isValidElement(node) ? React.cloneElement(node as React.ReactElement<{ 'aria-hidden'?: boolean }>, { 'aria-hidden': true }) : node);

/** Used / left this period; one click to Usage. Warn at 80%, out at 100%. */
export function CreditMeter({ meter, href = '/usage' }: { meter: Meter; href?: string }) {
  const w = meterWords(meter);
  return (
    <Link className="ds-meter" href={href} data-level={w.level} aria-label={`Credits: ${w.label}. Open Usage.`}>
      {!meter.unlimited && <span className="ds-meter-track" aria-hidden="true"><span className="ds-meter-fill" style={{ transform: `scaleX(${w.percent / 100})` }} /></span>}
      <span aria-hidden="true"><b>{w.left}</b> <span className="ds-meter-word ds-meter-left">left</span></span>
    </Link>
  );
}

/** Whether Nmesis staff may open this company (S3's opt-in rule). Owners click
 *  through to Company settings; for everybody else it is a statement. */
export function SupportStatus({ until, href }: { until: string | null; href?: string }) {
  const on = !!until;
  const text = on ? `Nmesis support access until ${until}` : 'Nmesis support access off';
  const inner = <><LifeBuoy aria-hidden="true" /><span className="ds-support-word">{on ? `Support until ${until}` : 'Support off'}</span></>;
  return href
    ? <a className="ds-support" data-on={on} href={href} aria-label={`${text}. Change in Company settings.`} title={text}>{inner}</a>
    : <span className="ds-support" data-on={on} role="status" aria-label={text} title={text}>{inner}</span>;
}

export type Company = { id: string; name: string; kind?: 'internal' | 'client'; plan?: string };

/** The company switcher. Staff see Nmesis and Clients; over eight, a search. */
export function CompanySwitcher({ current, companies, onSwitch, staff }: { current: Company; companies: Company[]; onSwitch: (id: string) => void; staff?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const initials = current.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const options: ComboOption[] = companies.map((c) => ({ value: c.id, label: c.name, group: staff ? (c.kind === 'internal' ? 'Nmesis' : 'Clients') : undefined, hint: c.plan }));
  const shown = options.filter((o) => matches(o, query));
  const searchId = React.useId().replace(/[^a-zA-Z0-9]/g, '') + '-q';
  if (companies.length <= 1 && !staff) {
    return <span className="ds-switcher" aria-label={`Company: ${current.name}`}><span className="ds-avatar" aria-hidden="true">{initials}</span><span className="ds-switcher-name ds-truncate">{current.name}</span></span>;
  }
  return (
    <>
      <button type="button" className="ds-switcher" aria-haspopup="dialog" onClick={() => setOpen(true)} aria-label={`Company: ${current.name}. Switch company.`}>
        <span className="ds-avatar" aria-hidden="true">{initials}</span>
        <span className="ds-switcher-name ds-truncate" title={current.name}>{current.name}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      <Dialog open={open} onClose={() => { setOpen(false); setQuery(''); }} title="Switch company">
        {companies.length > 8 && (
          <div className="ds-field">
            <label className="ds-label" htmlFor={searchId}>Search companies</label>
            <input id={searchId} className="ds-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
          </div>
        )}
        <ul className="ds-stack" aria-label="Companies">
          {shown.length === 0 && <li className="ds-muted">No company matches “{query}”.</li>}
          {shown.map((o, i) => {
            const head = o.group && (i === 0 || shown[i - 1].group !== o.group) ? o.group : null;
            return (
              <li key={o.value}>
                {head && <p className="ds-label-caps">{head}</p>}
                <button type="button" className="ds-menu-item" aria-current={o.value === current.id || undefined} onClick={() => { setOpen(false); setQuery(''); onSwitch(o.value); }}>
                  <Building2 aria-hidden="true" /><span className="ds-truncate" title={o.label}>{o.label}</span>
                  {o.hint && <span className="ds-badge">{o.hint}</span>}
                  {o.value === current.id && <span className="ds-muted">Current</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </Dialog>
    </>
  );
}

/** Staff inside a client's workspace: read-only, every opening logged. */
export function ViewingAs({ company, until, onLeave }: { company: string; until?: string | null; onLeave?: () => void }) {
  return (
    <div className="ds-viewing" role="status">
      <Eye aria-hidden="true" />
      <span><b>Viewing as {company}</b> · read-only{until ? ` · support access until ${until}` : ''}. This opening is shown to the company’s owners.</span>
      {onLeave && <button type="button" className="ds-link" onClick={onLeave}>Back to Nmesis</button>}
    </div>
  );
}

export function Banner({ kind = 'info', icon, children }: { kind?: 'info' | 'warn' | 'bad'; icon?: React.ReactNode; children: React.ReactNode }) {
  return <div className={`ds-banner${kind !== 'info' ? ` ${kind}` : ''}`} role={kind === 'bad' ? 'alert' : 'status'}>{hidden(icon)}<span>{children}</span></div>;
}

export function TopBar({ nav, end }: { nav: NavItem[]; end: React.ReactNode }) {
  return (
    <header className="ds-topbar">
      <Link className="ds-brand" href="/" aria-label="Nmesis Studio, Home">
        <span className="ds-brand-mark" aria-hidden="true"><Aperture /></span>
        <span aria-hidden="true">NMESIS <span className="ds-brand-sub">STUDIO</span></span>
      </Link>
      <nav className="ds-nav" aria-label="Main">
        {nav.map((n) => (
          <Link key={n.href} className="ds-nav-link" href={n.href} aria-current={n.current ? 'page' : undefined}>
            {hidden(n.icon)}<span className="ds-nav-word">{n.label}</span>
          </Link>
        ))}
      </nav>
      <div className="ds-topbar-end">{end}</div>
    </header>
  );
}

export function PhoneNav({ nav }: { nav: NavItem[] }) {
  return (
    <nav className="ds-phone-nav" aria-label="Main" style={{ ['--ds-phone-nav-items' as string]: nav.length }}>
      {nav.map((n) => <Link key={n.href} href={n.href} aria-current={n.current ? 'page' : undefined}>{hidden(n.icon)}{n.label}</Link>)}
    </nav>
  );
}

export function AppShell({ nav, topEnd, banners, children, theme, bleed }: { nav: NavItem[]; topEnd: React.ReactNode; banners?: React.ReactNode; children: React.ReactNode; theme?: 'light' | 'dark'; /** No page padding: the editor fills the space. */ bleed?: boolean }) {
  return (
    <div className="ds-app ds-shell" data-theme={theme}>
      <a className="ds-skip" href="#main">Skip to content</a>
      <TopBar nav={nav} end={topEnd} />
      {banners}
      <main id="main" className={bleed ? 'ds-main bleed' : 'ds-main'} tabIndex={-1}>{children}</main>
      <PhoneNav nav={nav} />
    </div>
  );
}
