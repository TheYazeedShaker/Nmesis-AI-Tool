'use client';
import * as React from 'react';
import {
  ArrowDownUp, Brush, Car, Clapperboard, Download, Film, Folder, FolderInput, FolderPlus, Grid2x2, Image as ImageIcon,
  LayoutList, Layers, Plus, Repeat, Search, Shapes, Sparkles, Square, Trash2, Wand2, ZoomIn,
} from 'lucide-react';
import { AppShell, Banner, CompanySwitcher, CreditMeter, DEFAULT_NAV, SupportStatus } from '@/components/ds/shell';
import { Button } from '@/components/ds/button';
import { Badge, Upsell } from '@/components/ds/feedback';
import { PageHeader } from '@/components/ds/layout';
import { Field, Select, Slider, Textarea } from '@/components/ds/field';
import { Combobox } from '@/components/ds/combobox';
import { BulkBar, MediaGrid, MediaTile, Viewer, type MediaItem } from '@/components/ds/media';
import { JobCard } from '@/components/ds/job-card';
import { EditorLayout, GenerateButton } from '@/components/ds/editor';
import { ConfirmProvider } from '@/components/ds/dialog';
import { ToastProvider, useToast } from '@/components/ds/toast';
import { credits } from '@/lib/ds/words';
import { CARS, COMPANIES, FOLDERS, JOBS, PEOPLE, TOOLS, library } from './sample';
import type { Screen } from './screens';

// Low-fidelity wireframes of the target experience, built from the real
// components with synthetic data, for the owner's approval before Phase 3.
// Each one is a route (/design-system/wireframes/<screen>) so the gallery can
// show it in a frame at 1440 and 390, where the real breakpoints apply.


const TOOL_ICONS: Record<string, React.ReactNode> = {
  kv: <ImageIcon />, lineup: <Layers />, area: <Brush />, film: <Film />, swap: <Repeat />, story: <Clapperboard />, upscale: <ZoomIn />, smart: <Wand2 />,
};
// The wireframes link to each other, so the navigation can be tried.
export const WIRE_HREFS = { home: '/design-system/wireframes/home', library: '/design-system/wireframes/library', projects: '/design-system/wireframes/folders', tools: '/design-system/wireframes/editor' };
const PLAN_RANK = { Starter: 0, Growth: 1, Enterprise: 2 } as const;

function Shell({ current, children, theme, bleed }: { current: string; children: React.ReactNode; theme?: 'light' | 'dark'; bleed?: boolean }) {
  const [org, setOrg] = React.useState(COMPANIES[1]);
  return (
    <AppShell
      theme={theme}
      bleed={bleed}
      nav={DEFAULT_NAV(current, WIRE_HREFS)}
      topEnd={<>
        <SupportStatus until={null} href="#company" />
        <CreditMeter meter={{ used: 1700, total: 2000 }} />
        <CompanySwitcher current={org} companies={COMPANIES.slice(1, 4)} onSwitch={(id) => setOrg(COMPANIES.find((c) => c.id === id) || org)} />
      </>}
      banners={<Banner kind="warn" icon={<Sparkles />}>85% of this month’s credits are used. <a className="ds-link" href="#usage">See Usage</a></Banner>}
    >
      {children}
    </AppShell>
  );
}

function Home() {
  const plan: keyof typeof PLAN_RANK = 'Growth';
  const recent = library(8);
  return (
    <div className="ds-blocks">
      <div className="ds-hero">
        <h1 className="ds-hero-title">What do you want to make?</h1>
        <label className="ds-ask">
          <Search aria-hidden="true" />
          <span className="ds-sr-only">Describe what you want to make</span>
          <input placeholder="A key visual of the Demo SUV on a coast road at dusk…" />
          <Button kind="primary" icon={<Sparkles aria-hidden="true" />}>Start</Button>
        </label>
      </div>
      <section aria-labelledby="h-tools">
        <div className="ds-block-head"><h2 className="ds-block-title" id="h-tools">Tools</h2><a className="ds-link" href="#tools">All tools</a></div>
        <div className="ds-tools">
          {TOOLS.map((t) => {
            const locked = PLAN_RANK[t.plan] > PLAN_RANK[plan];
            return (
              <a key={t.id} className="ds-tool" href={locked ? `#ask-${t.id}` : `#${t.id}`} data-locked={locked || undefined} aria-label={locked ? `${t.name}: ${t.line} Available on ${t.plan}. Ask Nmesis.` : `${t.name}: ${t.line} ${credits(t.credits)}.`}>
                <span className="ds-tool-art" aria-hidden="true">{TOOL_ICONS[t.id]}</span>
                <span className="ds-tool-name">{t.name}</span>
                <span className="ds-tool-line">{t.line}</span>
                <span className="ds-tool-foot">{locked ? <Upsell plan={t.plan} /> : <Badge>{credits(t.credits)}</Badge>}</span>
              </a>
            );
          })}
        </div>
      </section>
      <section aria-labelledby="h-recent">
        <div className="ds-block-head"><h2 className="ds-block-title" id="h-recent">Recent work</h2><a className="ds-link" href="#library">Library</a></div>
        <div className="ds-scroller" role="list" aria-label="Recent work">
          {recent.map((m) => <MediaTile key={m.id} item={m} onOpen={() => {}} />)}
        </div>
      </section>
      <section aria-labelledby="h-cars">
        <div className="ds-block-head"><h2 className="ds-block-title" id="h-cars">Start from your cars</h2></div>
        <div className="ds-scroller" role="list" aria-label="Your company’s cars">
          {CARS.map((c) => (
            <div key={c} role="listitem">
              <a className="ds-car" href={`#car-${c}`}>
                <span className="ds-car-art" aria-hidden="true"><Car /></span>
                <span className="ds-tile-name ds-truncate">{c}</span>
              </a>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Folders() {
  const toast = useToast();
  return (
    <>
      <PageHeader title="Projects" lede="Folders shared with everybody in Demo Company. Owners and creators can change them; viewers look." actions={<>
        <Button icon={<Trash2 aria-hidden="true" />}>Trash · 6</Button>
        <Button kind="primary" icon={<FolderPlus aria-hidden="true" />}>New folder</Button>
      </>} />
      <div className="ds-folder-cards" role="list" aria-label="Folders">
        {FOLDERS.map((f) => (
          <div key={f.id} role="listitem">
            <a className="ds-folder-card" href={`#${f.id}`}>
              <Folder aria-hidden="true" />
              <div><span className="ds-tile-name ds-truncate" title={f.name}>{f.name}</span><span className="ds-tile-sub">{f.count.toLocaleString('en-US')} items{f.sub.length ? ` · ${f.sub.length} sub-folder` : ''}</span></div>
            </a>
          </div>
        ))}
      </div>
      <div className="ds-block-head ds-gap-top">
        <h2 className="ds-block-title">Launch campaign</h2>
        <span className="ds-muted">48 items · drag onto a folder, or use Move to…</span>
      </div>
      <MediaGrid label="Launch campaign" selecting>
        {library(8).map((m, i) => (
          <MediaTile key={m.id} item={m} selected={i < 2} onSelect={() => {}} onOpen={() => {}} onMove={() => {}} onDownload={() => {}}
            onDelete={() => toast.undo(`“${m.name}” moved to the trash. It stays there for 30 days.`, () => toast.toast({ message: 'Restored.', kind: 'ok' }))} />
        ))}
      </MediaGrid>
      <BulkBar count={2} onClear={() => {}}>
        <Button size="sm" icon={<FolderInput aria-hidden="true" />}>Move to…</Button>
        <Button size="sm" icon={<Download aria-hidden="true" />}>Download</Button>
        <Button size="sm" icon={<Trash2 aria-hidden="true" />} onClick={() => toast.undo('2 items moved to the trash.', () => {})}>Move to trash</Button>
      </BulkBar>
    </>
  );
}

function Library() {
  const items = React.useMemo(() => library(24), []);
  const [view, setView] = React.useState<'grid' | 'list'>('grid');
  const [chosen, setChosen] = React.useState<Set<string>>(new Set());
  const [open, setOpen] = React.useState<number | null>(null);
  const toggle = (id: string, on: boolean) => setChosen((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  return (
    <div className="ds-library">
      <nav className="ds-folders" aria-label="Folders">
        <a className="ds-folder" href="#all" aria-current="page"><Grid2x2 aria-hidden="true" />Everything<span className="ds-folder-count">300</span></a>
        {FOLDERS.map((f) => (
          <React.Fragment key={f.id}>
            <a className="ds-folder" href={`#${f.id}`} data-drop={f.id === 'f2' || undefined}><Folder aria-hidden="true" /><span className="ds-truncate" title={f.name}>{f.name}</span><span className="ds-folder-count">{f.count.toLocaleString('en-US')}</span></a>
            {f.sub.map((s) => <a key={s.id} className="ds-folder sub" href={`#${s.id}`}><Folder aria-hidden="true" /><span className="ds-truncate">{s.name}</span><span className="ds-folder-count">{s.count}</span></a>)}
          </React.Fragment>
        ))}
        <a className="ds-folder" href="#trash"><Trash2 aria-hidden="true" />Trash<span className="ds-folder-count">6</span></a>
      </nav>
      <div>
        <PageHeader title="Library" lede="Everything your company has made, in one place." actions={<Button kind="primary" icon={<Plus aria-hidden="true" />}>Create</Button>} />
        <div className="ds-toolbar">
          <label className="ds-search"><Search aria-hidden="true" /><span className="ds-sr-only">Search the library</span><input className="ds-input" type="search" placeholder="Search by name, car or person" /></label>
          <Select aria-label="Sort" defaultValue="new"><option value="new">Newest first</option><option value="old">Oldest first</option><option value="name">Name A–Z</option></Select>
          <div className="ds-segmented" role="group" aria-label="View">
            <button type="button" aria-pressed={view === 'grid'} aria-label="Grid" onClick={() => setView('grid')}><Grid2x2 aria-hidden="true" /></button>
            <button type="button" aria-pressed={view === 'list'} aria-label="List" onClick={() => setView('list')}><LayoutList aria-hidden="true" /></button>
          </div>
        </div>
        <div className="ds-filters" role="group" aria-label="Filters">
          <button type="button" className="ds-chip" aria-pressed="true"><Shapes aria-hidden="true" />Tool: Key visual</button>
          <button type="button" className="ds-chip" aria-pressed="false"><Car aria-hidden="true" />Car</button>
          <button type="button" className="ds-chip" aria-pressed="false">Person</button>
          <button type="button" className="ds-chip" aria-pressed="false">Date</button>
          <button type="button" className="ds-chip" aria-pressed="false">Status</button>
          <button type="button" className="ds-link">Clear filters</button>
        </div>
        {view === 'grid' ? (
          <MediaGrid label="Library" selecting={chosen.size > 0}>
            {items.map((m, i) => <MediaTile key={m.id} item={m} selected={chosen.has(m.id)} onSelect={(on) => toggle(m.id, on)} onOpen={() => setOpen(i)} onMove={() => {}} onDelete={() => {}} onDownload={() => {}} />)}
          </MediaGrid>
        ) : (
          <div className="ds-list" role="list" aria-label="Library">
            {items.map((m: MediaItem, i) => (
              <div key={m.id} className="ds-list-row" role="listitem" data-selected={chosen.has(m.id) || undefined}>
                <label className="ds-check"><input type="checkbox" checked={chosen.has(m.id)} onChange={(e) => toggle(m.id, e.target.checked)} aria-label={`Select ${m.name}`} /></label>
                <span className="ds-list-thumb" aria-hidden="true" />
                <button type="button" className="ds-link ds-truncate" title={m.name} onClick={() => setOpen(i)}>{m.name}</button>
                <span className="ds-tile-sub ds-list-hide-phone">{PEOPLE[i % PEOPLE.length]}</span>
                <span className="ds-tile-sub">{m.sub}</span>
              </div>
            ))}
          </div>
        )}
        <p className="ds-muted ds-gap-top">Showing 24 of 300 · <button type="button" className="ds-link">Load more</button></p>
        <BulkBar count={chosen.size} onClear={() => setChosen(new Set())}>
          <Button size="sm" icon={<FolderInput aria-hidden="true" />}>Move to…</Button>
          <Button size="sm" icon={<Trash2 aria-hidden="true" />}>Move to trash</Button>
        </BulkBar>
        <Viewer items={items} index={open} onIndex={setOpen} onClose={() => setOpen(null)} onDownload={() => {}} onVariation={() => {}} onMove={() => {}} onDelete={() => {}} />
      </div>
    </div>
  );
}

function Editor() {
  const [tool, setTool] = React.useState('scene');
  const [car, setCar] = React.useState<string | null>('Demo SUV');
  const [strength, setStrength] = React.useState(60);
  const settings = <>
    <Field label="Car" help="From your company’s configurators."><Combobox options={CARS.map((c) => ({ value: c, label: c }))} value={car} onChange={setCar} /></Field>
    <Field label="Scene" count={{ value: 46, max: 600 }}><Textarea defaultValue="Coast road at dusk, low sun, wet tarmac" rows={3} /></Field>
    <Field label="Size"><Select defaultValue="2k"><option value="1k">1K · fastest</option><option value="2k">2K</option><option value="4k">4K</option></Select></Field>
    <Field label="Keep the original look"><Slider value={strength} onValueChange={setStrength} format={(v) => `${v}%`} /></Field>
  </>;
  return (
    <EditorLayout
      name="key-visual"
      tools={[{ id: 'scene', label: 'Scene', icon: <ImageIcon /> }, { id: 'area', label: 'Area', icon: <Brush /> }, { id: 'select', label: 'Select', icon: <Square /> }, { id: 'refs', label: 'Refs', icon: <Wand2 /> }, { id: 'sort', label: 'Order', icon: <ArrowDownUp /> }]}
      tool={tool}
      onTool={setTool}
      canvasBar={<><span className="ds-tile-name">Untitled key visual</span><Badge>Unsorted</Badge></>}
      canvas={<div className="ds-canvas-art" role="img" aria-label="Canvas: Demo SUV, coast road"><Car aria-hidden="true" /></div>}
      jobs={<JobCard job={JOBS[1]} onCancel={() => {}} />}
      settings={settings}
      generate={<GenerateButton cost={4} onGenerate={() => {}} note="1,700 of 2,000 credits used this month" />}
    />
  );
}

export function Wireframe({ screen, theme }: { screen: Screen; theme?: 'light' | 'dark' }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Shell current={screen === 'folders' ? 'projects' : screen === 'editor' ? 'tools' : screen} theme={theme} bleed={screen === 'editor'}>
          {screen === 'home' ? <Home /> : screen === 'folders' ? <Folders /> : screen === 'library' ? <Library /> : <Editor />}
        </Shell>
      </ConfirmProvider>
    </ToastProvider>
  );
}
