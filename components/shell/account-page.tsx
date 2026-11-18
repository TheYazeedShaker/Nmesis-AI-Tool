'use client';
import * as React from 'react';
import Link from 'next/link';
import {PageHeader,Section} from '@/components/ds/layout';
import {AccountNotices,useAccount} from '@/components/studio-account';
import {WorkspaceFrame} from '@/components/workspace/frame';
import {workName} from '@/lib/accounts/names';
import {THEME_CHOICES,setTheme,useTheme} from '@/lib/theme';
import {Avatar} from './side-nav';

// Your account: who is signed in, for which company and as what, the theme,
// and how to change the password (the same "Forgot your password?" email the
// sign-in page sends). Everything here is the person's own.
const ROLE={owner:'Owner',creator:'Creator',viewer:'Viewer'} as const;

export function AccountPage(){
 const account=useAccount(),theme=useTheme();
 return <WorkspaceFrame current="account" notices={<AccountNotices variant="ds"/>}>
  <PageHeader title="Your account" lede="Who you are signed in as, and how the Studio looks for you."/>
  {account?<div className="ds-stack studio-account-page">
   <Section title="Profile">
    <dl className="studio-facts">
     <div className="studio-fact studio-fact-who"><Avatar account={account}/><span className="studio-account-names">{account.user.name&&<b>{account.user.name}</b>}<span className="ds-muted">{account.user.email}</span></span></div>
     <div className="studio-fact"><dt className="ds-label">Company</dt><dd>{workName(account)}</dd></div>
     <div className="studio-fact"><dt className="ds-label">Role</dt><dd>{account.viewingAs?'Staff (read-only)':ROLE[account.role]}</dd></div>
    </dl>
   </Section>
   <Section title="Theme">
    <div className="ds-segmented studio-theme" role="group" aria-label="Theme">{THEME_CHOICES.map(t=><button key={t.id} type="button" aria-pressed={theme===t.id} onClick={()=>setTheme(t.id)}>{t.label}</button>)}</div>
    <p className="ds-help">System follows your computer’s light or dark setting. Kept in this browser.</p>
   </Section>
   <Section title="Password">
    <p className="ds-help">To change your password, sign out and choose “Forgot your password?” on the sign-in page; we email you a link.</p>
    <div><Link className="ds-link" href="/signin/forgot">Send a password link</Link></div>
   </Section>
  </div>:<p className="ds-muted" role="status">Loading your account…</p>}
 </WorkspaceFrame>;
}
