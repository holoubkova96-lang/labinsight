import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSlicerOptions } from '../components/slicers/useSlicerOptions';
import { useQuery } from '../db/useQuery';
import { buildWhere, type Source } from '../db/where';
import { useFilterValues } from '../store/filters';

/** WHERE pro daný zdroj + poznámka o filtrech, které se na něj nevztahují. */
export function useWhere(source: Source) {
  const { t } = useTranslation();
  const filters = useFilterValues();
  const { sql, ignored } = buildWhere(filters, source);
  const ignoredNote = ignored.length
    ? t('slicers.ignored', { list: ignored.map((k) => t(`slicers.${k}`)).join(', ') })
    : undefined;
  return { where: sql, ignoredNote, filters };
}

/** Lokalizované názvy z dimenzí (vyšetření, oddělení, analyzátory…) podle kódu. */
export function useLabels() {
  const options = useSlicerOptions();
  return useMemo(() => {
    const map = (key: keyof typeof options) => new Map(options[key].map((o) => [o.value, o.label]));
    const tests = map('tests');
    const depts = map('depts');
    const analyzers = map('analyzers');
    return {
      options,
      test: (id: string) => tests.get(id) ?? id,
      dept: (id: string) => depts.get(id) ?? id,
      analyzer: (id: string) => analyzers.get(id) ?? id,
    };
  }, [options]);
}

type TestMetaRow = { test_id: string; unit: string; decimals: number; test_group: string };

/** Jednotky a počet desetinných míst vyšetření. */
export function useTestMeta() {
  const { data } = useQuery<TestMetaRow>('SELECT test_id, unit, decimals, test_group FROM dim_tests');
  return useMemo(() => new Map((data ?? []).map((r) => [r.test_id, r])), [data]);
}

/**
 * Výběr jednoho vyšetření pro stránky s detailem analytu. Respektuje globální
 * filtr (skupina, vyšetření) a pamatuje si poslední volbu.
 */
export function useFocusTest(preferred: string, exclude: string[] = []) {
  const { options } = useLabels();
  const filters = useFilterValues();
  const [picked, setPicked] = useState<string | null>(null);
  const allowed = options.tests.filter(
    (o) =>
      !exclude.includes(o.value) &&
      (!filters.tests.length || filters.tests.includes(o.value)) &&
      (!filters.groups.length || (o.parent && filters.groups.includes(o.parent))),
  );
  const ok = (v: string | null) => !!v && allowed.some((o) => o.value === v);
  const test = ok(picked) ? picked! : ok(preferred) ? preferred : (allowed[0]?.value ?? preferred);
  return { test, setTest: setPicked, testOptions: allowed };
}
