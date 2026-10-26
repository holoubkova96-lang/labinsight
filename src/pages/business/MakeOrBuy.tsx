import { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { useTranslation } from 'react-i18next';
import { ChartCard } from '../../components/charts/ChartCard';
import { axisStyle, baseOption, useChartTheme } from '../../components/charts/chartTheme';
import { EChart } from '../../components/charts/EChart';
import { DataTable } from '../../components/ui/DataTable';
import { KpiCard } from '../../components/ui/KpiCard';
import { Select } from '../../components/ui/Select';
import { makeOrBuy, makeOrBuyCrossover } from '../../domain/costModel';
import { useLabels } from '../../hooks/usePageData';
import { useFormat } from '../../i18n/format';
import { PARAMS_SQL, useMethodParams } from './useMethodParams';
import { useMethodVolumes } from './useMethodVolumes';

type Row = {
  test_id: string;
  status: string;
  freq: number;
  make: number;
  buy: number;
  advantage: number;
  decision: string;
  crossover: number | null;
  tat: number;
  handling: number;
};

export default function MakeOrBuy() {
  const { t } = useTranslation();
  const f = useFormat();
  const theme = useChartTheme();
  const labels = useLabels();
  const methods = useMethodParams();
  const volumes = useMethodVolumes();
  const [picked, setPicked] = useState<string | null>(null);

  // Rozhodnutí pro každou metodu při její skutečné frekvenci
  const rows: Row[] = useMemo(
    () =>
      (volumes.data ?? [])
        .flatMap((v) => {
          const m = methods.map.get(v.test_id);
          if (!m) return [];
          const r = makeOrBuy(m.params, v.freq, v.outsource_handling_czk, m.analyzers);
          return [
            {
              test_id: v.test_id,
              status: v.method_status,
              freq: v.freq,
              make: r.make,
              buy: r.buy,
              advantage: r.advantage,
              decision: r.decision,
              crossover: makeOrBuyCrossover(m.params, v.outsource_handling_czk, m.analyzers, 5000),
              tat: v.outsource_tat_hours,
              handling: v.outsource_handling_czk,
            },
          ];
        })
        .sort((a, b) => a.advantage - b.advantage),
    [volumes.data, methods.map],
  );

  const selected = picked && rows.some((r) => r.test_id === picked) ? picked : (rows[0]?.test_id ?? null);
  const sel = rows.find((r) => r.test_id === selected);
  const info = selected ? methods.map.get(selected) : undefined;
  // úsporu počítáme jen u metod, které laboratoř stále provádí
  const buyRows = rows.filter((r) => r.decision === 'buy' && r.status === 'ACTIVE');
  const saving = buyRows.reduce((s, r) => s - r.advantage, 0);

  // --- měsíční výsledek obou variant podle frekvence ---
  const grid = Array.from({ length: 80 }, (_, i) => Math.max(1, Math.round(10 ** ((i / 79) * 3.2))));
  const curves =
    info && sel ? grid.map((x) => ({ x, ...makeOrBuy(info.params, x, sel.handling, info.analyzers) })) : [];
  const option: EChartsOption = {
    ...baseOption(theme),
    grid: { left: 8, right: 24, top: 40, bottom: 32, containLabel: true },
    tooltip: { ...baseOption(theme).tooltip, trigger: 'axis', valueFormatter: (v) => f.czk(Number(v)) },
    xAxis: {
      type: 'log',
      ...axisStyle(theme),
      name: t('frequency.xAxis'),
      nameLocation: 'middle',
      nameGap: 26,
      axisLabel: { ...axisStyle(theme).axisLabel, formatter: (v: number) => f.num(v) },
    },
    yAxis: {
      type: 'value',
      ...axisStyle(theme),
      axisLabel: {
        ...axisStyle(theme).axisLabel,
        formatter: (v: number) => `${f.num(v / 1000)} ${t('units.kCzk')}`,
      },
    },
    series: [
      {
        type: 'line',
        name: t('makebuy.make'),
        color: theme.series[0],
        showSymbol: false,
        lineStyle: { width: 2 },
        data: curves.map((c) => [c.x, c.make]),
        markLine: sel
          ? {
              symbol: 'none',
              silent: true,
              label: { color: theme.text2, fontSize: 11 },
              data: [
                {
                  xAxis: sel.freq,
                  lineStyle: { color: theme.text, type: 'solid' },
                  label: { formatter: t('frequency.actual'), position: 'insideStartTop' },
                },
                ...(sel.crossover
                  ? [
                      {
                        xAxis: sel.crossover,
                        lineStyle: { color: theme.muted, type: 'dashed' as const },
                        label: { formatter: `${t('makebuy.crossover')} ${f.num(sel.crossover)}` },
                      },
                    ]
                  : []),
              ],
            }
          : undefined,
      },
      {
        type: 'line',
        name: t('makebuy.buy'),
        color: theme.series[1],
        showSymbol: false,
        lineStyle: { width: 2, type: 'dashed' },
        data: curves.map((c) => [c.x, c.buy]),
      },
    ],
  };

  const decisionLabel = (d: string) => (d === 'buy' ? t('makebuy.decisionBuy') : t('makebuy.decisionMake'));
  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t('pages.business.makebuy')}</h1>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label={t('makebuy.kpiMethods')}
          value={f.num(rows.length)}
          loading={volumes.loading && !rows.length}
        />
        <KpiCard
          label={t('makebuy.kpiBuy')}
          info={t('glossary.makeOrBuy')}
          value={f.num(buyRows.length)}
          sub={buyRows.map((r) => r.test_id).join(', ')}
          loading={volumes.loading && !rows.length}
        />
        <KpiCard
          label={t('makebuy.kpiSaving')}
          value={f.czk(saving)}
          sub={t('breakeven.yearly', { v: f.czk(saving * 12) })}
          loading={volumes.loading && !rows.length}
        />
        <KpiCard
          label={t('makebuy.kpiSelected')}
          value={sel ? decisionLabel(sel.decision) : '–'}
          sub={sel ? t('makebuy.advantage', { v: f.czk(Math.abs(sel.advantage)) }) : undefined}
          loading={volumes.loading && !rows.length}
        />
      </div>
      <ChartCard
        title={t('makebuy.chart', { test: selected ? labels.test(selected) : '' })}
        subtitle={t('makebuy.chartSub', {
          handling: f.czk(sel?.handling ?? 0),
          tat: f.num(sel?.tat ?? 0),
        })}
        info={t('glossary.makeOrBuy')}
        sql={`${volumes.sql};\n\n${PARAMS_SQL}`}
        data={volumes.data}
        loading={volumes.loading || methods.loading}
        error={volumes.error}
        fileName={`make-or-buy-${selected}`}
        height={360}
        controls={
          <Select
            label={t('results.test')}
            value={selected ?? ''}
            onChange={setPicked}
            options={[...rows]
              .sort((a, b) => labels.test(a.test_id).localeCompare(labels.test(b.test_id)))
              .map((r) => ({ value: r.test_id, label: labels.test(r.test_id) }))}
          />
        }
      >
        {(register) => <EChart option={option} onReady={register} />}
      </ChartCard>
      <ChartCard
        title={t('makebuy.table')}
        subtitle={t('makebuy.tableSub')}
        sql={`${volumes.sql};\n\n${PARAMS_SQL}`}
        data={rows as never}
        loading={volumes.loading}
        error={volumes.error}
        fileName="make-or-buy-all-methods"
        height="auto"
        png={false}
      >
        {() => (
          <DataTable<Row>
            rows={rows}
            maxHeight={460}
            isActive={(r) => r.test_id === selected}
            onRowClick={(r) => setPicked(r.test_id)}
            columns={[
              { key: 'test_id', label: t('slicers.tests'), render: (r) => labels.test(r.test_id) },
              { key: 'freq', label: t('frequency.freq'), align: 'right', render: (r) => f.num(r.freq) },
              { key: 'make', label: t('makebuy.make'), align: 'right', render: (r) => f.czk(r.make) },
              { key: 'buy', label: t('makebuy.buy'), align: 'right', render: (r) => f.czk(r.buy) },
              {
                key: 'crossover',
                label: t('makebuy.crossover'),
                align: 'right',
                render: (r) => (r.crossover == null ? '∞' : f.num(r.crossover)),
              },
              { key: 'tat', label: t('makebuy.tat'), align: 'right', render: (r) => `${f.num(r.tat)} h` },
              {
                key: 'decision',
                label: t('makebuy.decision'),
                render: (r) => (
                  <span className={r.decision === 'buy' ? 'font-semibold text-critical' : ''}>
                    {r.decision === 'buy' ? '↗ ' : '✓ '}
                    {decisionLabel(r.decision)}
                  </span>
                ),
              },
            ]}
          />
        )}
      </ChartCard>
    </div>
  );
}
