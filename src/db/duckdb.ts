import * as duckdb from '@duckdb/duckdb-wasm';
import { DataType } from 'apache-arrow';
import mvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import ehWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

/** Parquet soubory z generátoru (public/data). Název souboru = název tabulky. */
export const TABLES = [
  'dim_date',
  'dim_patients',
  'dim_tests',
  'dim_reference_ranges',
  'dim_method_registry',
  'dim_departments',
  'dim_insurers',
  'dim_analyzers',
  'fact_orders',
  'fact_results',
  'fact_qc_runs',
  'fact_monthly_costs',
] as const;

/**
 * Široké (denormalizované) tabulky pro dashboard. Slicery filtrují přímo jejich
 * sloupce, takže každý graf může použít stejnou WHERE klauzuli (cross-filtering).
 */
const DERIVED_SQL = [
  `CREATE TABLE results_wide AS
   SELECT r.*, o.episode_id, o.patient_id, o.dept_id, o.collected_at, o.received_at, o.priority, o.payer_type,
          coalesce(o.insurer_code, 'SELF') AS payer,
          CAST(o.collected_at AS DATE) AS collected_date,
          strftime(o.collected_at, '%Y-%m') AS month_key,
          p.sex, p.age_group, t.test_group, t.method_status, d.kind AS dept_kind
   FROM fact_results r
   JOIN fact_orders o USING (order_id)
   JOIN dim_patients p USING (patient_id)
   JOIN dim_tests t USING (test_id)
   JOIN dim_departments d USING (dept_id)`,
  `CREATE TABLE costs_wide AS
   SELECT c.*, t.test_group, t.method_status
   FROM fact_monthly_costs c JOIN dim_tests t USING (test_id)`,
  `CREATE TABLE qc_wide AS
   SELECT q.*, CAST(q.run_at AS DATE) AS run_date, t.test_group, t.method_status
   FROM fact_qc_runs q JOIN dim_tests t USING (test_id)`,
];

export type Row = Record<string, string | number | boolean | null>;
export type LoadProgress = { step: 'engine' | 'tables' | 'ready'; loaded: number; total: number };

let dbPromise: Promise<duckdb.AsyncDuckDBConnection> | null = null;

export function initDb(onProgress?: (p: LoadProgress) => void): Promise<duckdb.AsyncDuckDBConnection> {
  if (!dbPromise) {
    dbPromise = (async () => {
      onProgress?.({ step: 'engine', loaded: 0, total: TABLES.length });
      const bundle = await duckdb.selectBundle({
        mvp: { mainModule: mvpWasm, mainWorker: mvpWorker },
        eh: { mainModule: ehWasm, mainWorker: ehWorker },
      });
      const worker = new Worker(bundle.mainWorker!);
      const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      const conn = await db.connect();

      let loaded = 0;
      onProgress?.({ step: 'tables', loaded, total: TABLES.length });
      await Promise.all(
        TABLES.map(async (name) => {
          const res = await fetch(`${import.meta.env.BASE_URL}data/${name}.parquet`);
          if (!res.ok) throw new Error(`${name}.parquet: HTTP ${res.status}`);
          await db.registerFileBuffer(`${name}.parquet`, new Uint8Array(await res.arrayBuffer()));
          onProgress?.({ step: 'tables', loaded: ++loaded, total: TABLES.length });
        }),
      );
      // CREATE TABLE postupně – jedno spojení nesmí běžet paralelně
      for (const name of TABLES) {
        await conn.query(`CREATE TABLE ${name} AS SELECT * FROM read_parquet('${name}.parquet')`);
      }
      for (const sql of DERIVED_SQL) await conn.query(sql);
      onProgress?.({ step: 'ready', loaded, total: TABLES.length });
      return conn;
    })();
    dbPromise.catch(() => {
      dbPromise = null; // umožní nový pokus po chybě (např. výpadek sítě)
    });
  }
  return dbPromise;
}

function normalize(v: unknown): Row[string] {
  if (typeof v === 'bigint') return Number(v);
  if (v instanceof Date) return v.getTime();
  if (v === undefined) return null;
  return v as Row[string];
}

// DuckDB-WASM spojení zpracovává dotazy po jednom – řadíme je do fronty
let queue: Promise<unknown> = Promise.resolve();

export async function query<T extends Row = Row>(sql: string): Promise<T[]> {
  const conn = await initDb();
  const run = queue.then(() => conn.query(sql));
  queue = run.catch(() => undefined);
  const table = await run;
  // DECIMAL přichází z Arrow jako celé číslo bez desetinné čárky – vydělíme 10^scale
  const fields = table.schema.fields.map((f) => ({
    name: f.name,
    scale: DataType.isDecimal(f.type) ? 10 ** f.type.scale : 0,
  }));
  const rows: T[] = [];
  for (const r of table.toArray()) {
    const o: Row = {};
    for (const f of fields) {
      const v = r[f.name];
      o[f.name] = f.scale && v != null ? Number(String(v)) / f.scale : normalize(v);
    }
    rows.push(o as T);
  }
  return rows;
}
