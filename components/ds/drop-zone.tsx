'use client';
import * as React from 'react';
import { AlertCircle, Film, ImagePlus, Type, Upload } from 'lucide-react';
import { Button, dsClass } from './button';
import { clipboardImage, validateClipboardImage } from '@/lib/clipboard-image';

// The one place a picture (or a video) is added: one bordered area with an
// icon and a sentence, one "Choose file" button, and the paste hint. A file can
// be dropped on it, pasted while it (or anything in it) has focus, or chosen.
// Once something is added the area shows a thumbnail with Replace and Remove.
// Problems are said under the area (role="alert"), never as a toast.
// Styles: app/inputs.css (.ds-drop-*).

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';
export const IMAGE_MAX_BYTES = 40_000_000;

export type DropZoneProps = {
  /** The sentence in the area: "Drop, paste or upload a picture of the car". */
  label: React.ReactNode;
  /** What is added, for the buttons' names ("Replace car picture"). */
  name: string;
  /** image (default): PNG/JPEG/WebP and paste; video and font: a file chosen or dropped (font: give `accept`). */
  kind?: 'image' | 'video' | 'font';
  accept?: string;
  maxBytes?: number;
  /** One file; may return a promise (the area is busy until it settles, and shows its error). */
  onFile?: (file: File) => unknown;
  /** Several files at once (with `multiple`). */
  onFiles?: (files: File[]) => unknown;
  multiple?: boolean;
  /** The added picture's address (a preview URL), or null when nothing is added yet. */
  value?: string | null;
  /** The added file's name, and a second line under it. */
  valueName?: React.ReactNode;
  valueMeta?: React.ReactNode;
  valueAlt?: string;
  onRemove?: () => void;
  /** A problem from the caller (upload failed …); shown under the area. */
  error?: React.ReactNode;
  /** true, or the words for what is happening ("Saving picture…"). */
  busy?: boolean | string;
  disabled?: boolean;
  /** A short line under the button: types and size, what it is for. */
  hint?: React.ReactNode;
  /** More under the thumbnail (a link to the original). */
  children?: React.ReactNode;
  id?: string;
  className?: string;
};

const mb = (bytes: number) => Math.round(bytes / 1_000_000);

function accepted(file: File, accept: string) {
  const name = file.name.toLowerCase(), type = file.type.toLowerCase();
  return accept.split(',').map((a) => a.trim().toLowerCase()).filter(Boolean).some((a) =>
    a.startsWith('.') ? name.endsWith(a) : a.endsWith('/*') ? type.startsWith(a.slice(0, -1)) : type === a);
}

export function DropZone({
  label, name, kind = 'image', accept, maxBytes = kind === 'video' ? 48_000_000 : IMAGE_MAX_BYTES,
  onFile, onFiles, multiple = false, value = null, valueName, valueMeta, valueAlt, onRemove,
  error, busy = false, disabled = false, hint, children, id, className,
}: DropZoneProps) {
  const auto = React.useId();
  const base = id || `drop${auto.replace(/[^a-zA-Z0-9]/g, '')}`;
  const labelId = `${base}-label`, hintId = `${base}-hint`, errorId = `${base}-error`;
  const types = accept || (kind === 'video' ? 'video/mp4,.mp4' : IMAGE_ACCEPT);
  const input = React.useRef<HTMLInputElement>(null);
  const lock = React.useRef(false);
  const [over, setOver] = React.useState(false);
  const [working, setWorking] = React.useState(false);
  const [problem, setProblem] = React.useState('');
  const isBusy = !!busy || working;
  const off = disabled || isBusy;
  const shown = error || problem;

  function check(file: File, pasted = false) {
    // A pasted picture keeps the clipboard's own words (lib/clipboard-image.ts).
    if (pasted) validateClipboardImage(file);
    if (!accepted(file, types)) throw new Error(kind === 'video' ? 'Choose an MP4 video.' : kind === 'font' ? 'Choose an OTF, TTF, WOFF or WOFF2 font file.' : 'Choose a PNG, JPEG or WebP picture.');
    if (!file.size || file.size > maxBytes) throw new Error(`Choose a file up to ${mb(maxBytes)} MB.`);
    return file;
  }

  async function take(files: File[], pasted = false) {
    if (off || lock.current || !files.length) return;
    setProblem('');
    let list: File[];
    try { list = (multiple ? files : files.slice(0, 1)).map((f) => check(f, pasted)); }
    catch (e) { setProblem((e as Error).message); return; }
    lock.current = true; setWorking(true);
    try {
      if (multiple && onFiles) await onFiles(list);
      else await onFile?.(list[0]);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setProblem((e as Error).message || 'This file could not be added.');
    } finally { lock.current = false; setWorking(false); }
  }

  const choose = () => { if (!off) input.current?.click(); };
  const isFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files');

  const status = typeof busy === 'string' && busy ? busy : isBusy ? (kind === 'video' ? 'Adding video…' : kind === 'font' ? 'Adding fonts…' : 'Adding picture…') : '';
  const Icon = kind === 'video' ? Film : kind === 'font' ? Type : ImagePlus;

  return (
    <div className={dsClass('ds-drop', className)}>
      <div
        className="ds-drop-zone"
        role="group"
        aria-labelledby={value ? undefined : labelId}
        aria-label={value ? `${name[0].toUpperCase()}${name.slice(1)} added` : undefined}
        aria-describedby={[hint && !value ? hintId : null, shown ? errorId : null].filter(Boolean).join(' ') || undefined}
        aria-busy={isBusy || undefined}
        tabIndex={disabled ? -1 : 0}
        data-drag={over || undefined}
        data-filled={value ? true : undefined}
        data-invalid={shown ? true : undefined}
        data-disabled={disabled || undefined}
        onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); choose(); } }}
        onPaste={(e) => {
          if (kind !== 'image') return;
          const file = clipboardImage(e.clipboardData);
          if (!file) return;
          // Handled here: the section around the zone must not add it twice.
          e.preventDefault(); e.stopPropagation();
          void take([file], true);
        }}
        onDragEnter={(e) => { if (!isFiles(e) || off) return; e.preventDefault(); setOver(true); }}
        onDragOver={(e) => { if (!isFiles(e) || off) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}
        onDrop={(e) => {
          if (!isFiles(e)) return;
          e.preventDefault(); e.stopPropagation(); setOver(false);
          void take(Array.from(e.dataTransfer.files || []));
        }}
      >
        {value ? (
          <>
            <span className="ds-drop-thumb">
              {kind === 'image'
                // eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs, or a local preview
                ? <img crossOrigin={value.startsWith('blob:') || value.startsWith('data:') ? undefined : 'anonymous'} src={value} alt={valueAlt ?? ''} />
                : <Film aria-hidden="true" />}
            </span>
            <span className="ds-drop-meta">
              {valueName && <b className="ds-drop-name">{valueName}</b>}
              {valueMeta && <span className="ds-drop-hint">{valueMeta}</span>}
              {status && <span className="ds-drop-hint" role="status">{status}</span>}
              {children}
              <span className="ds-drop-actions">
                <Button size="sm" icon={<Upload aria-hidden="true" />} busy={isBusy} disabled={disabled} onClick={choose}>
                  Replace<span className="ds-sr-only"> {name}</span>
                </Button>
                {onRemove && (
                  <Button size="sm" kind="quiet" disabled={off} onClick={() => { setProblem(''); onRemove(); }}>
                    Remove<span className="ds-sr-only"> {name}</span>
                  </Button>
                )}
              </span>
            </span>
          </>
        ) : (
          <>
            <Icon className="ds-drop-icon" aria-hidden="true" />
            <p className="ds-drop-label" id={labelId}>{label}</p>
            <span className="ds-drop-actions">
              <Button size="sm" icon={<Upload aria-hidden="true" />} busy={isBusy} disabled={disabled} onClick={choose}>
                Choose file<span className="ds-sr-only">: {name}</span>
              </Button>
              {kind === 'image' && <span className="ds-drop-hint">or press Ctrl+V / ⌘V</span>}
            </span>
            {status && <span className="ds-drop-hint" role="status">{status}</span>}
            {hint && <span className="ds-drop-hint" id={hintId}>{hint}</span>}
          </>
        )}
      </div>
      {shown && <p className="ds-error" id={errorId} role="alert"><AlertCircle aria-hidden="true" />{shown}</p>}
      <input
        ref={input}
        className="ds-drop-input"
        type="file"
        accept={types}
        multiple={multiple}
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ''; void take(files); }}
      />
    </div>
  );
}
