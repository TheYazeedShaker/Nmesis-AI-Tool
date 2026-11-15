'use client';
import * as React from 'react';
import Link from 'next/link';
import {
  Archive, Bell, Copy, Download, FolderInput, Hourglass, MoreHorizontal, Pencil, Plus, RefreshCw, Save, Search, Settings, Sparkles, Trash2,
} from 'lucide-react';
import { Button, IconButton } from '@/components/ds/button';
import { AffixInput, Checkbox, Field, Input, Radio, RadioGroup, Select, Slider, Switch, Textarea } from '@/components/ds/field';
import { Combobox } from '@/components/ds/combobox';
import { Fold, PageHeader, Section } from '@/components/ds/layout';
import { Badge, Loading, SkeletonPanel, SkeletonRow, SkeletonTile, State, Upsell } from '@/components/ds/feedback';
import { ConfirmProvider, Dialog, useConfirm } from '@/components/ds/dialog';
import { ToastProvider, useToast } from '@/components/ds/toast';
import { JobCard } from '@/components/ds/job-card';
import { BulkBar, MediaGrid, MediaTile, Viewer } from '@/components/ds/media';
import { Menu, MenuItem, MenuSeparator } from '@/components/ds/menu';
import { Tabs } from '@/components/ds/tabs';
import { Banner, CompanySwitcher, CreditMeter, DEFAULT_NAV, PhoneNav, SupportStatus, TopBar, ViewingAs } from '@/components/ds/shell';
import { WIRE_HREFS } from './wireframes';
import { SCREENS, SCREEN_TITLES } from './screens';
import { CARS, COMPANIES, JOBS, LONG_NAME, library } from './sample';

// The design-system gallery: every token and every component in every state,
// light and dark side by side. Staff only (see app/design-system/page.tsx).

const SECTIONS = [
  ['tokens', 'Tokens'], ['shell', 'App shell'], ['wireframes', 'Wireframes'], ['page', 'Page header, sections'], ['forms', 'Form fields'],
  ['controls', 'Choices and sliders'], ['buttons', 'Buttons'], ['destructive', 'Destructive actions'], ['toasts', 'Toasts'], ['jobs', 'Job card'],
  ['media', 'Media tiles and grid'], ['viewer', 'Viewer'], ['states', 'Empty, no results, error'], ['upsell', 'Upsell and badges'],
  ['skeletons', 'Skeletons'], ['tabs', 'Tabs'], ['panels', 'Drawer and modal'], ['menu', 'Menu'],
] as const;

function Both({ children, label, stack }: { children: (theme: 'light' | 'dark') => React.ReactNode; label?: string; stack?: boolean }) {
  return (
    <div className={stack ? 'ds-specimen stack' : 'ds-specimen'}>
      {(['light', 'dark'] as const).map((t) => (
        <div key={t} className="ds-specimen-pane" data-theme={t} aria-label={`${label ? `${label}, ` : ''}${t}`} role="group">
          <p className="ds-specimen-label">{t}</p>
          {children(t)}
        </div>
      ))}
    </div>
  );
}

function Block({ id, title, lede, children }: { id: string; title: string; lede?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="ds-stack">
      <div><h2 className="ds-block-title" id={`${id}-h`}>{title}</h2>{lede && <p className="ds-page-lede">{lede}</p>}</div>
      {children}
    </section>
  );
}

const COLOURS = ['--ds-bg', '--ds-panel', '--ds-panel-2', '--ds-panel-hover', '--ds-panel-3', '--ds-border', '--ds-border-strong', '--ds-text', '--ds-text-strong', '--ds-muted', '--ds-muted-2',
  '--ds-accent', '--ds-accent-text', '--ds-accent-ink', '--ds-accent-soft', '--ds-ring', '--ds-success', '--ds-info', '--ds-warn', '--ds-danger', '--ds-success-soft', '--ds-info-soft', '--ds-warn-soft', '--ds-danger-soft', '--ds-scrim', '--ds-media-bg'];
const TEXT = ['2xs', 'xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl', 'display'];
const TEXT_PX: Record<string, number> = { '2xs': 10, xs: 11, sm: 12, base: 13, md: 14, lg: 16, xl: 20, '2xl': 24, '3xl': 32, display: 44 };
const SPACE = [2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64];
const RADII = ['xs', 'sm', 'md', '', 'lg', 'pill'];

function Tokens() {
  return <>
    <Both label="Colours">{() => (
      <div className="ds-swatches">
        {COLOURS.map((c) => <div key={c} className="ds-swatch"><span style={{ background: `var(${c})` }} /><span>{c.replace('--ds-', '')}</span></div>)}
      </div>
    )}</Both>
    <Section title="Type" count="10 sizes · 4 weights">
      <div className="ds-stack">
        {TEXT.map((t) => (
          <div key={t} className="ds-scale-row">
            <code>--ds-text-{t} · {TEXT_PX[t]}px</code>
            <span className="ds-truncate" style={{ fontSize: `var(--ds-text-${t})`, lineHeight: `var(--ds-leading-${t})`, fontFamily: TEXT_PX[t] >= 16 ? 'var(--ds-font-display)' : undefined }}>Demo SUV key visual · 1,250 credits</span>
          </div>
        ))}
        <div className="ds-row">
          {['regular', 'medium', 'semibold', 'bold'].map((w) => <span key={w} style={{ fontWeight: `var(--ds-weight-${w})` }}>{w}</span>)}
          <span className="ds-num">Tabular 1,111 · 8,888 credits</span>
        </div>
      </div>
    </Section>
    <Section title="Spacing" count="4px base, 11 steps">
      <div className="ds-stack">
        {SPACE.map((s) => <div key={s} className="ds-scale-row"><code>--ds-space-{s}</code><span className="ds-scale-bar" style={{ width: `var(--ds-space-${s})` }} /></div>)}
      </div>
    </Section>
    <Section title="Corners, elevation, motion, layers" count="6 · 3 · 3 · 7">
      <div className="ds-row">
        {RADII.map((r) => <span key={r || 'base'} className="ds-badge" style={{ borderRadius: `var(--ds-radius${r ? `-${r}` : ''})`, minHeight: 'var(--ds-space-48)', padding: '0 var(--ds-space-16)', border: 'var(--ds-border-width) solid var(--ds-border-strong)' }}>radius{r ? `-${r}` : ''}</span>)}
      </div>
      <div className="ds-row ds-gap-top">
        {[1, 2, 3].map((n) => <span key={n} className="ds-section" style={{ boxShadow: `var(--ds-shadow-${n})`, padding: 'var(--ds-space-16) var(--ds-space-24)' }}>shadow-{n}</span>)}
      </div>
      <p className="ds-help ds-gap-top">Motion: --ds-dur-fast 120ms · --ds-dur 200ms · --ds-dur-slow 320ms, one easing (--ds-ease), transform and opacity only, off for reduced motion. Layers: base 1 · raised 2 · sticky 20 · dropdown 40 · overlay 60 · modal 70 · toast 80. Breakpoints: 1440 · 1280 · 1024 · 768 · 480 · 360. Controls: 36px, 44px on touch; never under 24px.</p>
    </Section>
  </>;
}

function ShellSpecimens() {
  const [org, setOrg] = React.useState(COMPANIES[1]);
  const [staffOrg, setStaffOrg] = React.useState(COMPANIES[0]);
  return <>
    <Both stack label="Top bar, a client at 85%">{() => (
      <TopBar nav={DEFAULT_NAV('home', WIRE_HREFS)} end={<><SupportStatus until="21 Nov" href="#company" /><CreditMeter meter={{ used: 1700, total: 2000 }} /><CompanySwitcher current={org} companies={COMPANIES.slice(1, 4)} onSwitch={(id) => setOrg(COMPANIES.find((c) => c.id === id) || org)} /></>} />
    )}</Both>
    <Both stack label="Top bar, staff in Nmesis">{() => (
      <TopBar nav={DEFAULT_NAV('library', WIRE_HREFS)} end={<><CreditMeter meter={{ used: 1250000, total: 0, unlimited: true }} /><CompanySwitcher staff current={staffOrg} companies={COMPANIES} onSwitch={(id) => setStaffOrg(COMPANIES.find((c) => c.id === id) || staffOrg)} /></>} />
    )}</Both>
    <Both label="Credit meter states">{() => (
      <div className="ds-row">
        <CreditMeter meter={{ used: 0, total: 500 }} />
        <CreditMeter meter={{ used: 1700, total: 2000 }} />
        <CreditMeter meter={{ used: 2000, total: 2000 }} />
        <CreditMeter meter={{ used: 98765432, total: 100000000 }} />
        <SupportStatus until={null} />
        <SupportStatus until="21 Nov" />
      </div>
    )}</Both>
    <Both label="Banners">{() => <>
      <ViewingAs company={LONG_NAME} until="21 Nov" onLeave={() => {}} />
      <Banner kind="warn" icon={<Bell />}>85% of this month’s credits are used. <a className="ds-link" href="#usage">See Usage</a></Banner>
      <Banner kind="bad" icon={<Hourglass />}>Your subscription ended on 31 Oct. New work is paused; the library stays open until 30 Nov. Ask Nmesis to renew.</Banner>
    </>}</Both>
    <p className="ds-help">Phone navigation (shown here in place; on a phone it is fixed to the bottom):</p>
    <div data-theme="dark" className="ds-app" style={{ minHeight: 'auto' }}><div className="ds-gallery-phone-nav"><PhoneNav nav={DEFAULT_NAV('home', WIRE_HREFS)} /></div></div>
  </>;
}

function Wireframes() {
  const [theme, setTheme] = React.useState<'light' | 'dark'>('light');
  const frames = [{ w: 1440, h: 900, scale: 0.42 }, { w: 390, h: 844, scale: 0.6 }];
  return <>
    <div className="ds-row">
      <div className="ds-segmented" role="group" aria-label="Wireframe theme">
        <button type="button" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>Light</button>
        <button type="button" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>Dark</button>
      </div>
      <span className="ds-help">Each frame is the real page at that width. Open one to use it.</span>
    </div>
    {SCREENS.map((s) => (
      <div key={s} className="ds-stack">
        <div className="ds-row"><h3 className="ds-section-title">{SCREEN_TITLES[s]}</h3><Link className="ds-link" href={`/design-system/wireframes/${s}?theme=${theme}`}>Open full size</Link></div>
        <div className="ds-frames">
          {frames.map((f) => (
            <figure key={f.w} className="ds-frame">
              <div className="ds-frame-box" style={{ width: f.w * f.scale, height: f.h * f.scale }}>
                <iframe title={`${SCREEN_TITLES[s]} at ${f.w}px, ${theme}`} src={`/design-system/wireframes/${s}?theme=${theme}`} width={f.w} height={f.h} loading="lazy" style={{ transform: `scale(${f.scale})` }} />
              </div>
              <figcaption className="ds-help">{f.w} × {f.h}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    ))}
  </>;
}

function Forms() {
  const [name, setName] = React.useState('Launch campaign');
  const [car, setCar] = React.useState<string | null>(null);
  return <Both label="Form fields">{() => (
    <div className="ds-stack">
      <Field label="Folder name" required help="Everybody in the company sees it." count={{ value: name.length, max: 60 }}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Folder name" required error="A folder needs a name."><Input defaultValue="" /></Field>
      <Field label="Duration" help="Between 4 and 10 seconds."><AffixInput affix="seconds" defaultValue="6" inputMode="numeric" /></Field>
      <Field label="Car" help="Over eight choices, so it searches."><Combobox options={[...CARS, ...CARS.map((c) => `${c} long wheelbase`), LONG_NAME].map((c) => ({ value: c, label: c }))} value={car} onChange={setCar} placeholder="Search cars…" /></Field>
      <Field label="Size"><Select defaultValue="2k"><option value="1k">1K</option><option value="2k">2K</option><option value="4k">4K</option></Select></Field>
      <Field label="Scene" help="What is around the car."><Textarea rows={3} placeholder="Coast road at dusk" /></Field>
      <Field label="Disabled"><Input disabled defaultValue="Viewers cannot edit" /></Field>
    </div>
  )}</Both>;
}

function Controls() {
  const [on, setOn] = React.useState(true);
  const [v, setV] = React.useState(6);
  return <Both label="Choices">{(t) => (
    <div className="ds-stack">
      <Checkbox label="Keep the car’s colour" defaultChecked />
      <Checkbox label="Some of the folder is selected" indeterminate help="Indeterminate: part of a group is ticked." />
      <Checkbox label="Disabled" disabled />
      <RadioGroup legend="Orientation">
        <Radio name={`orientation-${t}`} label="Landscape" defaultChecked />
        <Radio name={`orientation-${t}`} label="Portrait" />
      </RadioGroup>
      <Switch label="Allow Nmesis support access" checked={on} onChange={(e) => setOn(e.target.checked)} />
      <Field label="Length"><Slider value={v} min={4} max={10} onValueChange={setV} format={(x) => `${x} s`} /></Field>
    </div>
  )}</Both>;
}

function Buttons() {
  return <Both label="Buttons">{() => <>
    <div className="ds-row">
      <Button kind="primary" icon={<Sparkles aria-hidden="true" />}>Generate <span className="ds-btn-meta">· 4 credits</span></Button>
      <Button>Secondary</Button>
      <Button kind="quiet">Quiet</Button>
      <Button kind="danger">Delete forever</Button>
      <Button kind="danger-quiet" icon={<Trash2 aria-hidden="true" />}>Move to trash</Button>
    </div>
    <div className="ds-row">
      <Button kind="primary" busy>Saving</Button>
      <Button busy>Loading</Button>
      <Button disabled>Disabled</Button>
      <Button size="sm" icon={<Save aria-hidden="true" />}>Small</Button>
      <IconButton label="Settings"><Settings aria-hidden="true" /></IconButton>
      <IconButton label="Copy" kind="secondary" size="sm"><Copy aria-hidden="true" /></IconButton>
    </div>
  </>}</Both>;
}

function Destructive() {
  const ask = useConfirm();
  const toast = useToast();
  const [said, setSaid] = React.useState('');
  return <Both label="Destructive actions">{() => (
    <div className="ds-stack">
      <p className="ds-help">1 · Reversible: do it, then Undo.</p>
      <div className="ds-row"><Button icon={<Archive aria-hidden="true" />} onClick={() => toast.undo('“Demo SUV · Desert dusk” moved to the trash. It stays there for 30 days.', () => toast.toast({ message: 'Restored to Launch campaign.', kind: 'ok' }))}>Move a visual to the trash</Button></div>
      <p className="ds-help">2 · Permanent: ask, name it, verb on the button, Cancel focused, Enter does not confirm.</p>
      <div className="ds-row"><Button kind="danger-quiet" icon={<Trash2 aria-hidden="true" />} onClick={async () => setSaid((await ask({ title: 'Delete this visual forever?', body: <p><strong>Demo SUV · Desert dusk</strong> is deleted from the trash now, for everybody in Demo Company. This cannot be undone.</p>, verb: 'Delete forever', danger: true })) ? 'Deleted.' : 'Kept.')}>Empty one from the trash</Button></div>
      <p className="ds-help">3 · Takes everything with it: type the name.</p>
      <div className="ds-row"><Button kind="danger-quiet" icon={<Trash2 aria-hidden="true" />} onClick={async () => setSaid((await ask({ title: 'Delete the folder and everything in it?', body: <><p>The folder <strong>Launch campaign</strong>, its sub-folder and <strong>48 items</strong> are deleted forever, for everybody in Demo Company.</p><p>Items in other folders are not touched. This cannot be undone.</p></>, verb: 'Delete the folder and 48 items', danger: true, typeToConfirm: 'Launch campaign' })) ? 'Deleted.' : 'Kept.')}>Delete a folder forever</Button></div>
      {said && <p className="ds-help" role="status">Answer: {said}</p>}
    </div>
  )}</Both>;
}

function Toasts() {
  const toast = useToast();
  return <div className="ds-row">
    <Button onClick={() => toast.toast({ message: 'The folder was renamed.' })}>Plain toast</Button>
    <Button onClick={() => toast.undo('3 items moved to Showroom screens.', () => toast.toast({ message: 'Moved back.', kind: 'ok' }))}>Toast with Undo</Button>
    <Button onClick={() => toast.toast({ message: 'The download could not start. Try again.', kind: 'bad', action: { label: 'Try again', run: () => {} } })}>Failure toast</Button>
  </div>;
}

function Jobs() {
  return <Both label="Job cards">{() => (
    <div className="ds-grid">
      {JOBS.map((j) => <JobCard key={j.title} job={j} onCancel={() => {}} onRetry={() => {}} onOpen={() => {}} />)}
    </div>
  )}</Both>;
}

function Media() {
  const items = React.useMemo(() => library(6), []);
  const [chosen, setChosen] = React.useState<Set<string>>(new Set(['v2']));
  return <Both label="Media tiles">{() => <>
    <MediaGrid label="Sample library" selecting={chosen.size > 0}>
      {items.map((m) => <MediaTile key={m.id} item={m} selected={chosen.has(m.id)} onSelect={(on) => setChosen((s) => { const n = new Set(s); if (on) n.add(m.id); else n.delete(m.id); return n; })} onOpen={() => {}} onMove={() => {}} onDelete={() => {}} onDownload={() => {}} />)}
      <div role="listitem"><Loading label="Loading more visuals"><SkeletonTile /></Loading></div>
    </MediaGrid>
    <BulkBar count={chosen.size} onClear={() => setChosen(new Set())}>
      <Button size="sm" icon={<FolderInput aria-hidden="true" />}>Move to…</Button>
      <Button size="sm" icon={<Download aria-hidden="true" />}>Download</Button>
      <Button size="sm" icon={<Trash2 aria-hidden="true" />}>Move to trash</Button>
    </BulkBar>
  </>}</Both>;
}

function ViewerSpecimen() {
  const items = React.useMemo(() => library(5), []);
  const [at, setAt] = React.useState<number | null>(null);
  return <>
    <div className="ds-row"><Button onClick={() => setAt(0)}>Open the viewer</Button><span className="ds-help">← → move, Escape closes, focus returns here.</span></div>
    <Viewer items={items} index={at} onIndex={setAt} onClose={() => setAt(null)} onDownload={() => {}} onVariation={() => {}} onMove={() => {}} onDelete={() => {}} />
  </>;
}

function States() {
  return <Both label="States">{() => <>
    <State kind="empty" title="No visuals yet" actions={<Button kind="primary" icon={<Plus aria-hidden="true" />}>Make your first visual</Button>}>Everything your company makes appears here.</State>
    <State kind="no-results" title="Nothing matches these filters" actions={<Button>Clear filters</Button>}>Tool: Film · Car: Demo Pickup · Last 7 days</State>
    <State kind="error" title="The library could not be loaded" actions={<Button icon={<RefreshCw aria-hidden="true" />}>Try again</Button>}>The server did not answer in 10 seconds. Nothing was changed.</State>
  </>}</Both>;
}

function UpsellSpecimen() {
  return <Both label="Upsell and badges">{() => <>
    <div className="ds-row"><Upsell plan="Growth" onAsk={() => {}} /><Upsell plan="Enterprise" href="#ask" /></div>
    <div className="ds-row">
      <Badge kind="ok">Done</Badge><Badge kind="info">In progress</Badge><Badge kind="warn">85% used</Badge><Badge kind="bad">Failed</Badge><Badge kind="accent">New</Badge><Badge>0 credits · own key</Badge><Badge>1,250,000 credits</Badge>
    </div>
  </>}</Both>;
}

function Skeletons() {
  return <Both label="Skeletons">{() => (
    <Loading label="Loading" className="ds-stack">
      <div className="ds-grid"><SkeletonTile /><SkeletonTile /><SkeletonTile /></div>
      <div className="ds-list"><SkeletonRow /><SkeletonRow /></div>
      <SkeletonPanel />
    </Loading>
  )}</Both>;
}

function Panels() {
  const [modal, setModal] = React.useState(false);
  const [drawer, setDrawer] = React.useState(false);
  const [sheet, setSheet] = React.useState(false);
  return <>
    <div className="ds-row">
      <Button onClick={() => setModal(true)} icon={<Pencil aria-hidden="true" />}>Rename (modal)</Button>
      <Button onClick={() => setDrawer(true)}>Details (drawer)</Button>
      <Button onClick={() => setSheet(true)}>Settings (bottom sheet)</Button>
    </div>
    <Dialog open={modal} onClose={() => setModal(false)} title="Rename the folder" footer={<><Button onClick={() => setModal(false)}>Cancel</Button><Button kind="primary" onClick={() => setModal(false)}>Rename</Button></>}>
      <Field label="Name" required><Input defaultValue="Launch campaign" /></Field>
    </Dialog>
    <Dialog open={drawer} onClose={() => setDrawer(false)} variant="drawer" title="Demo SUV · Desert dusk">
      <p>Made by Alex Example on 12 Nov with Key visual. Used 4 credits.</p>
      <Fold name="gallery-drawer-prompt" title="Prompt" summary="Coast road at dusk, low sun…"><p>Coast road at dusk, low sun, wet tarmac.</p></Fold>
    </Dialog>
    <Dialog open={sheet} onClose={() => setSheet(false)} variant="sheet" title="Settings" footer={<Button kind="primary" onClick={() => setSheet(false)}>Done</Button>}>
      <Field label="Size"><Select defaultValue="2k"><option>1K</option><option value="2k">2K</option></Select></Field>
    </Dialog>
  </>;
}

function MenuSpecimen() {
  return <Both label="Menu">{() => (
    <div className="ds-row">
      <Menu label="More for Launch campaign" trigger={<MoreHorizontal aria-hidden="true" />}>
        <MenuItem icon={<Pencil />} onSelect={() => {}}>Rename</MenuItem>
        <MenuItem icon={<FolderInput />} onSelect={() => {}}>Move to…</MenuItem>
        <MenuItem icon={<Download />} onSelect={() => {}}>Download all</MenuItem>
        <MenuSeparator />
        <MenuItem icon={<Trash2 />} danger onSelect={() => {}}>Move to trash</MenuItem>
      </Menu>
      <span className="ds-help">Delete is always last, below a line.</span>
    </div>
  )}</Both>;
}

export function Gallery() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="ds-gallery">
          <nav className="ds-gallery-toc" aria-label="Gallery sections">
            {SECTIONS.map(([id, t]) => <a key={id} href={`#${id}`}>{t}</a>)}
          </nav>
          <div className="ds-blocks">
            <PageHeader eyebrow="Staff only" title="Design system" lede="Every token and component of the Studio, light and dark. docs/design-system.md says when to use each." actions={<Link className="ds-btn" href="/design-system/wireframes/home"><Search aria-hidden="true" />Wireframes</Link>} />
            <Block id="tokens" title="Tokens" lede="app/tokens.css. Shared with the admin: the same palette names and the same steps."><Tokens /></Block>
            <Block id="shell" title="App shell" lede="Top bar with the credit meter, support-access status and company switcher; “Viewing as”; banners; phone navigation."><ShellSpecimens /></Block>
            <Block id="wireframes" title="Wireframes" lede="Home, projects and folders, library and editor at 1440 and 390, for approval before Phase 3."><Wireframes /></Block>
            <Block id="page" title="Page header, section, collapsible section"><Both>{() => <>
              <PageHeader title="Library" lede="Everything your company has made, in one place." actions={<Button kind="primary" icon={<Plus aria-hidden="true" />}>Create</Button>} />
              <Section title="Recent work" count="6 of 300"><p>Section body.</p></Section>
              <Fold name="gallery-fold-a" title="Advanced" summary="2K · Landscape · keep colour on"><p>Closed, it still says what is inside.</p></Fold>
              <Fold name="gallery-fold-b" title={LONG_NAME} summary="3 settings changed" defaultOpen><p>Open by default; the choice is remembered.</p></Fold>
            </>}</Both></Block>
            <Block id="forms" title="Form fields" lede="Label, then help OR error, required in words, units in an affix, a count on the right."><Forms /></Block>
            <Block id="controls" title="Choices and sliders"><Controls /></Block>
            <Block id="buttons" title="Buttons" lede="One primary per screen. Busy keeps the words."><Buttons /></Block>
            <Block id="destructive" title="Destructive actions" lede="The ladder: Undo for what can be had back, a dialog for what cannot, type-to-confirm only for the largest."><Destructive /></Block>
            <Block id="toasts" title="Toasts" lede="One stack, polite, six seconds, held while pointed at or focused."><Toasts /></Block>
            <Block id="jobs" title="Job card" lede="Queued, running with stage and progress, done, failed, cancelled; estimate and credits."><Jobs /></Block>
            <Block id="media" title="Media tiles and grid" lede="Hover actions also on focus and touch; selection by tick box; Move to… as the alternative to dragging."><Media /></Block>
            <Block id="viewer" title="Viewer"><ViewerSpecimen /></Block>
            <Block id="states" title="Empty, no results, error"><States /></Block>
            <Block id="upsell" title="Upsell and badges"><UpsellSpecimen /></Block>
            <Block id="skeletons" title="Skeletons"><Skeletons /></Block>
            <Block id="tabs" title="Tabs" lede="The open tab is in the address."><Tabs label="Usage" tabs={[{ id: 'people', label: 'By person', panel: <p>By person.</p> }, { id: 'tools', label: 'By tool', panel: <p>By tool.</p> }, { id: 'packs', label: 'Packs', panel: <p>Packs.</p> }]} /></Block>
            <Block id="panels" title="Drawer and modal" lede="Full screen under 480px; the page behind does not scroll."><Panels /></Block>
            <Block id="menu" title="Menu"><MenuSpecimen /></Block>
          </div>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
