import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { EChartsType } from 'echarts';
import type { Row } from '../../db/duckdb';
import { saveElementAsPng } from './exportImage';
import { Icon } from '../ui/Icon';
import { InfoTip } from '../ui/InfoTip';
import { SqlModal } from '../ui/SqlModal';
import { EmptyState, ErrorState, Skeleton } from '../ui/States';

type Props = {
  title: string;
  subtitle?: string;
  info?: string;
  sql: string;
  data: Row[] | null;
  loading: boolean;
  error: string | null;
  /** Filtry, které se na data grafu nevztahují. */
  ignoredNote?: string;
  /** Poznámka pod grafem (např. hodnoty mimo osu). */
  note?: string;
  /** Výška oblasti grafu v px; 'auto' pro tabulky. */
  height?: number | 'auto';
  fileName: string;
  /** Ovládací prvky karty (výběr testu, přepínač dimenze…). */
  controls?: ReactNode;
  /** Tabulková karta nemá PNG export. */
  png?: boolean;
  className?: string;
  children: (register: (chart: EChartsType | null) => void) => ReactNode;
};

function toCsv(rows: Row[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

/** Registrace instance grafu už není potřeba (PNG se dělá ze stránky), API zůstává kvůli stránkám. */
const noop = () => {};

function download(href: string, name: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
}

/** Karta grafu: titulek, vysvětlivka, export CSV/PNG a „Zobrazit SQL“. */
export function ChartCard({
  title,
  subtitle,
  info,
  sql,
  data,
  loading,
  error,
  ignoredNote,
  note,
  height = 300,
  fileName,
  controls,
  png = true,
  className = '',
  children,
}: Props) {
  const { t } = useTranslation();
  const [showSql, setShowSql] = useState(false);
  const cardRef = useRef<HTMLElement>(null);

  const exportCsv = () => {
    if (!data) return;
    const url = URL.createObjectURL(
      new Blob([String.fromCharCode(0xfeff) + toCsv(data)], { type: 'text/csv;charset=utf-8' }),
    );
    download(url, `${fileName}.csv`);
    URL.revokeObjectURL(url);
  };
  // PNG celé karty včetně titulku – funguje se SVG grafy i v tmavém režimu
  const exportPng = () => {
    if (cardRef.current) void saveElementAsPng(cardRef.current, `${fileName}.png`);
  };

  const btn =
    'flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-40';
  return (
    <section ref={cardRef} className={`min-w-0 rounded-xl border border-line bg-surface p-4 ${className}`}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            {title}
            {info && <InfoTip text={info} />}
          </h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-0.5" data-no-export>
          <button className={btn} onClick={() => setShowSql(true)} title={t('common.showSql')}>
            <Icon name="code" className="size-3.5" />
            {t('common.showSql')}
          </button>
          <button
            className={btn}
            onClick={exportCsv}
            disabled={!data?.length}
            title={t('common.exportCsvTitle')}
          >
            <Icon name="download" className="size-3.5" />
            {t('common.exportCsv')}
          </button>
          {png && (
            <button
              className={btn}
              onClick={exportPng}
              disabled={!data?.length}
              title={t('common.exportPngTitle')}
            >
              <Icon name="download" className="size-3.5" />
              {t('common.exportPng')}
            </button>
          )}
        </div>
      </header>
      {controls && <div className="mb-3 flex flex-wrap items-center gap-2">{controls}</div>}
      {ignoredNote && <p className="mb-2 text-xs text-muted">{ignoredNote}</p>}
      <div style={height === 'auto' ? undefined : { height }} className={height === 'auto' ? 'min-h-24' : ''}>
        {error ? (
          <ErrorState message={error} />
        ) : loading && !data ? (
          <Skeleton className={height === 'auto' ? 'h-40' : 'h-full'} />
        ) : !data?.length ? (
          <EmptyState />
        ) : (
          <div className={`h-full transition-opacity ${loading ? 'opacity-60' : ''}`}>{children(noop)}</div>
        )}
      </div>
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
      {showSql && <SqlModal sql={sql} onClose={() => setShowSql(false)} />}
    </section>
  );
}
