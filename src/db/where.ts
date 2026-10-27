import type { Filters, ListKey } from '../store/filters';

/** Zdroj dat, na který se filtry aplikují (široké tabulky z duckdb.ts). */
export type Source = 'results' | 'costs';

/** Sloupec každého slicru v daném zdroji; chybí-li, filtr se na zdroj nevztahuje. */
const COLUMNS: Record<Source, Partial<Record<ListKey, string>>> = {
  results: {
    depts: 'dept_id',
    groups: 'test_group',
    tests: 'test_id',
    ages: 'age_group',
    sex: 'sex',
    payerType: 'payer_type',
  },
  costs: { groups: 'test_group', tests: 'test_id' },
};

const SAFE_VALUE = /^[\p{L}\p{N}_\-. +]{1,40}$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** SQL řetězcový literál. Hodnoty navíc projdou whitelistem znaků (pochází i z URL). */
export function lit(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export type WhereResult = {
  /** Podmínky spojené AND, bez klíčového slova WHERE; '1=1' když nic. */
  sql: string;
  /** Aktivní filtry, které se na tento zdroj nevztahují (zobrazí se uživateli). */
  ignored: (keyof Filters)[];
};

export function buildWhere(f: Filters, source: Source, alias = ''): WhereResult {
  const p = alias ? `${alias}.` : '';
  const parts: string[] = [];
  const ignored: (keyof Filters)[] = [];

  const from = f.from && ISO_DATE.test(f.from) ? f.from : null;
  const to = f.to && ISO_DATE.test(f.to) ? f.to : null;
  if (from || to) {
    if (source === 'costs') {
      // měsíční granularita: měsíc patří do období, pokud se s ním překrývá
      if (from) parts.push(`${p}month_key >= ${lit(from.slice(0, 7))}`);
      if (to) parts.push(`${p}month_key <= ${lit(to.slice(0, 7))}`);
    } else {
      if (from) parts.push(`${p}collected_date >= DATE ${lit(from)}`);
      if (to) parts.push(`${p}collected_date <= DATE ${lit(to)}`);
    }
  }

  for (const [key, values] of Object.entries(f) as [keyof Filters, unknown][]) {
    if (!Array.isArray(values) || values.length === 0) continue;
    const col = COLUMNS[source][key as ListKey];
    if (!col) {
      ignored.push(key);
      continue;
    }
    const safe = values.filter((v) => SAFE_VALUE.test(v));
    if (safe.length) parts.push(`${p}${col} IN (${safe.map(lit).join(', ')})`);
  }
  return { sql: parts.length ? parts.join('\n  AND ') : '1=1', ignored };
}
