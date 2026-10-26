import { useMemo } from 'react';
import type { CustomSeriesRenderItemAPI, CustomSeriesRenderItemParams, EChartsOption } from 'echarts';
import { useTranslation } from 'react-i18next';
import { ChartCard } from '../../components/charts/ChartCard';
import { axisStyle, baseOption, useChartTheme } from '../../components/charts/chartTheme';
import { EChart } from '../../components/charts/EChart';
import { KpiCard } from '../../components/ui/KpiCard';
import { useQuery } from '../../db/useQuery';
import { breakEven } from '../../domain/costModel';
import { useLabels, useWhere } from '../../hooks/usePageData';
import { useFormat } from '../../i18n/format';
import { DATA_END } from '../../components/slicers/useSlicerOptions';
import { useMethodParams } from './useMethodParams';

type Method = {
  test_id: string;
  category: 'NEW_SUCCESS' | 'NEW_CANCELLED';
  intro: number;
  cancel: number | null;
  planned: number;
  actual: number;
  reason_code: string | null;
  reason_cs: string | null;
  reason_en: string | null;
  lessons_cs: string | null;
  lessons_en: string | null;
  one_off: number;
};
type MonthMargin = { month_key: string; test_id: string; margin: number };

const REGISTRY_SQL = `-- Registr nově zavedených metod / register of newly introduced methods
SELECT test_id, category,
       epoch_ms(CAST(introduced_on AS TIMESTAMP)) AS intro,
       epoch_ms(CAST(cancelled_on AS TIMESTAMP))  AS cancel,
       planned_monthly_volume   AS planned,
       actual_avg_monthly_volume AS actual,
       cancellation_reason_code AS reason_code,
       cancellation_reason_cs AS reason_cs, cancellation_reason_en AS reason_en,
       lessons_learned_cs AS lessons_cs, lessons_learned_en AS lessons_en,
       validation_cost_czk + training_cost_czk AS one_off
FROM dim_method_registry
WHERE category <> 'ROUTINE'
ORDER BY intro`;

export default function Lifecycle() {
  const { t } = useTranslation();
  const f = useFormat();
  const theme = useChartTheme();
  const labels = useLabels();
  const methods = useMethodParams();
  const { where } = useWhere('results');
  const { where: costWhere, ignoredNote } = useWhere('costs');

  const registry = useQuery<Method>(REGISTRY_SQL);
  const list = useMemo(() => registry.data ?? [], [registry.data]);
  const ids = list.map((m) => `'${m.test_id}'`).join(', ') || "''";

  const marginSql = `-- Měsíční výsledek nových metod: výnos − skutečné náklady (vč. odpisu validace)
-- Monthly result of new methods: revenue − actual costs (incl. validation write-off)
WITH r AS (
  SELECT month_key, test_id, sum(revenue_czk) AS revenue
  FROM results_wide
  WHERE value IS NOT NULL AND test_id IN (${ids}) AND ${where}
  GROUP BY ALL
),
c AS (
  SELECT month_key, test_id, sum(total_cost_czk) AS cost
  FROM costs_wide
  WHERE test_id IN (${ids}) AND ${costWhere}
  GROUP BY ALL
)
SELECT month_key, test_id, coalesce(revenue, 0) - coalesce(cost, 0) AS margin
FROM r FULL JOIN c USING (month_key, test_id)
ORDER BY month_key, test_id`;
  const margins = useQuery<MonthMargin>(list.length ? marginSql : null);

  const lang = f.lang;
  const isCancelled = (m: Method) => m.category === 'NEW_CANCELLED';

  // Kumulovaný výsledek každé metody
  const { months, cumulative, totals } = useMemo(() => {
    const rows = margins.data ?? [];
    const months = [...new Set(rows.map((r) => r.month_key))].sort();
    const cumulative = new Map<string, (number | null)[]>();
    const totals = new Map<string, number>();
    for (const m of list) {
      let acc = 0;
      let started = false;
      cumulative.set(
        m.test_id,
        months.map((mk) => {
          const v = rows.find((r) => r.month_key === mk && r.test_id === m.test_id)?.margin;
          if (v != null) started = true;
          acc += v ?? 0;
          return started ? acc : null;
        }),
      );
      totals.set(m.test_id, acc);
    }
    return { months, cumulative, totals };
  }, [margins.data, list]);

  const cancelledLoss = list
    .filter(isCancelled)
    .reduce((s, m) => s + Math.min(0, totals.get(m.test_id) ?? 0), 0);
  const successGain = list
    .filter((m) => !isCancelled(m))
    .reduce((s, m) => s + (totals.get(m.test_id) ?? 0), 0);
  const colorOf = (m: Method) => (isCancelled(m) ? theme.series[7] : theme.series[0]);
  const end = new Date(`${DATA_END}T23:59:59`).getTime();

  // --- Gantt: zavedení → zrušení ---
  const ganttOption: EChartsOption = {
    ...baseOption(theme),
    legend: { show: false },
    grid: { left: 8, right: 24, top: 8, bottom: 24, containLabel: true },
    tooltip: {
      ...baseOption(theme).tooltip,
      formatter: (p: unknown) => {
        const m = list[(p as { dataIndex: number }).dataIndex];
        return `<b>${labels.test(m.test_id)}</b><br/>${f.date(m.intro)} – ${m.cancel ? f.date(m.cancel) : t('lifecycle.running')}<br/>${t(`lifecycle.category.${m.category}`)}`;
      },
    },
    xAxis: {
      type: 'time',
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, hideOverlap: true },
    },
    yAxis: {
      type: 'category',
      data: list.map((m) => labels.test(m.test_id)),
      inverse: true,
      ...axisStyle(theme),
      splitLine: { show: false },
    },
    series: [
      {
        type: 'custom',
        renderItem: (_params: CustomSeriesRenderItemParams, api: CustomSeriesRenderItemAPI) => {
          const y = api.value(0) as number;
          const start = api.coord([api.value(1), y]);
          const stop = api.coord([api.value(2), y]);
          const h = (api.size?.([0, 1]) as number[])[1] * 0.5;
          return {
            type: 'rect',
            shape: {
              x: start[0],
              y: start[1] - h / 2,
              width: Math.max(stop[0] - start[0], 2),
              height: h,
              r: 4,
            },
            style: { fill: api.visual('color') as string },
          };
        },
        encode: { x: [1, 2], y: 0 },
        data: list.map((m, i) => ({
          value: [i, m.intro, m.cancel ?? end],
          itemStyle: { color: colorOf(m) },
        })),
      },
    ],
  };

  // --- plán vs. skutečnost ---
  const planOption: EChartsOption = {
    ...baseOption(theme),
    grid: { left: 8, right: 24, top: 36, bottom: 8, containLabel: true },
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v) => `${f.num(Number(v))} / ${t('frequency.month')}`,
    },
    yAxis: {
      type: 'category',
      data: list.map((m) => labels.test(m.test_id)),
      inverse: true,
      ...axisStyle(theme),
    },
    xAxis: {
      type: 'value',
      ...axisStyle(theme),
      name: t('frequency.xAxis').replace(/\s*\(.*\)/, ''),
      nameLocation: 'middle',
      nameGap: 24,
    },
    series: [
      { name: t('lifecycle.planned'), key: 'planned' as const, color: theme.muted },
      { name: t('lifecycle.actual'), key: 'actual' as const, color: theme.series[0] },
    ].map((s) => ({
      type: 'bar' as const,
      name: s.name,
      barMaxWidth: 10,
      color: s.color,
      itemStyle: { borderRadius: [0, 3, 3, 0] },
      data: list.map((m) => ({
        value: m[s.key],
        itemStyle: s.key === 'actual' ? { color: colorOf(m) } : undefined,
      })),
    })),
  };

  // --- kumulovaný výsledek ---
  const cumOption: EChartsOption = {
    ...baseOption(theme),
    grid: { left: 8, right: 96, top: 36, bottom: 8, containLabel: true },
    legend: { show: false },
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'axis',
      valueFormatter: (v) => (v == null ? '–' : f.czk(Number(v))),
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
    series: list.map((m, i) => ({
      type: 'line' as const,
      name: labels.test(m.test_id),
      color: colorOf(m),
      showSymbol: false,
      lineStyle: { width: 2, type: isCancelled(m) ? ('dashed' as const) : ('solid' as const) },
      endLabel: { show: true, formatter: m.test_id, color: theme.text2, fontSize: 10 },
      data: cumulative.get(m.test_id) ?? [],
      markLine:
        i === 0
          ? {
              symbol: 'none',
              silent: true,
              lineStyle: { color: theme.muted },
              label: { show: false },
              data: [{ yAxis: 0 }],
            }
          : undefined,
    })),
  };

  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t('pages.business.lifecycle')}</h1>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label={t('lifecycle.kpiIntroduced')}
          value={f.num(list.length)}
          loading={registry.loading && !list.length}
        />
        <KpiCard
          label={t('lifecycle.kpiCancelled')}
          value={f.num(list.filter(isCancelled).length)}
          sub={list
            .filter(isCancelled)
            .map((m) => m.test_id)
            .join(', ')}
          loading={registry.loading && !list.length}
        />
        <KpiCard
          label={t('lifecycle.kpiLoss')}
          info={t('glossary.lifecycleLoss')}
          value={f.czk(cancelledLoss)}
          loading={margins.loading && !margins.data}
        />
        <KpiCard
          label={t('lifecycle.kpiGain')}
          value={f.czk(successGain)}
          loading={margins.loading && !margins.data}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title={t('lifecycle.gantt')}
          subtitle={t('lifecycle.ganttSub')}
          sql={REGISTRY_SQL}
          data={registry.data}
          loading={registry.loading}
          error={registry.error}
          fileName="method-lifecycle-gantt"
          height={300}
        >
          {(register) => <EChart option={ganttOption} onReady={register} />}
        </ChartCard>
        <ChartCard
          title={t('lifecycle.plan')}
          subtitle={t('lifecycle.planSub')}
          sql={REGISTRY_SQL}
          data={registry.data}
          loading={registry.loading}
          error={registry.error}
          fileName="planned-vs-actual"
          height={300}
        >
          {(register) => <EChart option={planOption} onReady={register} />}
        </ChartCard>
      </div>
      <ChartCard
        title={t('lifecycle.cumulative')}
        subtitle={t('lifecycle.cumulativeSub')}
        sql={marginSql}
        data={margins.data}
        loading={margins.loading}
        error={margins.error}
        ignoredNote={ignoredNote}
        fileName="cumulative-result-new-methods"
        height={360}
      >
        {(register) => <EChart option={cumOption} onReady={register} />}
      </ChartCard>

      <section aria-labelledby="lessons" className="space-y-3">
        <h2 id="lessons" className="text-sm font-semibold">
          {t('lifecycle.lessons')}
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {list.map((m) => {
            const info = methods.map.get(m.test_id);
            const be = info ? breakEven(info.params) : null;
            const total = totals.get(m.test_id) ?? 0;
            return (
              <article
                key={m.test_id}
                className={`rounded-xl border bg-surface p-4 text-sm ${isCancelled(m) ? 'border-critical/40' : 'border-good/40'}`}
              >
                <header className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{labels.test(m.test_id)}</h3>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      isCancelled(m) ? 'bg-critical/15 text-critical' : 'bg-good/15 text-good'
                    }`}
                  >
                    {isCancelled(m) ? '✕ ' : '✓ '}
                    {t(`lifecycle.category.${m.category}`)}
                  </span>
                </header>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-muted">{t('lifecycle.planned')}</dt>
                  <dd className="tabular text-right">
                    {f.num(m.planned)} / {t('frequency.month')}
                  </dd>
                  <dt className="text-muted">{t('lifecycle.actual')}</dt>
                  <dd className="tabular text-right font-semibold">
                    {f.num(m.actual)} / {t('frequency.month')}
                  </dd>
                  <dt className="text-muted">{t('lifecycle.modelBreakEven')}</dt>
                  <dd className="tabular text-right">
                    {be == null ? '∞' : `${f.num(be)} / ${t('frequency.month')}`}
                  </dd>
                  <dt className="text-muted">{t('lifecycle.result')}</dt>
                  <dd className={`tabular text-right font-semibold ${total < 0 ? 'text-critical' : ''}`}>
                    {f.czk(total)}
                  </dd>
                </dl>
                {be != null && (
                  <p className="mt-2 text-xs text-ink-2">
                    {m.planned >= be
                      ? t('lifecycle.planAbove', { pct: f.pct(m.planned / be - 1, 0) })
                      : t('lifecycle.planBelow')}{' '}
                    {m.actual < be
                      ? t('lifecycle.actualBelow', { pct: f.pct(m.actual / be, 0) })
                      : t('lifecycle.actualAbove')}
                  </p>
                )}
                {(lang === 'cs' ? m.reason_cs : m.reason_en) && (
                  <p className="mt-2 text-xs">
                    <span className="font-semibold">{t('lifecycle.reason')}: </span>
                    {lang === 'cs' ? m.reason_cs : m.reason_en}
                  </p>
                )}
                <p className="mt-2 text-xs text-ink-2">
                  <span className="font-semibold text-ink">{t('lifecycle.lesson')}: </span>
                  {lang === 'cs' ? m.lessons_cs : m.lessons_en}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
