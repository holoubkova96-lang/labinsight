import { useTranslation } from 'react-i18next';
import { activeFilterCount, useFilters, useFilterValues, type ListKey } from '../../store/filters';
import { Icon } from '../ui/Icon';
import { DateRange } from './DateRange';
import { MultiSelect } from './MultiSelect';
import { useSlicerOptions } from './useSlicerOptions';

const LISTS: { key: ListKey; searchable?: boolean }[] = [
  { key: 'depts', searchable: true },
  { key: 'payers' },
  { key: 'groups' },
  { key: 'tests', searchable: true },
  { key: 'sex' },
  { key: 'ages' },
  { key: 'priority' },
  { key: 'analyzers' },
  { key: 'status' },
];

export function SlicerPanel({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();
  const filters = useFilterValues();
  const setList = useFilters((s) => s.setList);
  const clearAll = useFilters((s) => s.clearAll);
  const options = useSlicerOptions();
  const count = activeFilterCount(filters);

  // Vyšetření se zužují podle zvolené skupiny
  const testOptions = filters.groups.length
    ? options.tests.filter((o) => o.parent && filters.groups.includes(o.parent))
    : options.tests;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon name="filter" className="size-4 text-accent" />
          {t('slicers.title')}
          {count > 0 && (
            <span className="rounded-full bg-accent px-1.5 text-xs text-white dark:text-black">{count}</span>
          )}
        </h2>
        <div className="flex items-center gap-1">
          {count > 0 && (
            <button
              onClick={clearAll}
              className="rounded-md px-2 py-1 text-xs text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              {t('slicers.clearAll')}
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-md p-1 text-ink-2 hover:bg-surface-2"
              aria-label={t('slicers.close')}
            >
              <Icon name="x" />
            </button>
          )}
        </div>
      </div>
      <DateRange />
      {LISTS.map(({ key, searchable }) => (
        <MultiSelect
          key={key}
          label={t(`slicers.${key}`)}
          options={key === 'tests' ? testOptions : options[key]}
          selected={filters[key]}
          onChange={(v) => setList(key, v)}
          searchable={searchable}
        />
      ))}
    </div>
  );
}
