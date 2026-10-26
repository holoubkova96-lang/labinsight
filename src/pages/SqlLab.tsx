import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { useTranslation } from 'react-i18next';
import { ChartCard } from '../components/charts/ChartCard';
import { axisStyle, baseOption, useChartTheme } from '../components/charts/chartTheme';
import { EChart } from '../components/charts/EChart';
import { DataTable, type Column } from '../components/ui/DataTable';
import { Icon } from '../components/ui/Icon';
import { Segmented } from '../components/ui/Segmented';
import { Select } from '../components/ui/Select';
import { query, type Row } from '../db/duckdb';
import { useQuery } from '../db/useQuery';
import type { Lang } from '../i18n';
import { useFormat } from '../i18n/format';
import { PRESETS } from '../sqlLab/presets';
import { SqlEditor } from '../sqlLab/SqlEditor';

type Result = { rows: Row[]; ms: number; error: string | null };
type SchemaRow = { table_name: string; column_name: string; data_type: string };
const MAX_ROWS = 500;

export default function SqlLab() {
  const { t } = useTranslation();
  const f = useFormat();
  const theme = useChartTheme();
  const lang = f.lang as Lang;
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [edited, setEdited] = useState<string | null>(null); // vlastní úprava textu
  const [result, setResult] = useState<Result | null>(null);
  const [running, setRunning] = useState(false);
  const [view, setView] = useState<'table' | 'chart'>('table');
  const [yCol, setYCol] = useState<string | null>(null);

  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];
  // Neupravený ukázkový dotaz sleduje jazyk (komentáře CZ/EN)
  const text = edited ?? preset.sql(lang);

  const schemaQ = useQuery<SchemaRow>(
    `SELECT table_name, column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'main' ORDER BY table_name, ordinal_position`,
  );
  const schema = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const r of schemaQ.data ?? []) (m[r.table_name] ??= []).push(r.column_name);
    return m;
  }, [schemaQ.data]);

  const run = useCallback(async (sqlText: string) => {
    setRunning(true);
    const t0 = performance.now();
    try {
      const rows = await query(sqlText);
      setResult({ rows, ms: performance.now() - t0, error: null });
    } catch (e) {
      setResult({ rows: [], ms: performance.now() - t0, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setRunning(false);
    }
  }, []);

  // Ukázkový dotaz se po výběru rovnou spustí
  useEffect(() => {
    // spuštění až po vykreslení (stav se nemění synchronně v efektu)
    void Promise.resolve().then(() => run(PRESETS.find((p) => p.id === presetId)!.sql('cs')));
  }, [presetId, run]);

  const rows = result?.rows ?? [];
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const numericCols = cols.filter(
    (c) =>
      rows.some((r) => typeof r[c] === 'number') &&
      rows.every((r) => r[c] == null || typeof r[c] === 'number'),
  );
  const xCol = cols[0];
  const y =
    yCol && numericCols.includes(yCol) && yCol !== xCol
      ? yCol
      : (numericCols.find((c) => c !== xCol) ?? null);
  const chartRows = rows.slice(0, 60);
  const isTime = chartRows.every((r) => typeof r[xCol] === 'string' && /^\d{4}-\d{2}/.test(String(r[xCol])));
  const chartOption: EChartsOption = y
    ? {
        ...baseOption(theme),
        legend: { show: false },
        grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
        tooltip: {
          ...baseOption(theme).tooltip,
          trigger: 'axis',
          valueFormatter: (v) => f.num(Number(v), 2),
        },
        xAxis: {
          type: 'category',
          data: chartRows.map((r) => String(r[xCol])),
          ...axisStyle(theme),
          axisLabel: {
            ...axisStyle(theme).axisLabel,
            rotate: isTime ? 0 : 40,
            hideOverlap: true,
            width: 110,
            overflow: 'truncate',
          },
          splitLine: { show: false },
        },
        yAxis: {
          type: 'value',
          ...axisStyle(theme),
          axisLabel: { ...axisStyle(theme).axisLabel, formatter: (v: number) => f.num(v) },
        },
        series: [
          {
            type: isTime ? 'line' : 'bar',
            name: y,
            color: theme.series[0],
            symbolSize: 5,
            barMaxWidth: 28,
            itemStyle: { borderRadius: isTime ? 0 : [3, 3, 0, 0] },
            data: chartRows.map((r) => r[y] as number),
          },
        ],
      }
    : {};

  const columns: Column<Row>[] = cols.map((c) => ({
    key: c,
    label: c,
    align: numericCols.includes(c) ? 'right' : 'left',
    render: (r) => {
      const v = r[c];
      if (v == null) return <span className="text-muted">NULL</span>;
      if (typeof v === 'number') return Number.isInteger(v) ? f.num(v) : f.num(v, 2);
      return String(v);
    },
  }));

  const presetOptions = PRESETS.map((p) => ({ value: p.id, label: t(`sqlLab.presets.${p.id}.title`) }));
  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-line bg-surface p-4">
        <h1 className="text-lg font-semibold">{t('nav.sqlLab')}</h1>
        <p className="mt-1 text-sm text-ink-2">{t('sqlLab.intro')}</p>
      </header>
      <div className="grid gap-4 xl:grid-cols-[16rem_1fr]">
        {/* --- ukázkové dotazy a schéma --- */}
        <aside className="space-y-4">
          <nav className="rounded-xl border border-line bg-surface p-2" aria-label={t('sqlLab.examples')}>
            <h2 className="px-2 pt-1 pb-2 text-xs font-semibold tracking-wide text-muted uppercase">
              {t('sqlLab.examples')}
            </h2>
            <div className="xl:hidden">
              <Select
                label=""
                value={presetId}
                onChange={(v) => {
                  setPresetId(v);
                  setEdited(null);
                }}
                options={presetOptions}
              />
            </div>
            <ul className="hidden space-y-0.5 xl:block">
              {PRESETS.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => {
                      setPresetId(p.id);
                      setEdited(null);
                    }}
                    aria-current={p.id === presetId}
                    className={`w-full rounded-lg px-2 py-1.5 text-left text-sm ${p.id === presetId ? 'bg-accent-soft font-medium text-ink' : 'text-ink-2 hover:bg-surface-2'}`}
                  >
                    {t(`sqlLab.presets.${p.id}.title`)}
                    <span className="mt-0.5 flex flex-wrap gap-1">
                      {p.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-surface-2 px-1 text-[10px] font-medium text-muted"
                        >
                          {tag}
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <details className="rounded-xl border border-line bg-surface p-3 text-sm">
            <summary className="cursor-pointer text-xs font-semibold tracking-wide text-muted uppercase">
              {t('sqlLab.schema')}
            </summary>
            <ul className="mt-2 max-h-96 space-y-1 overflow-auto">
              {Object.entries(schema).map(([table, columnsOf]) => (
                <li key={table}>
                  <details>
                    <summary className="cursor-pointer font-mono text-xs">{table}</summary>
                    <ul className="ml-3 border-l border-line pl-2 font-mono text-[11px] text-ink-2">
                      {(schemaQ.data ?? [])
                        .filter((r) => r.table_name === table)
                        .map((r) => (
                          <li key={r.column_name}>
                            {r.column_name} <span className="text-muted">{r.data_type.toLowerCase()}</span>
                          </li>
                        ))}
                    </ul>
                    <span className="sr-only">{columnsOf.length}</span>
                  </details>
                </li>
              ))}
            </ul>
          </details>
        </aside>

        {/* --- editor a výsledek --- */}
        <div className="min-w-0 space-y-4">
          <section className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{t(`sqlLab.presets.${preset.id}.title`)}</h2>
                <p className="mt-0.5 text-xs text-muted">{t(`sqlLab.presets.${preset.id}.desc`)}</p>
              </div>
              <div className="flex items-center gap-2">
                {edited != null && (
                  <button
                    onClick={() => setEdited(null)}
                    className="rounded-md px-2 py-1.5 text-xs text-ink-2 hover:bg-surface-2"
                  >
                    {t('sqlLab.restore')}
                  </button>
                )}
                <button
                  onClick={() => void run(text)}
                  disabled={running}
                  className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 dark:text-black"
                >
                  <Icon name="db" className="size-4" />
                  {running ? t('common.loading') : t('sqlLab.run')}
                </button>
              </div>
            </div>
            <div className="h-80">
              <SqlEditor
                value={text}
                onChange={(v) => setEdited(v)}
                onRun={() => void run(edited ?? preset.sql(lang))}
                schema={schema}
                label={t('sqlLab.editor')}
              />
            </div>
            <p className="mt-2 text-xs text-muted">{t('sqlLab.hint')}</p>
          </section>

          <ChartCard
            title={t('sqlLab.result')}
            subtitle={
              result && !result.error
                ? t('sqlLab.stats', { rows: f.num(rows.length), ms: f.num(result.ms, 0) }) +
                  (rows.length > MAX_ROWS ? ` · ${t('sqlLab.truncated', { n: MAX_ROWS })}` : '')
                : undefined
            }
            sql={text}
            data={result?.error ? null : rows}
            loading={running && !result}
            error={result?.error ?? null}
            fileName={`sql-lab-${preset.id}`}
            height="auto"
            png={view === 'chart'}
            controls={
              rows.length > 0 && (
                <>
                  <Segmented
                    label={t('sqlLab.view')}
                    value={view}
                    onChange={setView}
                    options={[
                      { value: 'table', label: t('sqlLab.table') },
                      { value: 'chart', label: t('sqlLab.chart') },
                    ]}
                  />
                  {view === 'chart' && numericCols.length > 0 && (
                    <Select
                      label={t('sqlLab.yAxis')}
                      value={y ?? ''}
                      onChange={setYCol}
                      options={numericCols.filter((c) => c !== xCol).map((c) => ({ value: c, label: c }))}
                    />
                  )}
                </>
              )
            }
          >
            {(register) =>
              view === 'chart' ? (
                y ? (
                  <div className="h-80">
                    <EChart option={chartOption} onReady={register} />
                  </div>
                ) : (
                  <p className="p-4 text-sm text-muted">{t('sqlLab.noChart')}</p>
                )
              ) : (
                <DataTable<Row> rows={rows.slice(0, MAX_ROWS)} columns={columns} maxHeight={480} />
              )
            }
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
