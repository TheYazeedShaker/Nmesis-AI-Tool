import Link from 'next/link';
// Settings' own pages: Company (/company) and Brand kit (/company/brand). Links,
// not tabs (each is its own page, with its own address); the one on screen is
// aria-current="page". The design system's navigation links (.ds-nav).
export const SETTINGS_PAGES=[
 {key:'company',label:'Company',href:'/company'},
 {key:'brand',label:'Brand kit',href:'/company/brand'},
] as const;
export type SettingsPage=typeof SETTINGS_PAGES[number]['key'];

export function SettingsNav({current}:{current:SettingsPage}){
 return <nav className="ds-nav" aria-label="Settings">
  {SETTINGS_PAGES.map(p=><Link key={p.key} href={p.href} className="ds-nav-link" aria-current={p.key===current?'page':undefined}>{p.label}</Link>)}
 </nav>;
}
