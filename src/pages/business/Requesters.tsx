import type { EChartsOption } from 'echarts';
import { useTranslation } from 'react-i18next';
import { ChartCard } from '../../components/charts/ChartCard';
import { axisStyle, baseOption, useChartTheme } from '../../components/charts/chartTheme';
import { EChart } from '../../components/charts/EChart';
import { DataTable } from '../../components/ui/DataTable';
import { KpiCard } from '../../components/ui/KpiCard';
import { useQuery } from '../../db/useQuery';
import { useLabels, useWhere } from '../../hooks/usePageData';
import { useFormat } from '../../i18n/format';
import { useFilters } from '../../store/filters';
import { costPerResultCte } from './shared';

type Req = {
  dept_id: string;
  kind: string;
  orders: number;
  results: number;
  revenue: number;
  cost: number;
  margin: number;
  rev_per_order: number;
};
type Monthly = { month_key: string; kind: string; revenue: number };

const TOP = 15;

export default function Requesters() {
  const { t } = useTranslation();
  const f = useFormat();
  const theme = useChartTheme();
  const labels = useLabels();
  const crossFilter = useFilters((s) => s.crossFilter);
  const { where } = useWhere('results');
  const { where: costWhere } = useWhere('costs');

  const reqSql = `-- Žadatelé: objem, výnos, absorbovaný náklad a marže
-- Requesters: volume, revenue, absorbed cost and margin
WITH ${costPerResultCte(costWhere)},
r AS (
  SELECT dept_id, dept_kind, month_key, test_id, order_id, revenue_czk
  FROM results_wide
  WHERE value IS NOT NULL AND ${where}
)
SELECT dept_id, any_value(dept_kind)             AS kind,
       count(DISTINCT order_id)                  AS orders,
       count(*)                                  AS results,
       sum(revenue_czk)                          AS revenue,
       sum(coalesce(cpr.cost_per_result, 0))     AS cost,
       sum(revenue_czk) - sum(coalesce(cpr.cost_per_result, 0)) AS margin,
       sum(revenue_czk) / count(DISTINCT order_id) AS rev_per_order
FROM r LEFT JOIN cpr USING (month_key, test_id)
GROUP BY dept_id
ORDER BY revenue DESC`;

  const monthSql = `SELECT month_key, dept_kind AS kind, sum(revenue_czk) AS revenue
FROM results_wide
WHERE value IS NOT NULL AND ${where}
GROUP BY ALL
ORDER BY month_key`;

  const req = useQuery<Req>(reqSql);
  const monthly = useQuery<Monthly>(monthSql);
  const rows = req.data ?? [];
  const total = rows.reduce((s, r) => s + r.revenue, 0) || 1;
  const byKind = (k: string) => rows.filter((r) => r.kind === k);
  const sumOf = (list: Req[], key: keyof Req) => list.reduce((s, r) => s + (r[key] as number), 0);
  const internal = byKind('INTERNAL');
  const external = byKind('EXTERNAL');

  const top = rows.slice(0, TOP);
  const topOption: EChartsOption = {
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
      data: top.map((r) => labels.dept(r.dept_id)),
      inverse: true,
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, width: 170, overflow: 'truncate' },
    },
    xAxis: {
      type: 'value',
      ...axisStyle(theme),
      axisLabel: {
        ...axisStyle(theme).axisLabel,
        hideOverlap: true,
        formatter: (v: number) => `${f.num(v / 1e6, 1)} ${t('units.mCzk')}`,
      },
    },
    series: [
      { key: 'revenue' as const, name: t('bizOverview.revenue'), color: theme.series[0] },
      { key: 'margin' as const, name: t('bizOverview.margin'), color: theme.series[2] },
    ].map((s) => ({
      type: 'bar' as const,
      name: s.name,
      color: s.color,
      barMaxWidth: 10,
      itemStyle: { borderRadius: [0, 3, 3, 0] },
      data: top.map((r) => r[s.key]),
    })),
  };

  const months = [...new Set((monthly.data ?? []).map((r) => r.month_key))];
  const kindOption: EChartsOption = {
    ...baseOption(theme),
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v) => f.czk(Number(v)),
    },
    xAxis: {
      type: 'category',
      data: months,
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
    series: (['INTERNAL', 'EXTERNAL'] as const).map((k, i) => ({
      type: 'bar' as const,
      name: t(k === 'INTERNAL' ? 'ordering.internal' : 'ordering.external'),
      stack: 'kind',
      color: theme.series[i === 0 ? 0 : 3],
      barMaxWidth: 22,
      itemStyle: { borderColor: theme.surface, borderWidth: 1, borderRadius: i === 1 ? [3, 3, 0, 0] : 0 },
      data: months.map((m) => monthly.data?.find((r) => r.month_key === m && r.kind === k)?.revenue ?? 0),
    })),
  };

  const loading = req.loading && !rows.length;
  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t('pages.business.requesters')}</h1>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label={t('requesters.kpiActive')}
          value={f.num(rows.length)}
          sub={t('requesters.kpiSplit', { internal: internal.length, external: external.length })}
          loading={loading}
        />
        <KpiCard
          label={t('requesters.kpiExternalShare')}
          value={f.pct(sumOf(external, 'revenue') / total)}
          sub={t('requesters.ofOrders', {
            pct: f.pct(sumOf(external, 'orders') / (sumOf(rows, 'orders') || 1)),
          })}
          loading={loading}
        />
        <KpiCard
          label={t('requesters.kpiPerOrder')}
          value={f.czk(sumOf(internal, 'revenue') / (sumOf(internal, 'orders') || 1))}
          sub={t('requesters.externalPerOrder', {
            v: f.czk(sumOf(external, 'revenue') / (sumOf(external, 'orders') || 1)),
          })}
          loading={loading}
        />
        <KpiCard
          label={t('requesters.kpiTop')}
          value={rows[0] ? labels.dept(rows[0].dept_id) : '–'}
          sub={rows[0] ? t('payers.ofRevenue', { pct: f.pct(rows[0].revenue / total) }) : undefined}
          loading={loading}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title={t('requesters.top', { n: TOP })}
          subtitle={t('common.crossFilterHint')}
          info={t('glossary.absorption')}
          sql={reqSql}
          data={req.data}
          loading={req.loading}
          error={req.error}
          fileName="top-requesters"
          height={460}
        >
          {(register) => (
            <EChart
              option={topOption}
              onReady={register}
              onItemClick={(p) => {
                const r = top[p.dataIndex];
                if (r) crossFilter('depts', r.dept_id);
              }}
            />
          )}
        </ChartCard>
        <ChartCard
          title={t('requesters.kindTrend')}
          subtitle={t('requesters.kindTrendSub')}
          sql={monthSql}
          data={monthly.data}
          loading={monthly.loading}
          error={monthly.error}
          fileName="revenue-internal-external"
          height={460}
        >
          {(register) => <EChart option={kindOption} onReady={register} />}
        </ChartCard>
      </div>
      <ChartCard
        title={t('requesters.table')}
        sql={reqSql}
        data={req.data}
        loading={req.loading}
        error={req.error}
        fileName="requesters"
        height="auto"
        png={false}
      >
        {() => (
          <DataTable<Req>
            rows={rows}
            maxHeight={460}
            onRowClick={(r) => crossFilter('depts', r.dept_id)}
            columns={[
              { key: 'dept_id', label: t('slicers.depts'), render: (r) => labels.dept(r.dept_id) },
              {
                key: 'kind',
                label: t('ordering.kind'),
                render: (r) => t(r.kind === 'INTERNAL' ? 'ordering.internal' : 'ordering.external'),
              },
              { key: 'orders', label: t('kpi.samples'), align: 'right', render: (r) => f.num(r.orders) },
              {
                key: 'results',
                label: t('bizOverview.procedures'),
                align: 'right',
                render: (r) => f.num(r.results),
              },
              {
                key: 'revenue',
                label: t('bizOverview.revenue'),
                align: 'right',
                render: (r) => f.czk(r.revenue),
              },
              {
                key: 'margin',
                label: t('bizOverview.margin'),
                align: 'right',
                render: (r) => f.czk(r.margin),
              },
              {
                key: 'rev_per_order',
                label: t('bizOverview.perOrder'),
                align: 'right',
                render: (r) => f.czk(r.rev_per_order),
              },
            ]}
          />
        )}
      </ChartCard>
    </div>
  );
}
