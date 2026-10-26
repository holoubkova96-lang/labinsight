import { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { useTranslation } from 'react-i18next';
import { ChartCard } from '../../components/charts/ChartCard';
import { axisStyle, baseOption, useChartTheme } from '../../components/charts/chartTheme';
import { EChart } from '../../components/charts/EChart';
import { DataTable } from '../../components/ui/DataTable';
import { KpiCard } from '../../components/ui/KpiCard';
import { Segmented } from '../../components/ui/Segmented';
import { Select } from '../../components/ui/Select';
import { useQuery } from '../../db/useQuery';
import { buildWhere } from '../../db/where';
import { backtestMape, holtWinters } from '../../domain/forecast';
import { useLabels } from '../../hooks/usePageData';
import { useFormat } from '../../i18n/format';
import { useFilterValues } from '../../store/filters';

type MonthRow = { test_id: string; month_key: string; n: number };
type Horizon = '3' | '6';
type TableRow = { test_id: string; last6: number; next6: number; change: number; mape: number | null };

const ALL = '__ALL__';

function nextMonths(last: string, h: number): string[] {
  const [y, m] = last.split('-').map(Number);
  return Array.from({ length: h }, (_, i) => {
    const idx = y * 12 + (m - 1) + i + 1;
    return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
  });
}

export default function Forecast() {
  const { t } = useTranslation();
  const f = useFormat();
  const theme = useChartTheme();
  const labels = useLabels();
  const where = buildWhere(useFilterValues(), 'results', 'r').sql;
  const [series, setSeries] = useState(ALL);
  const [horizon, setHorizon] = useState<Horizon>('6');
  const h = Number(horizon);

  const sql = `-- Měsíční objem vydaných výsledků aktivních metod (vstup prognózy)
-- Monthly volume of reported results for active methods (forecast input)
SELECT r.test_id, r.month_key, count(*) AS n
FROM results_wide r
WHERE r.value IS NOT NULL AND r.method_status = 'ACTIVE' AND ${where}
GROUP BY ALL
ORDER BY r.month_key`;
  const q = useQuery<MonthRow>(sql);

  const { months, byTest } = useMemo(() => {
    const rows = q.data ?? [];
    const months = [...new Set(rows.map((r) => r.month_key))].sort();
    const byTest = new Map<string, number[]>();
    for (const r of rows) {
      if (!byTest.has(r.test_id)) byTest.set(r.test_id, new Array(months.length).fill(0));
      byTest.get(r.test_id)![months.indexOf(r.month_key)] = r.n;
    }
    return { months, byTest };
  }, [q.data]);

  // Řada pro graf: všechny metody dohromady, nebo jedna metoda (od jejího zavedení)
  const y = useMemo(() => {
    if (series === ALL) return months.map((_, i) => [...byTest.values()].reduce((s, v) => s + v[i], 0));
    const v = byTest.get(series) ?? [];
    const first = v.findIndex((x) => x > 0);
    return first < 0 ? [] : v.map((x, i) => (i < first ? NaN : x));
  }, [series, months, byTest]);
  const start = y.findIndex((v) => !Number.isNaN(v));
  const values = start < 0 ? [] : y.slice(start);
  const fc = values.length >= 3 ? holtWinters(values, h) : null;
  const mape = values.length >= 12 ? backtestMape(values, Math.min(6, h)) : null;
  const future = months.length ? nextMonths(months[months.length - 1], h) : [];
  const axis = [...months, ...future];
  const pad = (arr: (number | null)[]) => [...new Array(Math.max(start, 0)).fill(null), ...arr];

  const option: EChartsOption = {
    ...baseOption(theme),
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'axis',
      valueFormatter: (v) => (v == null ? '–' : f.num(Number(v))),
    },
    legend: {
      ...baseOption(theme).legend,
      data: [t('forecast.actual'), t('forecast.fitted'), t('forecast.forecast'), t('forecast.interval')],
    },
    xAxis: {
      type: 'category',
      data: axis,
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, formatter: (m: string) => f.month(m) },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, formatter: (v: number) => f.num(v) },
    },
    series: fc
      ? [
          {
            type: 'line',
            name: t('forecast.actual'),
            color: theme.series[0],
            symbolSize: 4,
            lineStyle: { width: 2 },
            data: [...pad(values), ...new Array(h).fill(null)],
          },
          {
            type: 'line',
            name: t('forecast.fitted'),
            color: theme.muted,
            showSymbol: false,
            lineStyle: { width: 1.5, type: 'dotted' },
            data: [...pad(fc.fitted), ...new Array(h).fill(null)],
          },
          // pásmo nejistoty = spodní hranice (průhledná) + šířka pásma nad ní
          {
            type: 'line',
            name: 'lower',
            stack: 'band',
            showSymbol: false,
            silent: true,
            lineStyle: { opacity: 0 },
            tooltip: { show: false },
            data: [...new Array(months.length - 1).fill(null), values.at(-1) ?? null, ...fc.lower],
          },
          {
            type: 'line',
            name: t('forecast.interval'),
            stack: 'band',
            showSymbol: false,
            silent: true,
            color: theme.series[1],
            lineStyle: { opacity: 0 },
            areaStyle: { color: theme.series[1], opacity: 0.18 },
            data: [...new Array(months.length - 1).fill(null), 0, ...fc.upper.map((u, i) => u - fc.lower[i])],
          },
          {
            type: 'line',
            name: t('forecast.forecast'),
            color: theme.series[1],
            symbolSize: 5,
            lineStyle: { width: 2, type: 'dashed' },
            data: [...new Array(months.length - 1).fill(null), values.at(-1) ?? null, ...fc.forecast],
          },
        ]
      : [],
  };

  // Tabulka: posledních 6 měsíců vs. prognóza na dalších 6 měsíců u každé metody
  const table: TableRow[] = useMemo(
    () =>
      [...byTest.entries()]
        .flatMap(([id, v]) => {
          const first = v.findIndex((x) => x > 0);
          const vals = v.slice(Math.max(first, 0));
          if (vals.length < 6) return [];
          const next6 = holtWinters(vals, 6).forecast.reduce((a, b) => a + b, 0);
          const last6 = vals.slice(-6).reduce((a, b) => a + b, 0);
          return [
            {
              test_id: id,
              last6,
              next6,
              change: last6 ? next6 / last6 - 1 : 0,
              mape: vals.length >= 12 ? backtestMape(vals) : null,
            },
          ];
        })
        .sort((a, b) => b.change - a.change),
    [byTest],
  );

  const nextSum = fc ? fc.forecast.reduce((a, b) => a + b, 0) : null;
  const lastSum = values.slice(-h).reduce((a, b) => a + b, 0);
  const loading = q.loading && !q.data;
  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t('pages.business.forecast')}</h1>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3">
        <Select
          label={t('forecast.series')}
          value={series}
          onChange={setSeries}
          options={[
            { value: ALL, label: t('forecast.all') },
            ...[...byTest.keys()]
              .sort((a, b) => labels.test(a).localeCompare(labels.test(b)))
              .map((id) => ({ value: id, label: labels.test(id) })),
          ]}
        />
        <Segmented
          label={t('forecast.horizon')}
          value={horizon}
          onChange={setHorizon}
          options={[
            { value: '3', label: t('forecast.months', { n: 3 }) },
            { value: '6', label: t('forecast.months', { n: 6 }) },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label={t('forecast.nextMonth')}
          value={fc ? f.num(fc.forecast[0]) : '–'}
          sub={fc ? `${f.num(fc.lower[0])} – ${f.num(fc.upper[0])} (95 %)` : undefined}
          loading={loading}
        />
        <KpiCard
          label={t('forecast.horizonTotal', { n: h })}
          value={f.num(nextSum)}
          sub={
            nextSum != null && lastSum
              ? t('forecast.vsLast', {
                  pct: `${nextSum >= lastSum ? '+' : ''}${f.pct(nextSum / lastSum - 1)}`,
                })
              : undefined
          }
          loading={loading}
        />
        <KpiCard
          label={t('forecast.model')}
          info={t('glossary.holtWinters')}
          value={fc ? (fc.params.seasonal ? 'Holt-Winters' : 'Holt') : '–'}
          sub={
            fc
              ? `α ${f.num(fc.params.alpha, 2)} · β ${f.num(fc.params.beta, 2)}${fc.params.seasonal ? ` · γ ${f.num(fc.params.gamma, 2)}` : ''}`
              : undefined
          }
          loading={loading}
        />
        <KpiCard
          label={t('forecast.mape')}
          info={t('glossary.mape')}
          value={mape == null ? '–' : f.pct(mape)}
          sub={t('forecast.mapeSub')}
          loading={loading}
        />
      </div>
      <ChartCard
        title={t('forecast.chart', { series: series === ALL ? t('forecast.all') : labels.test(series) })}
        subtitle={t('forecast.chartSub', { n: h })}
        info={t('glossary.holtWinters')}
        sql={sql}
        data={q.data}
        loading={q.loading}
        error={q.error}
        fileName={`forecast-${series}`}
        height={380}
      >
        {(register) => <EChart option={option} onReady={register} />}
      </ChartCard>
      <ChartCard
        title={t('forecast.table')}
        subtitle={t('forecast.tableSub')}
        sql={sql}
        data={q.data}
        loading={q.loading}
        error={q.error}
        fileName="forecast-by-method"
        height="auto"
        png={false}
      >
        {() => (
          <DataTable<TableRow>
            rows={table}
            maxHeight={420}
            isActive={(r) => r.test_id === series}
            onRowClick={(r) => setSeries(r.test_id)}
            columns={[
              { key: 'test_id', label: t('slicers.tests'), render: (r) => labels.test(r.test_id) },
              { key: 'last6', label: t('forecast.last6'), align: 'right', render: (r) => f.num(r.last6) },
              { key: 'next6', label: t('forecast.next6'), align: 'right', render: (r) => f.num(r.next6) },
              {
                key: 'change',
                label: t('forecast.change'),
                align: 'right',
                render: (r) => `${r.change >= 0 ? '▲' : '▼'} ${f.pct(Math.abs(r.change))}`,
              },
              {
                key: 'mape',
                label: 'MAPE',
                align: 'right',
                render: (r) => (r.mape == null ? '–' : f.pct(r.mape)),
              },
            ]}
          />
        )}
      </ChartCard>
    </div>
  );
}
