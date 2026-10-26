import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../ui/Icon';
import type { Option } from './useSlicerOptions';

type Props = {
  label: string;
  options: Option[];
  selected: string[];
  onChange: (values: string[]) => void;
  searchable?: boolean;
};

/** Vícenásobný výběr s vyhledáváním a skupinami. Prázdný výběr = vše. */
export function MultiSelect({ label, options, selected, onChange, searchable = false }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  }, [options, q]);

  const summary =
    selected.length === 0
      ? t('slicers.all')
      : selected.length <= 2
        ? selected.map((v) => options.find((o) => o.value === v)?.label ?? v).join(', ')
        : t('slicers.selected', { count: selected.length });

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  return (
    <div ref={ref} className="relative">
      <span className="mb-1 block text-xs font-medium text-ink-2">{label}</span>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-surface px-2.5 py-1.5 text-left text-sm ${
          selected.length ? 'border-accent' : 'border-line'
        }`}
      >
        <span className={`truncate ${selected.length ? 'text-ink' : 'text-muted'}`}>{summary}</span>
        <Icon
          name="chevron"
          className={`size-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div
          id={listId}
          className="absolute right-0 left-0 z-30 mt-1 rounded-lg border border-line bg-surface p-1 shadow-lg"
        >
          {searchable && (
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('slicers.search')}
              className="mb-1 w-full rounded-md border border-line bg-surface-2 px-2 py-1 text-sm outline-none focus:border-accent"
            />
          )}
          <div className="flex justify-between px-2 py-1 text-xs">
            <button
              className="text-accent hover:underline"
              onClick={() => onChange(visible.map((o) => o.value))}
            >
              {t('slicers.selectAll')}
            </button>
            <button className="text-muted hover:text-ink" onClick={() => onChange([])}>
              {t('slicers.clearAll')}
            </button>
          </div>
          <ul className="max-h-64 overflow-y-auto" role="listbox" aria-multiselectable="true">
            {visible.length === 0 && <li className="px-2 py-2 text-sm text-muted">{t('slicers.none')}</li>}
            {visible.map((o, i) => {
              const header = o.group && o.group !== visible[i - 1]?.group ? o.group : null;
              const checked = selected.includes(o.value);
              return (
                <li key={o.value}>
                  {header && (
                    <div className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
                      {header}
                    </div>
                  )}
                  <label
                    role="option"
                    aria-selected={checked}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(o.value)}
                      className="size-3.5 accent-[var(--accent)]"
                    />
                    <span className="truncate">{o.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
