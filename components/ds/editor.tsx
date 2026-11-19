'use client';
import * as React from 'react';
import { Info, PanelRightClose, PanelRightOpen, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Button, IconButton } from './button';
import { Dialog } from './dialog';
import { useRememberedOpen } from './layout';
import { costTag, type Cost } from '@/lib/ds/words';

// The editor layout, the same for every tool: tools rail on the left, the
// canvas in the centre, settings on the right (collapsible, remembered), one
// primary Generate in the same place with its credit cost on it before it is
// pressed, and the job card over the canvas while it runs. On a phone the
// rail becomes a strip, the settings a bottom sheet, and Generate a sticky bar.

export type RailTool = { id: string; label: string; icon: React.ReactNode };

/** Why Generate cannot run (no AI set up, the plan ended, no credits): one
 *  notice at the top of the settings, and the disabled button's description. */
export type GenerateBlocker = { title: string; body: string; action?: React.ReactNode };

export function GenerateButton({ cost, busy, disabled, onGenerate, note, verb = 'Generate', blocked }: { cost: Cost; busy?: boolean; disabled?: boolean; onGenerate: () => void; note?: React.ReactNode; verb?: string; blocked?: GenerateBlocker | null }) {
  const reason = React.useId();
  return (
    <>
      <Button kind="primary" busy={busy} disabled={disabled || !!blocked} onClick={onGenerate} icon={<Sparkles aria-hidden="true" />} aria-describedby={blocked ? reason : undefined}>
        {verb}
        {cost !== null && <span className="ds-btn-meta">· {costTag(cost)}</span>}
      </Button>
      {/* While Generate cannot run, its reason is its description (the notice over the settings shows it); never a grey line under an active-looking button. */}
      {blocked ? <span id={reason} className="ds-sr-only">{blocked.title}. {blocked.body}</span> : note && <p className="ds-generate-note">{note}</p>}
    </>
  );
}

/** The one notice over the settings when Generate cannot run: why, and what to do. */
export function GenerateNotice({ blocked }: { blocked: GenerateBlocker }) {
  return (
    <div className="ds-banner warn ds-generate-blocked" role="status">
      <Info aria-hidden="true" />
      <span className="ds-stack"><b>{blocked.title}</b><span>{blocked.body}</span>{blocked.action && <span>{blocked.action}</span>}</span>
    </div>
  );
}

export function EditorLayout({ name, tools, tool, onTool, canvasBar, canvas, jobs, settingsTitle = 'Settings', settings, notice, generate, loading }: {
  /** Remembers whether settings were closed, per tool. */
  name: string;
  tools: RailTool[];
  tool: string;
  onTool: (id: string) => void;
  canvasBar?: React.ReactNode;
  canvas: React.ReactNode;
  jobs?: React.ReactNode;
  settingsTitle?: string;
  settings: React.ReactNode;
  /** First in the settings (and the phone sheet): why Generate cannot run. */
  notice?: React.ReactNode;
  generate: React.ReactNode;
  /** The tool's first data is still loading: the frame shows, its content waits (no layout shift when it arrives). */
  loading?: boolean;
}) {
  const [open, setOpen] = useRememberedOpen(`editor-settings:${name}`, true);
  const [sheet, setSheet] = React.useState(false);
  const toggle = () => setOpen(!open);
  const hidden = (node: React.ReactNode) => (React.isValidElement(node) ? React.cloneElement(node as React.ReactElement<{ 'aria-hidden'?: boolean }>, { 'aria-hidden': true }) : node);
  return (
    <div className="ds-editor" data-settings={open ? 'open' : 'closed'} data-rail={tools.length ? undefined : 'none'} data-loading={loading || undefined} aria-busy={loading || undefined}>
      {tools.length > 0 && <nav className="ds-editor-rail" aria-label="Tools">
        {tools.map((t) => (
          <button key={t.id} type="button" className="ds-rail-tool" aria-pressed={t.id === tool} onClick={() => onTool(t.id)}>
            {hidden(t.icon)}<span>{t.label}</span>
          </button>
        ))}
      </nav>}
      <section className="ds-editor-canvas" aria-label="Canvas">
        <div className="ds-canvas-bar">
          {canvasBar}
          <span className="ds-spacer" />
          <IconButton label={open ? 'Hide settings' : 'Show settings'} aria-expanded={open} onClick={toggle} className="ds-hide-phone">
            {open ? <PanelRightClose aria-hidden="true" /> : <PanelRightOpen aria-hidden="true" />}
          </IconButton>
        </div>
        <div className="ds-canvas-stage">{canvas}</div>
        {jobs && <div className="ds-canvas-jobs" aria-live="polite">{jobs}</div>}
      </section>
      <aside className="ds-editor-settings" aria-label={settingsTitle}>
        <div className="ds-settings-head"><h2 className="ds-section-title">{settingsTitle}</h2></div>
        {/* One copy of the settings at a time: while the phone sheet is open it holds them (duplicate radio groups and ids otherwise). */}
        <div className="ds-settings-body">{sheet ? null : <>{notice}{settings}</>}</div>
        <div className="ds-generate">{generate}</div>
      </aside>
      <div className="ds-phone-generate">
        <Button icon={<SlidersHorizontal aria-hidden="true" />} onClick={() => setSheet(true)}>{settingsTitle}</Button>
        {generate}
      </div>
      <Dialog open={sheet} onClose={() => setSheet(false)} title={settingsTitle} variant="sheet" footer={<Button kind="primary" onClick={() => setSheet(false)}>Done</Button>}>
        {notice}{settings}
      </Dialog>
    </div>
  );
}
