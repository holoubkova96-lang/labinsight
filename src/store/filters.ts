import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

/** Hodnoty globálních slicerů. Prázdné pole = bez omezení. */
export type Filters = {
  from: string | null; // YYYY-MM-DD
  to: string | null;
  depts: string[];
  groups: string[];
  tests: string[];
  ages: string[];
  sex: string[];
  payerType: string[]; // 'INSURANCE' (jakákoli pojišťovna) nebo 'SELF' (samoplátce)
};
export type ListKey = Exclude<keyof Filters, 'from' | 'to'>;

export const LIST_KEYS: ListKey[] = ['depts', 'groups', 'tests', 'ages', 'sex', 'payerType'];

export const EMPTY_FILTERS: Filters = {
  from: null,
  to: null,
  depts: [],
  groups: [],
  tests: [],
  ages: [],
  sex: [],
  payerType: [],
};

type FilterState = Filters & {
  setRange: (from: string | null, to: string | null) => void;
  setList: (key: ListKey, values: string[]) => void;
  toggle: (key: ListKey, value: string) => void;
  /** Cross-filtering: klik do grafu nastaví právě tuto hodnotu (opakovaný klik ji zruší). */
  crossFilter: (key: ListKey, value: string) => void;
  clear: (key: keyof Filters) => void;
  clearAll: () => void;
  replaceAll: (f: Filters) => void;
};

export const useFilters = create<FilterState>((set) => ({
  ...EMPTY_FILTERS,
  setRange: (from, to) => set({ from, to }),
  setList: (key, values) => set({ [key]: values } as Partial<Filters>),
  toggle: (key, value) =>
    set((s) => ({
      [key]: s[key].includes(value) ? s[key].filter((v) => v !== value) : [...s[key], value],
    })),
  crossFilter: (key, value) =>
    set((s) => ({ [key]: s[key].length === 1 && s[key][0] === value ? [] : [value] })),
  clear: (key) =>
    set(key === 'from' || key === 'to' ? { from: null, to: null } : ({ [key]: [] } as Partial<Filters>)),
  clearAll: () => set(EMPTY_FILTERS),
  replaceAll: (f) => set(f),
}));

export function pickFilters(s: Filters): Filters {
  const f = { ...EMPTY_FILTERS };
  f.from = s.from;
  f.to = s.to;
  for (const k of LIST_KEYS) f[k] = s[k];
  return f;
}

/** Aktuální hodnoty filtrů (bez akcí); re-render jen při skutečné změně. */
export function useFilterValues(): Filters {
  return useFilters(useShallow(pickFilters));
}

export function activeFilterCount(f: Filters): number {
  return (f.from || f.to ? 1 : 0) + LIST_KEYS.reduce((n, k) => n + (f[k].length ? 1 : 0), 0);
}
