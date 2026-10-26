import { EMPTY_FILTERS, LIST_KEYS, type Filters, type ListKey } from './filters';

/** Krátké názvy parametrů v URL, aby šel odkaz pohodlně sdílet. */
const PARAM: Record<ListKey, string> = {
  depts: 'dept',
  payers: 'payer',
  groups: 'grp',
  tests: 'test',
  sex: 'sex',
  ages: 'age',
  priority: 'prio',
  analyzers: 'an',
  status: 'status',
};

export function filtersToParams(f: Filters, base?: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base);
  for (const k of ['from', 'to'] as const) {
    if (f[k]) p.set(k, f[k]!);
    else p.delete(k);
  }
  for (const k of LIST_KEYS) {
    if (f[k].length) p.set(PARAM[k], [...f[k]].sort().join(','));
    else p.delete(PARAM[k]);
  }
  return p;
}

export function paramsToFilters(p: URLSearchParams): Filters {
  const f: Filters = { ...EMPTY_FILTERS };
  f.from = p.get('from');
  f.to = p.get('to');
  for (const k of LIST_KEYS) {
    const v = p.get(PARAM[k]);
    f[k] = v ? v.split(',').filter(Boolean) : [];
  }
  return f;
}

/** Stabilní textová podoba filtrů pro porovnání. */
export function filtersKey(f: Filters): string {
  return filtersToParams(f, new URLSearchParams()).toString();
}

/** Parametry z hash routy (#/clinical/overview?from=…) při prvním načtení stránky. */
export function initialHashParams(): URLSearchParams {
  return new URLSearchParams(window.location.hash.split('?')[1] ?? '');
}
