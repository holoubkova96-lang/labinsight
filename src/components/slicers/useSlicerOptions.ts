import { useTranslation } from 'react-i18next';
import { useQuery } from '../../db/useQuery';
import { useFormat } from '../../i18n/format';
import type { ListKey } from '../../store/filters';

export type Option = { value: string; label: string; group?: string; parent?: string };
export type SlicerOptions = Record<ListKey, Option[]>;

/** Rozsah dat z generátoru – rychlé volby období se počítají od jeho konce. */
export const DATA_START = '2023-10-01';
export const DATA_END = '2026-09-30';

const AGE_GROUPS = ['0-17', '18-39', '40-64', '65-79', '80+'];

type NameRow = { id: string; name_cs: string; name_en: string; extra: string | null };

/** Možnosti všech slicerů – číselníky se čtou z dimenzí v DuckDB. */
export function useSlicerOptions(): SlicerOptions {
  const { t } = useTranslation();
  const f = useFormat();
  const depts = useQuery<NameRow>(
    `SELECT dept_id AS id, name_cs, name_en, kind AS extra FROM dim_departments ORDER BY kind DESC, dept_id`,
  );
  const insurers = useQuery<NameRow>(
    `SELECT insurer_code AS id, name_cs, name_en, NULL AS extra FROM dim_insurers ORDER BY insurer_code`,
  );
  const groups = useQuery<NameRow>(
    `SELECT DISTINCT test_group AS id, group_name_cs AS name_cs, group_name_en AS name_en, NULL AS extra
     FROM dim_tests ORDER BY id`,
  );
  const tests = useQuery<NameRow>(
    `SELECT test_id AS id, name_cs, name_en, test_group AS extra FROM dim_tests ORDER BY test_group, name_cs`,
  );
  const analyzers = useQuery<NameRow>(
    `SELECT analyzer_id AS id, name_cs, name_en, NULL AS extra FROM dim_analyzers ORDER BY analyzer_id`,
  );

  const rows = (r: NameRow[] | null) => r ?? [];
  return {
    depts: rows(depts.data).map((d) => ({
      value: d.id,
      label: f.name(d),
      group: t(d.extra === 'INTERNAL' ? 'slicers.internal' : 'slicers.external'),
    })),
    payers: [
      ...rows(insurers.data).map((d) => ({ value: d.id, label: `${d.id} · ${f.name(d)}` })),
      { value: 'SELF', label: t('slicers.self') },
    ],
    groups: rows(groups.data).map((d) => ({ value: d.id, label: f.name(d) })),
    tests: rows(tests.data).map((d) => ({ value: d.id, label: f.name(d), parent: d.extra ?? undefined })),
    sex: ['F', 'M'].map((v) => ({ value: v, label: t(`values.sex.${v}`) })),
    ages: AGE_GROUPS.map((v) => ({ value: v, label: v })),
    priority: ['STAT', 'ROUTINE'].map((v) => ({ value: v, label: t(`values.priority.${v}`) })),
    analyzers: rows(analyzers.data).map((d) => ({ value: d.id, label: f.name(d) })),
    status: ['ACTIVE', 'CANCELLED'].map((v) => ({ value: v, label: t(`values.status.${v}`) })),
  };
}
