import type { EChartsOption } from 'echarts';
import { useTranslation } from 'react-i18next';
import { ChartCard } from '../../components/charts/ChartCard';
import { axisStyle, baseOption, useChartTheme } from '../../components/charts/chartTheme';
import { EChart } from '../../components/charts/EChart';
import { DataTable } from '../../components/ui/DataTable';
import { KpiCard } from '../../components/ui/KpiCard';
import { useQuery } from '../../db/useQuery';
import { buildWhere } from '../../db/where';
import { MIN_RETEST_DAYS, valuesSql } from '../../domain/retest';
import { useLabels, useWhere } from '../../hooks/usePageData';
import { useFormat } from '../../i18n/format';
import { useFilters } from '../../store/filters';

type Kpi = {
  orders: number;
  patients: number;
  results: number;
  mri_results: number;
  early: number;
  early_cost: number;
};
type Cell = { dept_id: string; test_id: string; share: number };
type ByTest = { test_id: string; days: number; n: number; early: number; rate: number; cost: number };
type ByDept = {
  dept_id: string;
  kind: string;
  orders: number;
  tests_per_order: number;
  mri_results: number;
  early: number;
  rate: number | null;
  cost: number;
};

const TOP_TESTS = 15;

export default function Ordering() {
  const { t } = useTranslation();
  const f = useFormat();
  const theme = useChartTheme();
  const labels = useLabels();
  const crossFilter = useFilters((s) => s.crossFilter);
  const { where, filters } = useWhere('results');
  const rWhere = buildWhere(filters, 'results', 'r').sql;

  // Předčasně opakovaná vyšetření: předchozí výsledek téhož testu u pacienta je mladší než MRI
  const repeats = `WITH mri(test_id, days) AS (  -- minimální interval opakování / minimum retesting interval
  VALUES ${valuesSql(MIN_RETEST_DAYS)}
),
s AS (
  SELECT r.test_id, r.patient_id, r.dept_id, r.order_id, r.collected_at,
         lag(r.collected_at) OVER (PARTITION BY r.patient_id, r.test_id ORDER BY r.collected_at) AS prev_at
  FROM results_wide r
  WHERE r.test_id IN (SELECT test_id FROM mri) AND r.value IS NOT NULL AND ${where}
),
e AS (
  SELECT s.*, m.days,
         coalesce(date_diff('day', prev_at, collected_at) < m.days, false) AS early
  FROM s JOIN mri m USING (test_id)
),
cpr AS (  -- skutečný náklad na vydaný výsledek z nákladového modelu / cost per reportable result
  SELECT test_id, sum(total_cost_czk) / nullif(sum(reportable_results), 0) AS cost_per_result
  FROM costs_wide GROUP BY test_id
)`;

  const kpiSql = `${repeats}
SELECT (SELECT count(DISTINCT order_id)   FROM results_wide WHERE ${where}) AS orders,
       (SELECT count(DISTINCT patient_id) FROM results_wide WHERE ${where}) AS patients,
       (SELECT count(*)                   FROM results_wide WHERE ${where}) AS results,
       count(*)                                        AS mri_results,
       count(*) FILTER (WHERE early)                   AS early,
       coalesce(sum(cost_per_result) FILTER (WHERE early), 0) AS early_cost
FROM e LEFT JOIN cpr USING (test_id)`;

  const testSql = `${repeats}
SELECT test_id, any_value(days) AS days, count(*) AS n,
       count(*) FILTER (WHERE early)                        AS early,
       count(*) FILTER (WHERE early) / count(*)             AS rate,
       coalesce(sum(cost_per_result) FILTER (WHERE early), 0) AS cost
FROM e LEFT JOIN cpr USING (test_id)
GROUP BY test_id
ORDER BY early DESC`;

  const deptSql = `${repeats},
d AS (  -- objem a „hustota“ žádanek podle žadatele / volume and tests per order by requester
  SELECT dept_id, count(DISTINCT order_id) AS orders, count(*) / count(DISTINCT order_id) AS tests_per_order
  FROM results_wide WHERE ${where} GROUP BY dept_id
),
x AS (
  SELECT dept_id, count(*) AS mri_results, count(*) FILTER (WHERE early) AS early,
         coalesce(sum(cost_per_result) FILTER (WHERE early), 0) AS cost
  FROM e LEFT JOIN cpr USING (test_id) GROUP BY dept_id
)
SELECT d.dept_id, dep.kind, d.orders, d.tests_per_order,
       coalesce(x.mri_results, 0) AS mri_results, coalesce(x.early, 0) AS early,
       x.early / nullif(x.mri_results, 0) AS rate, coalesce(x.cost, 0) AS cost
FROM d JOIN dim_departments dep USING (dept_id) LEFT JOIN x USING (dept_id)
ORDER BY cost DESC, orders DESC`;

  const profileSql = `-- Indikační profil: podíl žádanek oddělení, které obsahují dané vyšetření
-- Ordering profile: share of each requester's orders that include the test
WITH o AS (
  SELECT dept_id, count(DISTINCT order_id) AS n FROM results_wide WHERE ${where} GROUP BY dept_id
),
top AS (
  SELECT test_id FROM results_wide WHERE ${where} GROUP BY test_id ORDER BY count(*) DESC LIMIT ${TOP_TESTS}
)
SELECT r.dept_id, r.test_id, count(DISTINCT r.order_id) / any_value(o.n) AS share
FROM results_wide r JOIN o USING (dept_id)
WHERE r.test_id IN (SELECT test_id FROM top) AND ${rWhere}
GROUP BY ALL`;

  const kpi = useQuery<Kpi>(kpiSql);
  const byTest = useQuery<ByTest>(testSql);
  const byDept = useQuery<ByDept>(deptSql);
  const profile = useQuery<Cell>(profileSql);
  const k = kpi.data?.[0];

  // --- heatmapa indikačního profilu ---
  const cells = profile.data ?? [];
  const deptOrder = (byDept.data ?? [])
    .slice()
    .sort((a, b) => (a.kind === b.kind ? b.orders - a.orders : a.kind === 'INTERNAL' ? -1 : 1))
    .map((d) => d.dept_id)
    .filter((d) => cells.some((c) => c.dept_id === d));
  const testOrder = [...new Set(cells.map((c) => c.test_id))].sort(
    (a, b) =>
      cells.filter((c) => c.test_id === b).reduce((s, c) => s + c.share, 0) -
      cells.filter((c) => c.test_id === a).reduce((s, c) => s + c.share, 0),
  );
  const heatOption: EChartsOption = {
    ...baseOption(theme),
    grid: { left: 8, right: 16, top: 36, bottom: 56, containLabel: true },
    tooltip: {
      ...baseOption(theme).tooltip,
      formatter: (p: unknown) => {
        const [i, j, v] = (p as { data: number[] }).data;
        return `${labels.dept(deptOrder[j])}<br/>${labels.test(testOrder[i])}: <b>${f.pct(v, 0)}</b> ${t('ordering.ofOrders')}`;
      },
    },
    xAxis: {
      type: 'category',
      data: testOrder.map((x) => labels.test(x)),
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, rotate: 40, interval: 0, width: 90, overflow: 'truncate' },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'category',
      data: deptOrder.map((d) => labels.dept(d)),
      inverse: true,
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, interval: 0, width: 170, overflow: 'truncate' },
      splitLine: { show: false },
    },
    visualMap: {
      min: 0,
      max: 1,
      orient: 'horizontal',
      right: 0,
      top: 0,
      itemHeight: 120,
      itemWidth: 10,
      text: ['100 %', '0 %'],
      textStyle: { color: theme.muted, fontSize: 11 },
      inRange: { color: theme.sequential },
    },
    series: [
      {
        type: 'heatmap',
        data: cells.map((c) => [testOrder.indexOf(c.test_id), deptOrder.indexOf(c.dept_id), c.share]),
        itemStyle: { borderColor: theme.surface, borderWidth: 1.5, borderRadius: 2 },
      },
    ],
  };

  // --- předčasná opakování podle vyšetření ---
  const tests = (byTest.data ?? []).filter((r) => r.n > 0);
  const barOption: EChartsOption = {
    ...baseOption(theme),
    legend: { show: false },
    grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (p: unknown) => {
        const r = tests[(p as { dataIndex: number }[])[0].dataIndex];
        return `<b>${labels.test(r.test_id)}</b> (MRI ${r.days} ${t('ordering.days')})<br/>${t('ordering.early')}: ${f.num(r.early)} / ${f.num(r.n)} (${f.pct(r.rate, 1)})<br/>${t('ordering.cost')}: ${f.czk(r.cost)}`;
      },
    },
    yAxis: {
      type: 'category',
      data: tests.map((r) => labels.test(r.test_id)),
      inverse: true,
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, width: 140, overflow: 'truncate' },
    },
    xAxis: {
      type: 'value',
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, formatter: (v: number) => f.pct(v, 0) },
    },
    series: [
      {
        type: 'bar',
        color: theme.series[1],
        barMaxWidth: 16,
        itemStyle: { borderRadius: [0, 3, 3, 0] },
        label: {
          show: true,
          position: 'right',
          color: theme.text2,
          fontSize: 11,
          formatter: (p) => f.pct(Number(p.value), 0),
        },
        data: tests.map((r) => r.rate),
      },
    ],
  };

  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t('pages.clinical.ordering')}</h1>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label={t('ordering.testsPerOrder')}
          value={k ? f.num(k.results / Math.max(k.orders, 1), 1) : '–'}
          sub={
            k
              ? t('ordering.ordersPerPatient', { value: f.num(k.orders / Math.max(k.patients, 1), 1) })
              : undefined
          }
          loading={kpi.loading && !k}
        />
        <KpiCard
          label={t('ordering.earlyRepeats')}
          info={t('glossary.mri')}
          value={f.num(k?.early)}
          sub={k ? t('ordering.ofMri', { total: f.num(k.mri_results) }) : undefined}
          loading={kpi.loading && !k}
        />
        <KpiCard
          label={t('ordering.earlyShare')}
          value={f.pct(k && k.mri_results ? k.early / k.mri_results : null)}
          loading={kpi.loading && !k}
        />
        <KpiCard
          label={t('ordering.earlyCost')}
          info={t('glossary.costPerResult')}
          value={f.czk(k?.early_cost)}
          sub={t('ordering.bridge')}
          loading={kpi.loading && !k}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-5">
        <ChartCard
          className="xl:col-span-3"
          title={t('ordering.profile')}
          subtitle={t('ordering.profileSub')}
          sql={profileSql}
          data={profile.data}
          loading={profile.loading}
          error={profile.error}
          fileName="ordering-profile"
          height={Math.max(360, deptOrder.length * 22 + 90)}
        >
          {(register) => (
            <EChart
              option={heatOption}
              onReady={register}
              onItemClick={(p) => {
                const d = deptOrder[(p.data as number[])[1]];
                if (d) crossFilter('depts', d);
              }}
            />
          )}
        </ChartCard>
        <ChartCard
          className="xl:col-span-2"
          title={t('ordering.byTest')}
          subtitle={t('ordering.byTestSub')}
          sql={testSql}
          data={byTest.data}
          loading={byTest.loading}
          error={byTest.error}
          fileName="early-repeats-by-test"
          height={Math.max(300, tests.length * 28 + 30)}
        >
          {(register) => (
            <EChart
              option={barOption}
              onReady={register}
              onItemClick={(p) => {
                const r = tests[p.dataIndex];
                if (r) crossFilter('tests', r.test_id);
              }}
            />
          )}
        </ChartCard>
      </div>
      <ChartCard
        title={t('ordering.byDept')}
        subtitle={t('ordering.byDeptSub')}
        sql={deptSql}
        data={byDept.data}
        loading={byDept.loading}
        error={byDept.error}
        fileName="ordering-by-requester"
        height="auto"
        png={false}
      >
        {() => (
          <DataTable<ByDept>
            rows={byDept.data ?? []}
            maxHeight={420}
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
                key: 'tests_per_order',
                label: t('ordering.testsPerOrder'),
                align: 'right',
                render: (r) => f.num(r.tests_per_order, 1),
              },
              {
                key: 'early',
                label: t('ordering.earlyRepeats'),
                align: 'right',
                render: (r) => f.num(r.early),
              },
              {
                key: 'rate',
                label: t('ordering.earlyShare'),
                align: 'right',
                render: (r) => f.pct(r.rate, 1),
              },
              { key: 'cost', label: t('ordering.cost'), align: 'right', render: (r) => f.czk(r.cost) },
            ]}
          />
        )}
      </ChartCard>
    </div>
  );
}
