'use client';
import * as React from 'react';
import { PanelRightClose, PanelRightOpen, SlidersHorizontal, Sparkles } from 'lucide-react';
import { Button, IconButton } from './button';
import { Dialog } from './dialog';
import { useRememberedOpen } from './layout';
import { credits } from '@/lib/ds/words';

// The editor layout, the same for every tool: tools rail on the left, the
// canvas in the centre, settings on the right (collapsible, remembered), one
// primary Generate in the same place with its credit cost on it before it is
// pressed, and the job card over the canvas while it runs. On a phone the
// rail becomes a strip, the settings a bottom sheet, and Generate a sticky bar.

export type RailTool = { id: string; label: string; icon: React.ReactNode };

export function GenerateButton({ cost, busy, disabled, onGenerate, note, verb = 'Generate' }: { cost: number | null; busy?: boolean; disabled?: boolean; onGenerate: () => void; note?: React.ReactNode; verb?: string }) {
  return (
    <>
      <Button kind="primary" busy={busy} disabled={disabled} onClick={onGenerate} icon={<Sparkles aria-hidden="true" />}>
        {verb}
        {cost !== null && <span className="ds-btn-meta">· {credits(cost)}</span>}
      </Button>
      {note && <p className="ds-generate-note">{note}</p>}
    </>
  );
}

export function EditorLayout({ name, tools, tool, onTool, canvasBar, canvas, jobs, settingsTitle = 'Settings', settings, generate }: {
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
  generate: React.ReactNode;
}) {
  const [open, setOpen] = useRememberedOpen(`editor-settings:${name}`, true);
  const [sheet, setSheet] = React.useState(false);
  const toggle = () => setOpen(!open);
  const hidden = (node: React.ReactNode) => (React.isValidElement(node) ? React.cloneElement(node as React.ReactElement<{ 'aria-hidden'?: boolean }>, { 'aria-hidden': true }) : node);
  return (
    <div className="ds-editor" data-settings={open ? 'open' : 'closed'}>
      <nav className="ds-editor-rail" aria-label="Tools">
        {tools.map((t) => (
          <button key={t.id} type="button" className="ds-rail-tool" aria-pressed={t.id === tool} onClick={() => onTool(t.id)}>
            {hidden(t.icon)}<span>{t.label}</span>
          </button>
        ))}
      </nav>
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
        <div className="ds-settings-body">{settings}</div>
        <div className="ds-generate">{generate}</div>
      </aside>
      <div className="ds-phone-generate">
        <Button icon={<SlidersHorizontal aria-hidden="true" />} onClick={() => setSheet(true)}>{settingsTitle}</Button>
        {generate}
      </div>
      <Dialog open={sheet} onClose={() => setSheet(false)} title={settingsTitle} variant="sheet" footer={<Button kind="primary" onClick={() => setSheet(false)}>Done</Button>}>
        {settings}
      </Dialog>
    </div>
  );
}
