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

type Kpi = { n: number; within30: number | null; med: number | null; over60: number };
type Event = { t: number; report_min: number; test_id: string; dept_id: string; value: number; flag: string };
type Bucket = { bucket: number; n: number };
type ByDept = { dept_id: string; n: number; within30: number };
type ByTest = { test_id: string; n: number; ll: number; hh: number; med: number; within30: number };

const TARGET_MIN = 30;

export default function Critical() {
  const { t } = useTranslation();
  const f = useFormat();
  const theme = useChartTheme();
  const labels = useLabels();
  const crossFilter = useFilters((s) => s.crossFilter);
  const { where } = useWhere('results');

  // Společný základ: kritické výsledky a doba od validace do telefonického nahlášení
  const crit = `WITH crit AS (  -- kritické hodnoty / critical values
  SELECT *, date_diff('second', validated_at, critical_reported_at) / 60.0 AS report_min
  FROM results_wide
  WHERE is_critical AND ${where}
)`;

  const kpiSql = `${crit}
SELECT count(*)                                                        AS n,
       avg(CASE WHEN report_min <= ${TARGET_MIN} THEN 1 ELSE 0 END)    AS within30,
       median(report_min)                                              AS med,
       count(*) FILTER (WHERE report_min > 60)                         AS over60
FROM crit`;

  const eventsSql = `${crit}
-- jednotlivá hlášení v čase / individual notifications over time
SELECT epoch_ms(validated_at) AS t, report_min, test_id, dept_id, value, flag
FROM crit
ORDER BY t`;

  const histSql = `${crit}
-- rozdělení doby do nahlášení po 5 min (vše nad 120 min v posledním koši)
-- time-to-notification in 5-minute buckets (everything above 120 min in the last bucket)
SELECT least(floor(report_min / 5) * 5, 120)::INT AS bucket, count(*) AS n
FROM crit
GROUP BY bucket
ORDER BY bucket`;

  const deptSql = `${crit}
SELECT dept_id, count(*) AS n,
       avg(CASE WHEN report_min <= ${TARGET_MIN} THEN 1 ELSE 0 END) AS within30
FROM crit
GROUP BY dept_id
HAVING count(*) >= 5
ORDER BY within30`;

  const testSql = `${crit}
SELECT test_id, count(*) AS n,
       count(*) FILTER (WHERE flag = 'LL') AS ll,
       count(*) FILTER (WHERE flag = 'HH') AS hh,
       median(report_min) AS med,
       avg(CASE WHEN report_min <= ${TARGET_MIN} THEN 1 ELSE 0 END) AS within30
FROM crit
GROUP BY test_id
ORDER BY n DESC`;

  const kpi = useQuery<Kpi>(kpiSql);
  const events = useQuery<Event>(eventsSql);
  const hist = useQuery<Bucket>(histSql);
  const dept = useQuery<ByDept>(deptSql);
  const tests = useQuery<ByTest>(testSql);
  const k = kpi.data?.[0];

  const ev = events.data ?? [];
  const late = theme.series[1];
  const onTime = theme.series[0];
  const timelineOption: EChartsOption = {
    ...baseOption(theme),
    grid: { left: 8, right: 24, top: 36, bottom: 40, containLabel: true },
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'item',
      formatter: (p: unknown) => {
        const e = ev[(p as { dataIndex: number }).dataIndex];
        return `<b>${labels.test(e.test_id)}</b> ${e.flag} · ${f.num(e.value, 2)}<br/>${labels.dept(e.dept_id)}<br/>${f.date(e.t)}<br/>${t('critical.reportedIn', { min: f.num(e.report_min, 0) })}`;
      },
    },
    legend: { ...baseOption(theme).legend, data: [t('critical.onTime'), t('critical.late')] },
    xAxis: { type: 'time', ...axisStyle(theme), splitLine: { show: false } },
    yAxis: {
      type: 'log',
      min: 1,
      ...axisStyle(theme),
      name: t('critical.minutes'),
      nameLocation: 'middle',
      nameGap: 36,
      nameTextStyle: { color: theme.muted, fontSize: 11 },
    },
    dataZoom: [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 8 }],
    series: [
      { name: t('critical.onTime'), color: onTime, pick: (e: Event) => e.report_min <= TARGET_MIN },
      { name: t('critical.late'), color: late, pick: (e: Event) => e.report_min > TARGET_MIN },
    ].map((s, i) => ({
      type: 'scatter' as const,
      name: s.name,
      color: s.color,
      symbolSize: 7,
      itemStyle: { borderColor: theme.surface, borderWidth: 1, opacity: 0.85 },
      // body mimo sérii jsou null, aby dataIndex odpovídal pořadí v ev
      data: ev.map((e) => (s.pick(e) ? [e.t, Math.max(e.report_min, 1)] : null)) as unknown as number[][],
      markLine:
        i === 0
          ? {
              symbol: 'none',
              silent: true,
              lineStyle: { color: theme.text2, type: 'dashed' },
              label: { formatter: t('critical.target'), color: theme.text2, position: 'insideEndTop' },
              data: [{ yAxis: TARGET_MIN }],
            }
          : undefined,
    })),
  };

  const buckets = hist.data ?? [];
  const histOption: EChartsOption = {
    ...baseOption(theme),
    legend: { show: false },
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    tooltip: { ...baseOption(theme).tooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: {
      type: 'category',
      data: buckets.map((b) => (b.bucket >= 120 ? '120+' : `${b.bucket}–${b.bucket + 5}`)),
      ...axisStyle(theme),
      splitLine: { show: false },
      name: t('critical.minutes'),
      nameTextStyle: { color: theme.muted, fontSize: 11 },
    },
    yAxis: { type: 'value', ...axisStyle(theme) },
    series: [
      {
        type: 'bar',
        name: t('critical.count'),
        barCategoryGap: '10%',
        data: buckets.map((b) => ({
          value: b.n,
          itemStyle: { color: b.bucket < TARGET_MIN ? onTime : late },
        })),
        itemStyle: { borderRadius: [3, 3, 0, 0] },
      },
    ],
  };

  const depts = dept.data ?? [];
  const deptOption: EChartsOption = {
    ...baseOption(theme),
    grid: { left: 8, right: 40, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v) => f.pct(Number(v)),
    },
    yAxis: {
      type: 'category',
      data: depts.map((d) => labels.dept(d.dept_id)),
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, width: 150, overflow: 'truncate' },
    },
    xAxis: {
      type: 'value',
      min: 0,
      max: 1,
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, formatter: (v: number) => f.pct(v, 0) },
    },
    series: [
      {
        type: 'bar',
        name: t('critical.within30'),
        barMaxWidth: 16,
        color: theme.series[0],
        itemStyle: { borderRadius: [0, 3, 3, 0] },
        label: {
          show: true,
          position: 'right',
          color: theme.text2,
          fontSize: 11,
          formatter: (p) => f.pct(Number(p.value), 0),
        },
        data: depts.map((d) => d.within30),
      },
    ],
  };

  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t('pages.clinical.critical')}</h1>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label={t('kpi.critical')}
          info={t('glossary.critical')}
          value={f.num(k?.n)}
          loading={kpi.loading && !k}
        />
        <KpiCard
          label={t('critical.within30')}
          info={t('glossary.criticalTarget')}
          value={f.pct(k?.within30)}
          loading={kpi.loading && !k}
        />
        <KpiCard
          label={t('critical.medianTime')}
          value={k?.med != null ? t('kpi.minutes', { value: f.num(k.med, 0) }) : '–'}
          loading={kpi.loading && !k}
        />
        <KpiCard label={t('critical.over60')} value={f.num(k?.over60)} loading={kpi.loading && !k} />
      </div>
      <ChartCard
        title={t('critical.timeline')}
        subtitle={t('critical.timelineSub')}
        sql={eventsSql}
        data={events.data}
        loading={events.loading}
        error={events.error}
        fileName="critical-values-timeline"
        height={340}
      >
        {(register) => <EChart option={timelineOption} onReady={register} />}
      </ChartCard>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title={t('critical.histogram')}
          subtitle={t('critical.histogramSub')}
          sql={histSql}
          data={hist.data}
          loading={hist.loading}
          error={hist.error}
          fileName="critical-time-to-report"
        >
          {(register) => <EChart option={histOption} onReady={register} />}
        </ChartCard>
        <ChartCard
          title={t('critical.byDept')}
          subtitle={t('common.crossFilterHint')}
          sql={deptSql}
          data={dept.data}
          loading={dept.loading}
          error={dept.error}
          fileName="critical-within-30-by-department"
        >
          {(register) => (
            <EChart
              option={deptOption}
              onReady={register}
              onItemClick={(p) => {
                const d = depts[p.dataIndex];
                if (d) crossFilter('depts', d.dept_id);
              }}
            />
          )}
        </ChartCard>
      </div>
      <ChartCard
        title={t('critical.byTest')}
        sql={testSql}
        data={tests.data}
        loading={tests.loading}
        error={tests.error}
        fileName="critical-by-test"
        height="auto"
        png={false}
      >
        {() => (
          <DataTable<ByTest>
            rows={tests.data ?? []}
            onRowClick={(r) => crossFilter('tests', r.test_id)}
            columns={[
              { key: 'test_id', label: t('slicers.tests'), render: (r) => labels.test(r.test_id) },
              { key: 'n', label: t('critical.count'), align: 'right', render: (r) => f.num(r.n) },
              { key: 'll', label: 'LL', align: 'right', render: (r) => f.num(r.ll) },
              { key: 'hh', label: 'HH', align: 'right', render: (r) => f.num(r.hh) },
              {
                key: 'med',
                label: t('critical.medianTime'),
                align: 'right',
                render: (r) => `${f.num(r.med, 0)} min`,
              },
              {
                key: 'within30',
                label: t('critical.within30'),
                align: 'right',
                render: (r) => f.pct(r.within30, 0),
              },
            ]}
          />
        )}
      </ChartCard>
    </div>
  );
}
