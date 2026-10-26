import { useTranslation } from 'react-i18next';
import { useFormat } from '../../i18n/format';
import { LIST_KEYS, useFilters, useFilterValues } from '../../store/filters';
import { Icon } from '../ui/Icon';
import { DATA_END, DATA_START, useSlicerOptions } from './useSlicerOptions';

/** Aktivní filtry jako „chips“ – každý jde zrušit jedním klikem. */
export function FilterChips() {
  const { t } = useTranslation();
  const f = useFormat();
  const filters = useFilterValues();
  const toggle = useFilters((s) => s.toggle);
  const clear = useFilters((s) => s.clear);
  const clearAll = useFilters((s) => s.clearAll);
  const options = useSlicerOptions();

  const chips: { id: string; label: string; onRemove: () => void }[] = [];
  if (filters.from || filters.to) {
    chips.push({
      id: 'range',
      label: `${t('slicers.period')}: ${f.date(filters.from ?? DATA_START)} – ${f.date(filters.to ?? DATA_END)}`,
      onRemove: () => clear('from'),
    });
  }
  for (const key of LIST_KEYS) {
    for (const v of filters[key]) {
      const label = options[key].find((o) => o.value === v)?.label ?? v;
      chips.push({
        id: `${key}:${v}`,
        label: `${t(`slicers.${key}`)}: ${label}`,
        onRemove: () => toggle(key, v),
      });
    }
  }
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label={t('chips.active')}>
      {chips.map((c) => (
        <span
          key={c.id}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-accent/40 bg-accent-soft py-0.5 pr-1 pl-3 text-xs text-ink"
        >
          <span className="truncate">{c.label}</span>
          <button
            onClick={c.onRemove}
            className="rounded-full p-0.5 text-ink-2 hover:bg-surface hover:text-ink"
            aria-label={t('chips.remove', { label: c.label })}
          >
            <Icon name="x" className="size-3" />
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button
          onClick={clearAll}
          className="text-xs text-ink-2 underline-offset-2 hover:text-ink hover:underline"
        >
          {t('slicers.clearAll')}
        </button>
      )}
    </div>
  );
}
