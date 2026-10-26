import { useState } from 'react';
import type { EChartsOption } from 'echarts';
import { useTranslation } from 'react-i18next';
import { ChartCard } from '../../components/charts/ChartCard';
import { axisStyle, baseOption, useChartTheme } from '../../components/charts/chartTheme';
import { EChart } from '../../components/charts/EChart';
import { Segmented } from '../../components/ui/Segmented';
import { Select } from '../../components/ui/Select';
import { useQuery } from '../../db/useQuery';
import { monthlyOn } from '../../domain/costModel';
import { useLabels, useWhere } from '../../hooks/usePageData';
import { useFormat } from '../../i18n/format';
import { useFilters } from '../../store/filters';
import { costPerResultCte } from './shared';
import { useMethodParams } from './useMethodParams';

type Method = {
  test_id: string;
  method_status: string;
  freq: number;
  rev_per: number;
  cost_per: number;
  margin_per: number;
  revenue: number;
  margin: number;
  expiry_share: number | null;
  fixed_share: number | null;
};
type Quadrant = 'stars' | 'volume' | 'niche' | 'cut';
type ParetoMode = 'revenue' | 'loss';

const Y_FLOOR = -600; // dolní mez osy Y; ztrátovější metody se zobrazí na okraji se šipkou

export default function Frequency() {
  const { t } = useTranslation();
  const f = useFormat();
  const theme = useChartTheme();
  const labels = useLabels();
  const crossFilter = useFilters((s) => s.crossFilter);
  const { where } = useWhere('results');
  const { where: costWhere } = useWhere('costs');
  const methods = useMethodParams();
  const [picked, setPicked] = useState<string | null>(null);
  const [pareto, setPareto] = useState<ParetoMode>('revenue');

  const sql = `-- Frekvence vs. náklad: ekonomika každé metody za zvolené období
-- Volume vs. cost: the economics of each method in the selected period
WITH ${costPerResultCte(costWhere)},
r AS (
  SELECT test_id, month_key, count(*) AS n, sum(revenue_czk) AS revenue
  FROM results_wide
  WHERE value IS NOT NULL AND test_id <> 'EGFR' AND ${where}
  GROUP BY test_id, month_key
),
m AS (
  SELECT r.test_id,
         sum(r.n) / count(DISTINCT r.month_key)          AS freq,       -- výsledků měsíčně
         sum(r.revenue)                                  AS revenue,
         sum(r.n * cpr.cost_per_result)                  AS cost,
         sum(r.n)                                        AS n
  FROM r JOIN cpr USING (month_key, test_id)
  GROUP BY r.test_id
),
s AS (  -- struktura nákladů metody / cost structure of the method
  SELECT test_id,
         sum(expiry_czk) / nullif(sum(total_cost_czk), 0) AS expiry_share,
         sum(qc_czk + calibration_czk + ehk_czk + lease_service_czk + validation_czk)
           / nullif(sum(total_cost_czk), 0)               AS fixed_share
  FROM costs_wide WHERE ${costWhere} GROUP BY test_id
)
SELECT m.test_id, t.method_status, m.freq,
       m.revenue / m.n                AS rev_per,
       m.cost / m.n                   AS cost_per,
       (m.revenue - m.cost) / m.n     AS margin_per,
       m.revenue,
       m.revenue - m.cost             AS margin,
       s.expiry_share, s.fixed_share
FROM m JOIN dim_tests t USING (test_id) LEFT JOIN s USING (test_id)
ORDER BY margin`;

  const q = useQuery<Method>(sql);
  const rows = q.data ?? [];
  const freqs = rows.map((r) => r.freq).sort((a, b) => a - b);
  const medianFreq = freqs.length ? freqs[Math.floor(freqs.length / 2)] : 100;
  const quadrant = (r: Method): Quadrant =>
    r.freq >= medianFreq ? (r.margin_per >= 0 ? 'stars' : 'volume') : r.margin_per >= 0 ? 'niche' : 'cut';
  const selected = picked && rows.some((r) => r.test_id === picked) ? picked : (rows[0]?.test_id ?? null);
  const sel = rows.find((r) => r.test_id === selected);

  // --- bublinový graf ---
  const maxRev = Math.max(1, ...rows.map((r) => r.revenue));
  const profitColor = theme.series[0];
  const lossColor = theme.series[7];
  const bubbleOption: EChartsOption = {
    ...baseOption(theme),
    grid: { left: 8, right: 24, top: 40, bottom: 32, containLabel: true },
    legend: { ...baseOption(theme).legend, data: [t('frequency.profit'), t('frequency.loss')] },
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'item',
      formatter: (p: unknown) => {
        const r = rows.find((x) => x.test_id === (p as { data: { id: string } }).data?.id);
        if (!r) return '';
        return `<b>${labels.test(r.test_id)}</b>${r.method_status === 'CANCELLED' ? ` (${t('values.status.CANCELLED')})` : ''}<br/>
${t('frequency.freq')}: ${f.num(r.freq)} / ${t('frequency.month')}<br/>
${t('frequency.revPer')}: ${f.czk(r.rev_per, 1)} · ${t('frequency.costPer')}: ${f.czk(r.cost_per, 1)}<br/>
${t('frequency.marginPer')}: <b>${f.czk(r.margin_per, 1)}</b><br/>
${t('frequency.totalRevenue')}: ${f.czk(r.revenue)} · ${t('frequency.totalMargin')}: ${f.czk(r.margin)}<br/>
<i>${t(`frequency.quadrant.${quadrant(r)}`)}</i>`;
      },
    },
    // popisky kvadrantů v rozích grafu
    graphic: (
      [
        ['niche', { left: 96, top: 44 }],
        ['stars', { right: 32, top: 44 }],
        ['cut', { left: 96, bottom: 96 }],
        ['volume', { right: 32, bottom: 96 }],
      ] as const
    ).map(([q, pos]) => ({
      type: 'text' as const,
      ...pos,
      silent: true,
      style: { text: t(`frequency.quadrant.${q}`), fill: theme.muted, fontSize: 11, fontWeight: 600 },
    })),
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
      min: (e: { min: number }) => Math.max(Y_FLOOR, Math.floor(e.min / 50) * 50),
      ...axisStyle(theme),
      name: t('frequency.yAxis'),
      nameLocation: 'middle',
      nameGap: 64,
      axisLabel: { ...axisStyle(theme).axisLabel, formatter: (v: number) => f.czk(v) },
    },
    series: [
      { name: t('frequency.profit'), color: profitColor, pick: (r: Method) => r.margin_per >= 0 },
      { name: t('frequency.loss'), color: lossColor, pick: (r: Method) => r.margin_per < 0 },
    ].map((s, i) => ({
      type: 'scatter' as const,
      name: s.name,
      color: s.color,
      itemStyle: { opacity: 0.8, borderColor: theme.surface, borderWidth: 1 },
      data: rows.filter(s.pick).map((r) => {
        const clipped = r.margin_per < Y_FLOOR;
        return {
          id: r.test_id,
          value: [r.freq, Math.max(r.margin_per, Y_FLOOR)],
          symbol: clipped ? 'triangle' : 'circle',
          symbolRotate: clipped ? 180 : 0,
          symbolSize: 8 + 42 * Math.sqrt(r.revenue / maxRev),
          itemStyle: r.test_id === selected ? { borderColor: theme.text, borderWidth: 2 } : undefined,
          label: {
            show:
              clipped ||
              r.revenue / maxRev > 0.15 ||
              r.test_id === selected ||
              r.method_status === 'CANCELLED',
            position: clipped ? ('top' as const) : ('right' as const),
            fontSize: 10,
            color: theme.text2,
            formatter: clipped ? `${r.test_id} ↓` : r.test_id,
          },
        };
      }),
      markLine:
        i === 0
          ? {
              symbol: 'none',
              silent: true,
              lineStyle: { color: theme.muted, type: 'dashed' as const },
              label: { color: theme.muted, fontSize: 10 },
              data: [
                { yAxis: 0, label: { formatter: '0 Kč' } },
                { xAxis: medianFreq, label: { formatter: t('frequency.median') } },
              ],
            }
          : undefined,
    })),
  };

  // --- křivka nákladu na výsledek podle frekvence (model) ---
  const info = selected ? methods.map.get(selected) : undefined;
  const grid = Array.from({ length: 80 }, (_, i) => Math.round(10 ** (0.3 + (i / 79) * 3.3)));
  const curve = info ? grid.map((fr) => [fr, monthlyOn(info.params, fr, info.analyzers).costPerResult]) : [];
  const breakEvenFreq =
    info && sel
      ? grid.find((fr) => monthlyOn(info.params, fr, info.analyzers).costPerResult <= sel.rev_per)
      : undefined;
  const curveOption: EChartsOption = {
    ...baseOption(theme),
    grid: { left: 8, right: 24, top: 40, bottom: 32, containLabel: true },
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'axis',
      formatter: (p: unknown) => {
        const [first] = p as { data: number[] }[];
        return `${f.num(first.data[0])} / ${t('frequency.month')}<br/>${t('frequency.costPer')}: <b>${f.czk(first.data[1], 1)}</b>`;
      },
    },
    xAxis: {
      type: 'log',
      ...axisStyle(theme),
      name: t('frequency.xAxis'),
      nameLocation: 'middle',
      nameGap: 26,
      axisLabel: { ...axisStyle(theme).axisLabel, formatter: (v: number) => f.num(v) },
    },
    yAxis: {
      type: 'log',
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, formatter: (v: number) => f.czk(v) },
    },
    series: [
      {
        type: 'line',
        name: t('frequency.costCurve'),
        color: theme.series[1],
        showSymbol: false,
        lineStyle: { width: 2 },
        data: curve,
        markLine: sel
          ? {
              symbol: 'none',
              silent: true,
              data: [
                {
                  yAxis: sel.rev_per,
                  name: t('frequency.revPer'),
                  lineStyle: { color: theme.series[0], type: 'solid', width: 2 },
                  label: {
                    formatter: `${t('frequency.revPer')} ${f.czk(sel.rev_per)}`,
                    color: theme.text2,
                    position: 'insideEndTop',
                  },
                },
                ...(breakEvenFreq
                  ? [
                      {
                        xAxis: breakEvenFreq,
                        lineStyle: { color: theme.text2, type: 'dashed' as const },
                        label: {
                          formatter: `${t('frequency.breakEven')} ${f.num(breakEvenFreq)}`,
                          color: theme.text2,
                        },
                      },
                    ]
                  : []),
              ],
            }
          : undefined,
      },
      {
        type: 'scatter',
        name: t('frequency.actual'),
        color: theme.text,
        symbolSize: 10,
        symbol: 'diamond',
        data: sel ? [[sel.freq, sel.cost_per]] : [],
        label: {
          show: true,
          position: 'right',
          color: theme.text,
          fontSize: 11,
          formatter: t('frequency.actual'),
        },
      },
    ],
  };

  // --- Pareto výnosů / ztrát ---
  const paretoRows =
    pareto === 'revenue'
      ? [...rows].sort((a, b) => b.revenue - a.revenue).map((r) => ({ id: r.test_id, v: r.revenue }))
      : rows
          .filter((r) => r.margin < 0)
          .sort((a, b) => a.margin - b.margin)
          .map((r) => ({ id: r.test_id, v: -r.margin }));
  const paretoTotal = paretoRows.reduce((s, r) => s + r.v, 0) || 1;
  const cumulative = paretoRows.reduce<number[]>(
    (acc, r) => [...acc, (acc.at(-1) ?? 0) + r.v / paretoTotal],
    [],
  );
  const top80 = cumulative.findIndex((c) => c >= 0.8) + 1;
  const paretoOption: EChartsOption = {
    ...baseOption(theme),
    grid: { left: 8, right: 24, top: 40, bottom: 8, containLabel: true },
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (p: unknown) => {
        const i = (p as { dataIndex: number }[])[0].dataIndex;
        const r = paretoRows[i];
        return `<b>${labels.test(r.id)}</b><br/>${f.czk(r.v)} (${f.pct(r.v / paretoTotal)})<br/>${t('frequency.cumulative')}: ${f.pct(cumulative[i])}`;
      },
    },
    xAxis: {
      type: 'category',
      data: paretoRows.map((r) => r.id),
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, rotate: 60, interval: 0, fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      max: 1,
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, formatter: (v: number) => f.pct(v, 0) },
    },
    series: [
      {
        type: 'bar',
        name: t(pareto === 'revenue' ? 'frequency.shareRevenue' : 'frequency.shareLoss'),
        color: pareto === 'revenue' ? profitColor : lossColor,
        barCategoryGap: '20%',
        itemStyle: { borderRadius: [3, 3, 0, 0] },
        data: paretoRows.map((r) => r.v / paretoTotal),
      },
      {
        type: 'line',
        name: t('frequency.cumulative'),
        color: theme.text2,
        symbolSize: 4,
        data: cumulative,
        markLine: {
          symbol: 'none',
          silent: true,
          lineStyle: { color: theme.muted, type: 'dashed' },
          label: { formatter: '80 %', color: theme.muted },
          data: [{ yAxis: 0.8 }],
        },
      },
    ],
  };

  const quadCounts = rows.reduce<Record<Quadrant, number>>(
    (acc, r) => ({ ...acc, [quadrant(r)]: acc[quadrant(r)] + 1 }),
    { stars: 0, volume: 0, niche: 0, cut: 0 },
  );

  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t('pages.business.frequency')}</h1>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {(['stars', 'volume', 'niche', 'cut'] as Quadrant[]).map((qd) => (
          <div key={qd} className="rounded-xl border border-line bg-surface p-4">
            <div className="text-xs font-medium text-ink-2">{t(`frequency.quadrant.${qd}`)}</div>
            <div className="tabular mt-1 text-2xl font-semibold">{f.num(quadCounts[qd])}</div>
            <div className="mt-1 text-xs text-muted">{t(`frequency.quadrantDesc.${qd}`)}</div>
          </div>
        ))}
      </div>
      <ChartCard
        title={t('frequency.bubble')}
        subtitle={t('frequency.bubbleSub')}
        info={t('glossary.costPerReportable')}
        sql={sql}
        data={q.data}
        loading={q.loading}
        error={q.error}
        fileName="volume-vs-margin"
        height={460}
        note={
          rows.some((r) => r.margin_per < Y_FLOOR)
            ? t('frequency.clippedNote', {
                list: rows
                  .filter((r) => r.margin_per < Y_FLOOR)
                  .map((r) => `${r.test_id} ${f.czk(r.margin_per)}`)
                  .join(', '),
              })
            : undefined
        }
      >
        {(register) => (
          <EChart
            option={bubbleOption}
            onReady={register}
            onItemClick={(p) => {
              const id = (p.data as { id?: string })?.id;
              if (id) setPicked(id);
            }}
          />
        )}
      </ChartCard>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title={t('frequency.curve', { test: selected ? labels.test(selected) : '' })}
          subtitle={t('frequency.curveSub')}
          info={t('glossary.breakEven')}
          sql={sql}
          data={q.data}
          loading={q.loading || methods.loading}
          error={q.error}
          fileName={`cost-curve-${selected}`}
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
          {(register) => <EChart option={curveOption} onReady={register} />}
        </ChartCard>
        <ChartCard
          title={t('frequency.pareto')}
          subtitle={
            pareto === 'revenue'
              ? t('frequency.paretoRevenueSub', { n: top80, total: paretoRows.length })
              : t('frequency.paretoLossSub', { n: top80, total: paretoRows.length })
          }
          info={t('glossary.pareto')}
          sql={sql}
          data={q.data}
          loading={q.loading}
          error={q.error}
          fileName={`pareto-${pareto}`}
          height={360}
          controls={
            <Segmented
              label={t('frequency.pareto')}
              value={pareto}
              onChange={setPareto}
              options={[
                { value: 'revenue', label: t('frequency.paretoRevenue') },
                { value: 'loss', label: t('frequency.paretoLoss') },
              ]}
            />
          }
        >
          {(register) => (
            <EChart
              option={paretoOption}
              onReady={register}
              onItemClick={(p) => {
                const r = paretoRows[p.dataIndex];
                if (r) crossFilter('tests', r.id);
              }}
            />
          )}
        </ChartCard>
      </div>
      {sel && (
        <p className="text-xs text-muted">
          {t('frequency.selectedNote', {
            test: labels.test(sel.test_id),
            expiry: f.pct(sel.expiry_share ?? 0, 0),
            fixed: f.pct(sel.fixed_share ?? 0, 0),
          })}
        </p>
      )}
    </div>
  );
}
