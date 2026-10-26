import { useEffect, useState } from 'react';
import { query, type Row } from './duckdb';

type State<T> = { data: T[] | null; error: string | null; loading: boolean };
type Settled = { sql: string; data?: Row[]; error?: string };

const cache = new Map<string, Row[]>();

/**
 * Spustí SQL v DuckDB při každé změně textu dotazu. Výsledky se cachují podle SQL.
 * Během načítání nového dotazu vrací poslední data, aby graf neproblikl.
 */
export function useQuery<T extends Row = Row>(sql: string | null): State<T> {
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!sql || cache.has(sql)) return;
    let cancelled = false;
    query(sql)
      .then((rows) => {
        cache.set(sql, rows);
        if (!cancelled) setSettled({ sql, data: rows });
      })
      .catch((e: unknown) => {
        if (!cancelled) setSettled({ sql, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [sql]);

  const cached = sql ? cache.get(sql) : undefined;
  const error = settled?.sql === sql ? (settled.error ?? null) : null;
  return {
    data: (cached ?? settled?.data ?? null) as T[] | null,
    error,
    loading: !!sql && !cached && !error,
  };
}
