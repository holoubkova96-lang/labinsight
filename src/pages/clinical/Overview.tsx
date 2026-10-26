import type { EChartsOption } from 'echarts';
import { useTranslation } from 'react-i18next';
import { ChartCard } from '../../components/charts/ChartCard';
import { axisStyle, baseOption, useChartTheme } from '../../components/charts/chartTheme';
import { EChart } from '../../components/charts/EChart';
import { KpiCard } from '../../components/ui/KpiCard';
import { useQuery } from '../../db/useQuery';
import { buildWhere } from '../../db/where';
import { useFormat } from '../../i18n/format';
import { useFilters, useFilterValues } from '../../store/filters';

type Kpi = {
  samples: number;
  results: number;
  reportable: number;
  pathological: number;
  critical: number;
  tat_stat: number | null;
  tat_routine: number | null;
};
type TrendRow = { month_key: string; stat: number; routine: number };

export default function ClinicalOverview() {
  const { t } = useTranslation();
  const f = useFormat();
  const theme = useChartTheme();
  const filters = useFilterValues();
  const setRange = useFilters((s) => s.setRange);
  const where = buildWhere(filters, 'results').sql;

  const kpiSql = `-- KPI klinického přehledu / clinical overview KPIs
WITH f AS (
  SELECT * FROM results_wide
  WHERE ${where}
),
tat AS (  -- TAT žádanky: odběr → validace posledního výsledku
  SELECT order_id, priority,
         date_diff('minute', min(collected_at), max(validated_at)) AS tat_min
  FROM f
  WHERE validated_at IS NOT NULL
  GROUP BY order_id, priority
)
SELECT
  count(DISTINCT order_id)                                AS samples,
  count(*)                                                AS results,
  count(value)                                            AS reportable,
  count(*) FILTER (WHERE flag IN ('L', 'H', 'LL', 'HH'))  AS pathological,
  count(*) FILTER (WHERE is_critical)                     AS critical,
  (SELECT median(tat_min) FROM tat WHERE priority = 'STAT')    AS tat_stat,
  (SELECT median(tat_min) FROM tat WHERE priority = 'ROUTINE') AS tat_routine
FROM f`;

  const trendSql = `-- Objem žádanek po měsících / orders per month
SELECT month_key,
       count(DISTINCT order_id) FILTER (WHERE priority = 'STAT')    AS stat,
       count(DISTINCT order_id) FILTER (WHERE priority = 'ROUTINE') AS routine
FROM results_wide
WHERE ${where}
GROUP BY month_key
ORDER BY month_key`;

  const kpi = useQuery<Kpi>(kpiSql);
  const trend = useQuery<TrendRow>(trendSql);
  const k = kpi.data?.[0];

  const months = trend.data?.map((r) => r.month_key) ?? [];
  const option: EChartsOption = {
    ...baseOption(theme),
    tooltip: { ...baseOption(theme).tooltip, trigger: 'axis', axisPointer: { type: 'shadow' as const } },
    xAxis: {
      type: 'category' as const,
      data: months,
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, formatter: (m: string) => f.month(m) },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value' as const,
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, formatter: (v: number) => f.num(v) },
    },
    series: [
      { name: t('charts.routine'), key: 'routine', color: theme.series[0] },
      { name: t('charts.stat'), key: 'stat', color: theme.series[1] },
    ].map((s, i) => ({
      name: s.name,
      type: 'bar' as const,
      stack: 'orders',
      barMaxWidth: 28,
      color: s.color,
      // 2px mezera mezi segmenty a zaoblený jen vrchní konec sloupce
      itemStyle: { borderColor: theme.surface, borderWidth: 1, borderRadius: i === 1 ? [4, 4, 0, 0] : 0 },
      emphasis: { focus: 'series' },
      data: trend.data?.map((r) => r[s.key as 'stat' | 'routine']) ?? [],
    })),
  };

  // klik na měsíc nastaví období na tento měsíc (cross-filtering)
  const selectMonth = (month: string) => {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    setRange(`${month}-01`, `${month}-${String(last).padStart(2, '0')}`);
  };

  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t('pages.clinical.overview')}</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label={t('kpi.samples')}
          info={t('glossary.samples')}
          value={f.num(k?.samples)}
          sub={k ? `${f.num(k.results)} ${t('kpi.results').toLowerCase()}` : undefined}
          loading={kpi.loading && !k}
        />
        <KpiCard
          label={t('kpi.pathological')}
          info={t('glossary.pathological')}
          value={f.pct(k && k.reportable ? k.pathological / k.reportable : null)}
          sub={k ? t('kpi.ofResults', { total: f.num(k.reportable) }) : undefined}
          loading={kpi.loading && !k}
        />
        <KpiCard
          label={t('kpi.critical')}
          info={t('glossary.critical')}
          value={f.num(k?.critical)}
          loading={kpi.loading && !k}
        />
        <KpiCard
          label={t('kpi.tatStat')}
          info={t('glossary.tat')}
          value={k?.tat_stat != null ? t('kpi.minutes', { value: f.num(k.tat_stat) }) : '–'}
          loading={kpi.loading && !k}
        />
        <KpiCard
          label={t('kpi.tatRoutine')}
          info={t('glossary.tat')}
          value={k?.tat_routine != null ? t('kpi.minutes', { value: f.num(k.tat_routine) }) : '–'}
          loading={kpi.loading && !k}
        />
      </div>
      <ChartCard
        title={t('charts.volumeTrend')}
        subtitle={t('charts.volumeTrendSub')}
        sql={trendSql}
        data={trend.data}
        loading={trend.loading}
        error={trend.error}
        fileName="orders-per-month"
        height={320}
      >
        {(register) => <EChart option={option} onReady={register} onCategoryClick={selectMonth} />}
      </ChartCard>
    </div>
  );
}
