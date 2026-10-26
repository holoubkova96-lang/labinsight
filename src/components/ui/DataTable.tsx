import { useState, type ReactNode } from 'react';
import type { Row } from '../../db/duckdb';

export type Column<T extends Row> = {
  key: keyof T & string;
  label: string;
  align?: 'left' | 'right';
  render?: (row: T) => ReactNode;
};

type Props<T extends Row> = {
  columns: Column<T>[];
  rows: T[];
  onRowClick?: (row: T) => void;
  isActive?: (row: T) => boolean;
  maxHeight?: number;
};

/** Tabulka s řazením kliknutím na záhlaví. Slouží i jako textová alternativa grafů. */
export function DataTable<T extends Row>({ columns, rows, onRowClick, isActive, maxHeight = 360 }: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const sorted = sort
    ? [...rows].sort((a, b) => {
        const x = a[sort.key];
        const y = b[sort.key];
        if (x == null) return 1;
        if (y == null) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      })
    : rows;

  return (
    <div className="overflow-auto rounded-lg border border-line" style={{ maxHeight }}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface-2 text-xs text-ink-2">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
                className={`px-3 py-2 font-medium whitespace-nowrap ${c.align === 'right' ? 'text-right' : 'text-left'}`}
              >
                <button
                  className="hover:text-ink"
                  onClick={() =>
                    setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === -1 ? 1 : -1 }))
                  }
                >
                  {c.label}
                  {sort?.key === c.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr
              key={i}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={`border-t border-line ${onRowClick ? 'cursor-pointer hover:bg-surface-2' : ''} ${
                isActive?.(r) ? 'bg-accent-soft' : ''
              }`}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`tabular px-3 py-1.5 whitespace-nowrap ${c.align === 'right' ? 'text-right' : ''}`}
                >
                  {c.render ? c.render(r) : String(r[c.key] ?? '–')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
