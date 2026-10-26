import type { EChartsOption } from 'echarts';
import { useTranslation } from 'react-i18next';
import { ChartCard } from '../../components/charts/ChartCard';
import { axisStyle, baseOption, useChartTheme } from '../../components/charts/chartTheme';
import { EChart } from '../../components/charts/EChart';
import { DataTable } from '../../components/ui/DataTable';
import { KpiCard } from '../../components/ui/KpiCard';
import { useQuery } from '../../db/useQuery';
import { useWhere } from '../../hooks/usePageData';
import { useFormat } from '../../i18n/format';
import { useFilters } from '../../store/filters';

type Share = { payer: string; results: number; revenue: number; points: number; orders: number };
type Monthly = { month_key: string; payer: string; revenue: number };
type Insurer = {
  insurer_code: string;
  name_cs: string;
  name_en: string;
  contract_coef: number;
  point_value_801: number;
  point_value_818: number;
  point_value_999: number;
  realised: number | null;
};
type SelfPay = { source: string; tests: number; avg_price: number };

/** Pevné pořadí plátců = pevné barvy (barva sleduje entitu, ne pořadí). */
const PAYERS = ['111', '201', '205', '207', '209', '211', '213', 'SELF'];

export default function Payers() {
  const { t } = useTranslation();
  const f = useFormat();
  const theme = useChartTheme();
  const crossFilter = useFilters((s) => s.crossFilter);
  const { where } = useWhere('results');

  const shareSql = `-- Podíl plátců na výkonech a výnosech / payer share of procedures and revenue
SELECT payer,
       count(*)                 AS results,
       sum(revenue_czk)         AS revenue,
       sum(points)              AS points,
       count(DISTINCT order_id) AS orders
FROM results_wide
WHERE value IS NOT NULL AND ${where}
GROUP BY payer`;

  const monthSql = `SELECT month_key, payer, sum(revenue_czk) AS revenue
FROM results_wide
WHERE value IS NOT NULL AND ${where}
GROUP BY ALL
ORDER BY month_key`;

  const insurerSql = `-- Hodnota bodu: vyhláška × fiktivní smluvní koeficient; „realizovaná“ = výnos / body
-- Point value: decree × fictional contract coefficient; "realised" = revenue / points
SELECT i.*, r.realised
FROM dim_insurers i
LEFT JOIN (
  SELECT insurer_code, sum(revenue_czk) / nullif(sum(points), 0) AS realised
  FROM results_wide
  WHERE payer_type = 'INSURANCE' AND value IS NOT NULL AND ${where}
  GROUP BY insurer_code
) r USING (insurer_code)
ORDER BY insurer_code`;

  const selfSql = `-- Ceník samoplátců: zdroj ceny (ceník vs. odhad z bodů)
-- Self-payer prices: price source (price list vs. estimate from points)
SELECT self_pay_price_source AS source, count(*) AS tests, avg(self_pay_price_czk) AS avg_price
FROM dim_tests WHERE points > 0
GROUP BY source`;

  const share = useQuery<Share>(shareSql);
  const monthly = useQuery<Monthly>(monthSql);
  const insurers = useQuery<Insurer>(insurerSql);
  const selfPay = useQuery<SelfPay>(selfSql);

  const rows = share.data ?? [];
  const tot = {
    results: rows.reduce((s, r) => s + r.results, 0) || 1,
    revenue: rows.reduce((s, r) => s + r.revenue, 0) || 1,
    orders: rows.reduce((s, r) => s + r.orders, 0) || 1,
  };
  const self = rows.find((r) => r.payer === 'SELF');
  const ins = rows.filter((r) => r.payer !== 'SELF');
  const avgPointValue = ins.reduce((s, r) => s + r.revenue, 0) / (ins.reduce((s, r) => s + r.points, 0) || 1);
  const top = [...ins].sort((a, b) => b.revenue - a.revenue)[0];
  const payerName = (code: string) => {
    if (code === 'SELF') return t('slicers.self');
    const i = insurers.data?.find((x) => x.insurer_code === code);
    return i ? `${code} · ${f.name(i)}` : code;
  };
  const shortName = (code: string) => (code === 'SELF' ? t('slicers.self') : code);
  const present = PAYERS.filter((p) => rows.some((r) => r.payer === p));
  const colorOf = (p: string) => theme.series[PAYERS.indexOf(p)];

  const shareOption: EChartsOption = {
    ...baseOption(theme),
    grid: { left: 8, right: 24, top: 36, bottom: 8, containLabel: true },
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v) => f.pct(Number(v)),
    },
    yAxis: {
      type: 'category',
      data: present.map(payerName),
      inverse: true,
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, width: 200, overflow: 'truncate' },
    },
    xAxis: {
      type: 'value',
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, formatter: (v: number) => f.pct(v, 0) },
    },
    series: [
      { key: 'results' as const, name: t('payers.shareResults'), color: theme.muted },
      { key: 'revenue' as const, name: t('payers.shareRevenue'), color: theme.series[0] },
    ].map((s) => ({
      type: 'bar' as const,
      name: s.name,
      color: s.color,
      barMaxWidth: 10,
      itemStyle: { borderRadius: [0, 3, 3, 0] },
      data: present.map((p) => (rows.find((r) => r.payer === p)?.[s.key] ?? 0) / tot[s.key]),
    })),
  };

  const months = [...new Set((monthly.data ?? []).map((r) => r.month_key))];
  const monthOption: EChartsOption = {
    ...baseOption(theme),
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v) => f.czk(Number(v)),
    },
    legend: { ...baseOption(theme).legend, type: 'scroll' },
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
    series: present.map((p, i) => ({
      type: 'bar' as const,
      name: shortName(p),
      stack: 'payer',
      color: colorOf(p),
      barMaxWidth: 22,
      itemStyle: {
        borderColor: theme.surface,
        borderWidth: 1,
        borderRadius: i === present.length - 1 ? [3, 3, 0, 0] : 0,
      },
      data: months.map((m) => monthly.data?.find((r) => r.month_key === m && r.payer === p)?.revenue ?? 0),
    })),
  };

  const loading = share.loading && !rows.length;
  const estimated = selfPay.data?.find((r) => r.source === 'ESTIMATE')?.tests ?? 0;
  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t('pages.business.payers')}</h1>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label={t('payers.kpiSelfOrders')}
          value={f.pct(self ? self.orders / tot.orders : 0)}
          sub={t('payers.kpiSelfRevenue', { pct: f.pct(self ? self.revenue / tot.revenue : 0) })}
          loading={loading}
        />
        <KpiCard
          label={t('payers.kpiPointValue')}
          info={t('glossary.pointValue')}
          value={f.czk(avgPointValue, 3)}
          sub={t('payers.kpiPointValueSub')}
          loading={loading}
        />
        <KpiCard
          label={t('payers.kpiTop')}
          value={top ? payerName(top.payer) : '–'}
          sub={top ? t('payers.ofRevenue', { pct: f.pct(top.revenue / tot.revenue) }) : undefined}
          loading={loading}
        />
        <KpiCard
          label={t('payers.kpiRevenuePerResult')}
          value={f.czk(self ? self.revenue / self.results : null, 1)}
          sub={t('payers.vsInsurance', {
            v: f.czk(
              ins.reduce((s, r) => s + r.revenue, 0) / (ins.reduce((s, r) => s + r.results, 0) || 1),
              1,
            ),
          })}
          loading={loading}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title={t('payers.share')}
          subtitle={t('payers.shareSub')}
          sql={shareSql}
          data={share.data}
          loading={share.loading}
          error={share.error}
          fileName="payer-share"
          height={340}
        >
          {(register) => (
            <EChart
              option={shareOption}
              onReady={register}
              onItemClick={(p) => {
                const code = present[p.dataIndex];
                if (code) crossFilter('payers', code);
              }}
            />
          )}
        </ChartCard>
        <ChartCard
          title={t('payers.trend')}
          subtitle={t('payers.trendSub')}
          sql={monthSql}
          data={monthly.data}
          loading={monthly.loading}
          error={monthly.error}
          fileName="revenue-by-payer-monthly"
          height={340}
        >
          {(register) => <EChart option={monthOption} onReady={register} />}
        </ChartCard>
      </div>
      <ChartCard
        title={t('payers.pointValues')}
        subtitle={t('payers.pointValuesSub')}
        info={t('glossary.pointValue')}
        sql={insurerSql}
        data={insurers.data}
        loading={insurers.loading}
        error={insurers.error}
        fileName="point-values-by-insurer"
        height="auto"
        png={false}
      >
        {() => (
          <DataTable<Insurer>
            rows={insurers.data ?? []}
            onRowClick={(r) => crossFilter('payers', r.insurer_code)}
            columns={[
              {
                key: 'insurer_code',
                label: t('payers.insurer'),
                render: (r) => `${r.insurer_code} · ${f.name(r)}`,
              },
              {
                key: 'contract_coef',
                label: t('payers.coef'),
                align: 'right',
                render: (r) => f.num(r.contract_coef, 3),
              },
              {
                key: 'point_value_801',
                label: '801 / 813',
                align: 'right',
                render: (r) => f.czk(r.point_value_801, 3),
              },
              {
                key: 'point_value_818',
                label: '818',
                align: 'right',
                render: (r) => f.czk(r.point_value_818, 3),
              },
              {
                key: 'point_value_999',
                label: '999',
                align: 'right',
                render: (r) => f.czk(r.point_value_999, 3),
              },
              {
                key: 'realised',
                label: t('payers.realised'),
                align: 'right',
                render: (r) => f.czk(r.realised, 3),
              },
            ]}
          />
        )}
      </ChartCard>
      <p className="text-xs text-muted">
        {t('payers.selfNote', { estimated, total: (selfPay.data ?? []).reduce((s, r) => s + r.tests, 0) })}
      </p>
    </div>
  );
}
