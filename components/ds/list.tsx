'use client';
import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';
import { dsClass } from './button';

// Long lists and logs: 10 rows, then "1–10 of 47" with Previous and Next.
// One component for every list in the Studio (tables, people, logs), so they
// all page the same way. A list that fits on one page shows no pager.

export const PAGE_SIZE = 10;

export function usePaged<T>(items: readonly T[], size = PAGE_SIZE) {
  const [page, setPage] = React.useState(0);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(page, pages - 1);
  const start = current * size;
  return { page: current, pages, setPage, start, size, total: items.length, shown: items.slice(start, start + size) };
}

/** "1–10 of 47" and Previous / Next. Nothing when everything fits. */
export function Pager({ page, pages, start, size, total, setPage, label }: { page: number; pages: number; start: number; size: number; total: number; setPage: (p: number) => void; label: string }) {
  if (total <= size) return null;
  const end = Math.min(total, start + size);
  return (
    <nav className="ds-pager" aria-label={`${label}, pages`}>
      <span className="ds-pager-range" aria-live="polite">{start + 1}–{end} of {total}</span>
      <span className="ds-pager-actions">
        <Button size="sm" kind="quiet" icon={<ChevronLeft aria-hidden="true" />} disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
        <Button size="sm" kind="quiet" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next<ChevronRight aria-hidden="true" /></Button>
      </span>
    </nav>
  );
}

/** A plain list (people, a log) that pages after `size` rows. */
export function PagedList<T>({ items, label, itemKey, render, className, size = PAGE_SIZE }: { items: readonly T[]; label: string; itemKey: (item: T, index: number) => string; render: (item: T) => React.ReactNode; className?: string; size?: number }) {
  const paged = usePaged(items, size);
  return (
    <div className="ds-list-wrap">
      <ul className={dsClass('ds-list', className)} aria-label={label}>
        {paged.shown.map((item, i) => <React.Fragment key={itemKey(item, paged.start + i)}>{render(item)}</React.Fragment>)}
      </ul>
      <Pager {...paged} label={label} />
    </div>
  );
}

// The table pattern (Usage, Company settings): a real <table> with a caption
// and column headers, numbers on the right in tabular figures. Below 600px each
// row becomes a card: the first column is its title and every other cell shows
// its column's name in front of it (app/settings.css). Pages after `size` rows.
export type Column = { key: string; label: string; numeric?: boolean };
export type Row = { key: string; cells: Record<string, React.ReactNode> };

export function DataTable({ caption, columns, rows, hideCaption = true, size = PAGE_SIZE }: { caption: string; columns: Column[]; rows: Row[]; hideCaption?: boolean; size?: number }) {
  const paged = usePaged(rows, size);
  return (
    <div className="ws-table-wrap ds-list-wrap">
      <table className="ws-table">
        <caption className={hideCaption ? 'ds-sr-only' : 'ws-table-caption'}>{caption}</caption>
        <thead>
          <tr>{columns.map((c) => <th key={c.key} scope="col" className={c.numeric ? 'num' : undefined}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {paged.shown.map((r) => (
            <tr key={r.key}>
              {columns.map((c, i) => i === 0
                ? <th key={c.key} scope="row" data-label={c.label}>{r.cells[c.key]}</th>
                : <td key={c.key} data-label={c.label} className={c.numeric ? 'num' : undefined}>{r.cells[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <Pager {...paged} label={caption} />
    </div>
  );
}
