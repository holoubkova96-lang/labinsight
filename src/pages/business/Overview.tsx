import type { EChartsOption } from 'echarts';
import { useTranslation } from 'react-i18next';
import { ChartCard } from '../../components/charts/ChartCard';
import { axisStyle, baseOption, useChartTheme } from '../../components/charts/chartTheme';
import { EChart } from '../../components/charts/EChart';
import { KpiCard } from '../../components/ui/KpiCard';
import { useQuery } from '../../db/useQuery';
import { useLabels, useWhere } from '../../hooks/usePageData';
import { useFormat } from '../../i18n/format';
import { useFilters } from '../../store/filters';
import { change, costPerResultCte } from './shared';

type Month = {
  month_key: string;
  results: number;
  orders: number;
  points: number;
  revenue: number;
  cost: number;
};
type Group = { test_group: string; revenue: number; cost: number };

export default function BusinessOverview() {
  const { t } = useTranslation();
  const f = useFormat();
  const theme = useChartTheme();
  const labels = useLabels();
  const crossFilter = useFilters((s) => s.crossFilter);
  const { where } = useWhere('results');
  const { where: costWhere } = useWhere('costs');

  const base = `WITH ${costPerResultCte(costWhere)},
r AS (  -- vydané výsledky s výnosem / reported results with revenue
  SELECT month_key, test_id, test_group, order_id, points, payer_type, revenue_czk
  FROM results_wide
  WHERE value IS NOT NULL AND ${where}
)`;

  const monthSql = `${base}
SELECT r.month_key,
       count(*)                                              AS results,
       count(DISTINCT order_id)                              AS orders,
       sum(points) FILTER (WHERE payer_type = 'INSURANCE')   AS points,
       sum(revenue_czk)                                      AS revenue,
       sum(coalesce(cpr.cost_per_result, 0))                 AS cost
FROM r LEFT JOIN cpr USING (month_key, test_id)
GROUP BY r.month_key
ORDER BY r.month_key`;

  const groupSql = `${base}
SELECT test_group,
       sum(revenue_czk)                      AS revenue,
       sum(coalesce(cpr.cost_per_result, 0)) AS cost
FROM r LEFT JOIN cpr USING (month_key, test_id)
GROUP BY test_group
ORDER BY revenue DESC`;

  const months = useQuery<Month>(monthSql);
  const groups = useQuery<Group>(groupSql);
  const rows = months.data ?? [];

  const sum = (k: keyof Month) => rows.reduce((s, r) => s + (r[k] as number), 0);
  const total = rows.length
    ? {
        results: sum('results'),
        orders: sum('orders'),
        points: sum('points'),
        revenue: sum('revenue'),
        cost: sum('cost'),
      }
    : null;
  const margin = total ? total.revenue - total.cost : null;

  // Meziměsíční a meziroční změna posledního měsíce v období
  const last = rows.at(-1);
  const prev = rows.at(-2);
  const lastYear = last
    ? rows.find((r) => r.month_key === `${Number(last.month_key.slice(0, 4)) - 1}${last.month_key.slice(4)}`)
    : undefined;
  const delta = (k: keyof Month | 'margin' | 'perOrder') => {
    const val = (r?: Month) =>
      r == null
        ? undefined
        : k === 'margin'
          ? r.revenue - r.cost
          : k === 'perOrder'
            ? r.revenue / r.orders
            : (r[k] as number);
    const fmt = (c: number | null, label: string) =>
      c == null ? null : `${c >= 0 ? '▲' : '▼'} ${f.pct(Math.abs(c), 1)} ${label}`;
    return [
      fmt(change(val(last), val(prev)), t('bizOverview.mom')),
      fmt(change(val(last), val(lastYear)), t('bizOverview.yoy')),
    ]
      .filter(Boolean)
      .join(' · ');
  };

  const option: EChartsOption = {
    ...baseOption(theme),
    tooltip: { ...baseOption(theme).tooltip, trigger: 'axis', valueFormatter: (v) => f.czk(Number(v)) },
    xAxis: {
      type: 'category',
      data: rows.map((r) => r.month_key),
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, formatter: (m: string) => f.month(m) },
      splitLine: { show: false },
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
        type: 'bar',
        name: t('bizOverview.revenue'),
        color: theme.series[0],
        barMaxWidth: 14,
        itemStyle: { borderRadius: [3, 3, 0, 0] },
        data: rows.map((r) => r.revenue),
      },
      {
        type: 'bar',
        name: t('bizOverview.cost'),
        color: theme.series[1],
        barMaxWidth: 14,
        itemStyle: { borderRadius: [3, 3, 0, 0] },
        data: rows.map((r) => r.cost),
      },
      {
        type: 'line',
        name: t('bizOverview.margin'),
        color: theme.series[2],
        symbolSize: 5,
        lineStyle: { width: 2 },
        data: rows.map((r) => r.revenue - r.cost),
        markLine: {
          symbol: 'none',
          silent: true,
          lineStyle: { color: theme.muted },
          label: { show: false },
          data: [{ yAxis: 0 }],
        },
      },
    ],
  };

  const g = groups.data ?? [];
  const groupName = (id: string) => labels.options.groups.find((o) => o.value === id)?.label ?? id;
  const groupOption: EChartsOption = {
    ...baseOption(theme),
    grid: { left: 8, right: 24, top: 36, bottom: 8, containLabel: true },
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v) => f.czk(Number(v)),
    },
    yAxis: {
      type: 'category',
      data: g.map((r) => groupName(r.test_group)),
      inverse: true,
      ...axisStyle(theme),
    },
    xAxis: {
      type: 'value',
      ...axisStyle(theme),
      axisLabel: {
        ...axisStyle(theme).axisLabel,
        formatter: (v: number) => `${f.num(v / 1e6, 1)} ${t('units.mCzk')}`,
      },
    },
    series: [
      { key: 'revenue', name: t('bizOverview.revenue'), color: theme.series[0] },
      { key: 'cost', name: t('bizOverview.cost'), color: theme.series[1] },
      { key: 'margin', name: t('bizOverview.margin'), color: theme.series[2] },
    ].map((s) => ({
      type: 'bar' as const,
      name: s.name,
      color: s.color,
      barMaxWidth: 12,
      itemStyle: { borderRadius: [0, 3, 3, 0] },
      data: g.map((r) => (s.key === 'margin' ? r.revenue - r.cost : r[s.key as 'revenue' | 'cost'])),
    })),
  };

  const loading = months.loading && !rows.length;
  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t('pages.business.overview')}</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label={t('bizOverview.procedures')}
          info={t('glossary.procedures')}
          value={f.num(total?.results)}
          sub={delta('results')}
          loading={loading}
        />
        <KpiCard
          label={t('bizOverview.points')}
          info={t('glossary.pointValue')}
          value={f.num(total?.points)}
          sub={delta('points')}
          loading={loading}
        />
        <KpiCard
          label={t('bizOverview.revenue')}
          value={f.czk(total?.revenue)}
          sub={delta('revenue')}
          loading={loading}
        />
        <KpiCard
          label={t('bizOverview.cost')}
          info={t('glossary.absorption')}
          value={f.czk(total?.cost)}
          sub={delta('cost')}
          loading={loading}
        />
        <KpiCard
          label={t('bizOverview.margin')}
          value={f.czk(margin)}
          sub={total ? `${f.pct(margin! / total.revenue)} · ${delta('margin')}` : undefined}
          loading={loading}
        />
        <KpiCard
          label={t('bizOverview.perOrder')}
          value={f.czk(total ? total.revenue / total.orders : null)}
          sub={delta('perOrder')}
          loading={loading}
        />
      </div>
      <p className="text-xs text-muted">
        {t('bizOverview.deltaNote', { month: last ? f.month(last.month_key) : '–' })}
      </p>
      <ChartCard
        title={t('bizOverview.trend')}
        subtitle={t('bizOverview.trendSub')}
        sql={monthSql}
        data={months.data}
        loading={months.loading}
        error={months.error}
        fileName="revenue-cost-margin-by-month"
        height={340}
      >
        {(register) => <EChart option={option} onReady={register} />}
      </ChartCard>
      <ChartCard
        title={t('bizOverview.byGroup')}
        subtitle={t('common.crossFilterHint')}
        sql={groupSql}
        data={groups.data}
        loading={groups.loading}
        error={groups.error}
        fileName="revenue-cost-by-group"
        height={300}
      >
        {(register) => (
          <EChart
            option={groupOption}
            onReady={register}
            onItemClick={(p) => {
              const r = g[p.dataIndex];
              if (r) crossFilter('groups', r.test_group);
            }}
          />
        )}
      </ChartCard>
    </div>
  );
}
