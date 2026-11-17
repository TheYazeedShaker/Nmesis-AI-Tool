import * as React from 'react';

// The shared table pattern (Usage, Company settings): a real <table> with a
// caption and column headers, numbers on the right in tabular figures. Below
// 600px each row becomes a card: the first column is its title and every other
// cell shows its column's name in front of it (app/settings.css), so nothing
// is wider than a phone's screen.
export type Column = { key: string; label: string; numeric?: boolean };
export type Row = { key: string; cells: Record<string, React.ReactNode> };

export function DataTable({ caption, columns, rows, hideCaption = true }: { caption: string; columns: Column[]; rows: Row[]; hideCaption?: boolean }) {
  return (
    <div className="ws-table-wrap">
      <table className="ws-table">
        <caption className={hideCaption ? 'ds-sr-only' : 'ws-table-caption'}>{caption}</caption>
        <thead>
          <tr>{columns.map((c) => <th key={c.key} scope="col" className={c.numeric ? 'num' : undefined}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              {columns.map((c, i) => i === 0
                ? <th key={c.key} scope="row" data-label={c.label}>{r.cells[c.key]}</th>
                : <td key={c.key} data-label={c.label} className={c.numeric ? 'num' : undefined}>{r.cells[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
