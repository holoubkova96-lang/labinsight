import { useTranslation } from 'react-i18next';
import { useFilters } from '../../store/filters';
import { DATA_END, DATA_START } from './useSlicerOptions';

function monthsBack(end: string, months: number): string {
  // počítáme v celých měsících bez Date, aby se datum neposunulo časovou zónou
  const [y, m] = end.split('-').map(Number);
  const idx = y * 12 + (m - 1) - months + 1;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}-01`;
}

const PRESETS = [
  { id: '3m', from: monthsBack(DATA_END, 3) },
  { id: '6m', from: monthsBack(DATA_END, 6) },
  { id: '12m', from: monthsBack(DATA_END, 12) },
  { id: 'ytd', from: `${DATA_END.slice(0, 4)}-01-01` },
  { id: 'all', from: null },
] as const;

export function DateRange() {
  const { t } = useTranslation();
  const from = useFilters((s) => s.from);
  const to = useFilters((s) => s.to);
  const setRange = useFilters((s) => s.setRange);

  const activePreset = PRESETS.find(
    (p) => p.from === from && (p.from ? to === null || to === DATA_END : to === null),
  )?.id;
  const input =
    'w-full min-w-0 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-accent';

  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-ink-2">{t('slicers.period')}</legend>
      <div className="flex flex-wrap gap-1" title={t('slicers.presetsHint')}>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={activePreset === p.id}
            onClick={() => setRange(p.from, null)}
            className={`rounded-md border px-2 py-1 text-xs ${
              activePreset === p.id
                ? 'border-accent bg-accent-soft font-medium text-ink'
                : 'border-line text-ink-2 hover:text-ink'
            }`}
          >
            {t(`slicers.presets.${p.id}`)}
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">
          {t('slicers.from')}
          <input
            type="date"
            className={input}
            min={DATA_START}
            max={to ?? DATA_END}
            value={from ?? DATA_START}
            onChange={(e) =>
              setRange(e.target.value && e.target.value !== DATA_START ? e.target.value : null, to)
            }
          />
        </label>
        <label className="text-xs text-muted">
          {t('slicers.to')}
          <input
            type="date"
            className={input}
            min={from ?? DATA_START}
            max={DATA_END}
            value={to ?? DATA_END}
            onChange={(e) =>
              setRange(from, e.target.value && e.target.value !== DATA_END ? e.target.value : null)
            }
          />
        </label>
      </div>
    </fieldset>
  );
}
