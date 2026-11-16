'use client';
import * as React from 'react';
import { ChevronLeft, ChevronRight, Download, FolderInput, ImageIcon, MoreHorizontal, Sparkles, Trash2, X } from 'lucide-react';
import { Button, IconButton, dsClass } from './button';
import { Badge, type BadgeKind } from './feedback';
import { Menu, MenuItem, MenuSeparator } from './menu';
import { plural } from '@/lib/ds/words';

// Media tile and grid, the bulk bar, and the viewer.
// - The tile opens with a real button (keyboard and screen reader), not a div.
// - Its hover actions also show on focus, while selecting, and always on touch.
// - Selecting is a tick box on the tile: a single-pointer way that needs no drag.
// - "Move to…" is in every tile's menu: the alternative to dragging (2.5.7).

export type MediaItem = {
  id: string;
  name: string;
  sub?: string;
  /** The small picture the tile shows. */
  src?: string;
  /** The full picture, loaded only by the viewer (a short-lived signed link). */
  full?: string;
  kind?: 'image' | 'video' | 'film' | 'storyboard' | 'swap';
  status?: { kind: BadgeKind; label: string };
  width?: number;
  height?: number;
};

/** A tile's picture, fetched only when the tile is on screen or within 200px
 *  of it (the browser's own lazy loading reaches much further): a long library
 *  reads nothing from storage for what is not shown. */
function TileImage({ src, width, height }: { src: string; width?: number; height?: number }) {
  const ref = React.useRef<HTMLImageElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const load = () => { if (el.getAttribute('src') !== src) el.setAttribute('src', src); };
    if (typeof IntersectionObserver === 'undefined') { load(); return; }
    const watch = new IntersectionObserver((seen) => { if (seen.some((e) => e.isIntersecting)) { load(); watch.disconnect(); } }, { rootMargin: '200px' });
    watch.observe(el);
    return () => watch.disconnect();
  }, [src]);
  // eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs, set when on screen
  return <img ref={ref} alt="" decoding="async" width={width} height={height} />;
}

export function MediaTile({ item, selected, onSelect, onOpen, onMove, onDelete, onDownload }: {
  item: MediaItem;
  selected?: boolean;
  onSelect?: (on: boolean) => void;
  onOpen?: () => void;
  onMove?: () => void;
  onDelete?: () => void;
  onDownload?: () => void;
}) {
  return (
    <div className="ds-tile" role="listitem" data-selected={selected || undefined}>
      <div className="ds-tile-media">
        {item.src
          // Signed URLs are sized by the server; the tile reserves the space so
          // nothing moves when the picture arrives (CLS).
          ? <TileImage src={item.src} width={item.width} height={item.height} />
          : <span className="ds-tile-placeholder" aria-hidden="true"><ImageIcon /></span>}
        {onOpen && <button type="button" className="ds-tile-open" onClick={onOpen}><span className="ds-sr-only">Open {item.name}</span></button>}
        {item.status && <span className="ds-tile-status"><Badge kind={item.status.kind}>{item.status.label}</Badge></span>}
      </div>
      {/* Outside the media box, which clips: the menu must be able to drop below it. */}
      {onSelect && (
        <label className="ds-tile-select">
          <input type="checkbox" checked={!!selected} onChange={(e) => onSelect(e.target.checked)} aria-label={`Select ${item.name}`} />
        </label>
      )}
      {(onMove || onDelete || onDownload) && (
        <div className="ds-tile-actions">
          <Menu label={`More for ${item.name}`} trigger={<MoreHorizontal aria-hidden="true" />} size="sm">
            {onDownload && <MenuItem icon={<Download />} onSelect={onDownload}>Download</MenuItem>}
            {onMove && <MenuItem icon={<FolderInput />} onSelect={onMove}>Move to…</MenuItem>}
            {onDelete && <><MenuSeparator /><MenuItem icon={<Trash2 />} danger onSelect={onDelete}>Move to trash</MenuItem></>}
          </Menu>
        </div>
      )}
      <div className="ds-tile-meta">
        <span className="ds-tile-name ds-truncate" title={item.name}>{item.name}</span>
        {item.sub && <span className="ds-tile-sub">{item.sub}</span>}
      </div>
    </div>
  );
}

export function MediaGrid({ label, selecting, dense, children }: { label: string; selecting?: boolean; dense?: boolean; children: React.ReactNode }) {
  return <div className={dsClass('ds-grid', dense && 'dense')} role="list" aria-label={label} data-selecting={selecting || undefined}>{children}</div>;
}

/** Appears once something is selected; says how many and offers the bulk actions. */
export function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: React.ReactNode }) {
  if (count <= 0) return null;
  return (
    <div className="ds-bulkbar" role="toolbar" aria-label="Selected items">
      <span className="ds-bulkbar-count" aria-live="polite">{plural(count, 'item')} selected</span>
      {children}
      <IconButton label="Clear the selection" size="sm" onClick={onClear}><X aria-hidden="true" /></IconButton>
    </div>
  );
}

// ── Viewer / lightbox ────────────────────────────────────────────────────
// ← / → move, Escape closes, focus returns to the tile that opened it.
export function Viewer({ items, index, onIndex, onClose, onDownload, onVariation, onMove, onDelete }: {
  items: MediaItem[];
  index: number | null;
  onIndex: (i: number) => void;
  onClose: () => void;
  onDownload?: (item: MediaItem) => void;
  onVariation?: (item: MediaItem) => void;
  onMove?: (item: MediaItem) => void;
  onDelete?: (item: MediaItem) => void;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const opener = React.useRef<HTMLElement | null>(null);
  const open = index !== null && index >= 0 && index < items.length;
  const item = open ? items[index] : null;

  React.useEffect(() => {
    const el = ref.current;
    if (!el || !open || el.open) return;
    opener.current = document.activeElement as HTMLElement | null;
    el.showModal();
    const was = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => {
      if (el.open) el.close();
      document.documentElement.style.overflow = was;
      if (opener.current && document.contains(opener.current)) opener.current.focus();
    };
  }, [open]);

  const go = (step: number) => { if (index !== null && items.length) onIndex((index + step + items.length) % items.length); };
  return (
    <dialog
      ref={ref}
      className="ds-viewer"
      aria-label={item ? `Viewer: ${item.name}` : 'Viewer'}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onKeyDown={(e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      }}
    >
      {item && <>
        <div className="ds-viewer-bar">
          <h2 className="ds-viewer-title ds-truncate" title={item.name}>{item.name}</h2>
          <span className="ds-viewer-count" aria-live="polite">{(index ?? 0) + 1} of {items.length}</span>
          <IconButton label="Close the viewer" onClick={onClose}><X aria-hidden="true" /></IconButton>
        </div>
        <div className="ds-viewer-stage">
          {/* eslint-disable-next-line @next/next/no-img-element -- private media on signed URLs (Phase 2b) */}
          {(item.full || item.src) ? <img src={item.full || item.src} alt={item.name} /> : <div className="ds-viewer-media" role="img" aria-label={item.name}><ImageIcon aria-hidden="true" /></div>}
          {items.length > 1 && <>
            <IconButton className="ds-viewer-prev" label="Previous" onClick={() => go(-1)}><ChevronLeft aria-hidden="true" /></IconButton>
            <IconButton className="ds-viewer-next" label="Next" onClick={() => go(1)}><ChevronRight aria-hidden="true" /></IconButton>
          </>}
        </div>
        <div className="ds-viewer-foot">
          {onDownload && <Button icon={<Download aria-hidden="true" />} onClick={() => onDownload(item)}>Download</Button>}
          {onVariation && <Button kind="primary" icon={<Sparkles aria-hidden="true" />} onClick={() => onVariation(item)}>Make a variation</Button>}
          {onMove && <Button icon={<FolderInput aria-hidden="true" />} onClick={() => onMove(item)}>Move to…</Button>}
          {onDelete && <Button kind="danger-quiet" icon={<Trash2 aria-hidden="true" />} onClick={() => onDelete(item)}>Move to trash</Button>}
        </div>
      </>}
    </dialog>
  );
}
