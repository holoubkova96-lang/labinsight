import type { EChartsOption } from 'echarts';
import { useTranslation } from 'react-i18next';
import { ChartCard } from '../../components/charts/ChartCard';
import { axisStyle, baseOption, useChartTheme } from '../../components/charts/chartTheme';
import { EChart } from '../../components/charts/EChart';
import { KpiCard } from '../../components/ui/KpiCard';
import { useQuery } from '../../db/useQuery';
import { useWhere } from '../../hooks/usePageData';
import { useFormat } from '../../i18n/format';
import { useFilters } from '../../store/filters';

type Cell = { dow: number; h: number; n: number };
type Ecdf = { priority: string; m: number; n: number };
type Phase = {
  priority: string;
  transport: number;
  lab: number;
  validation: number;
  total: number;
  p90: number;
};
type Flow = { priority: string; sample_issue: string; outcome: string; n: number };

const MAX_MIN = 480; // ECDF do 8 hodin

export default function Tat() {
  const { t } = useTranslation();
  const f = useFormat();
  const theme = useChartTheme();
  const crossFilter = useFilters((s) => s.crossFilter);
  const { where } = useWhere('results');

  // TAT se počítá na úrovni žádanky: odběr → validace posledního výsledku
  const orderTat = `WITH o AS (  -- jedna žádanka = jeden vzorek / one order = one sample
  SELECT order_id, priority,
         min(collected_at) AS collected, min(received_at) AS received,
         min(analyzed_at)  AS analyzed,  max(validated_at) AS validated
  FROM results_wide
  WHERE validated_at IS NOT NULL AND ${where}
  GROUP BY order_id, priority
)`;

  const heatSql = `-- Zatížení laboratoře: příjem vzorků podle dne v týdnu a hodiny
-- Laboratory workload: samples received by weekday and hour
SELECT isodow(received_at) AS dow, hour(received_at) AS h, count(DISTINCT order_id) AS n
FROM results_wide
WHERE ${where}
GROUP BY ALL`;

  const phaseSql = `${orderTat}
-- medián jednotlivých fází a celkový TAT / median of each phase and total TAT
SELECT priority,
       median(date_diff('second', collected, received)) / 60  AS transport,
       median(date_diff('second', received, analyzed)) / 60   AS lab,
       median(date_diff('second', analyzed, validated)) / 60  AS validation,
       median(date_diff('second', collected, validated)) / 60 AS total,
       quantile_cont(date_diff('second', collected, validated) / 60, 0.9) AS p90
FROM o
GROUP BY priority`;

  const ecdfSql = `${orderTat}
-- kumulativní rozdělení TAT po 5 minutách / cumulative TAT distribution in 5-minute steps
SELECT priority,
       least(ceil(date_diff('second', collected, validated) / 300.0) * 5, ${MAX_MIN + 5})::INT AS m,
       count(*) AS n
FROM o
GROUP BY ALL
ORDER BY priority, m`;

  const flowSql = `-- Cesta výsledku: priorita → stav vzorku → výsledek
-- Result path: priority → sample condition → outcome
SELECT priority, sample_issue,
       CASE WHEN value IS NULL       THEN 'NOT_REPORTED'
            WHEN is_critical         THEN 'CRITICAL'
            WHEN flag IN ('L', 'H')  THEN 'ABNORMAL'
            ELSE 'NORMAL' END        AS outcome,
       count(*) AS n
FROM results_wide
WHERE ${where}
GROUP BY ALL`;

  const heat = useQuery<Cell>(heatSql);
  const phase = useQuery<Phase>(phaseSql);
  const ecdf = useQuery<Ecdf>(ecdfSql);
  const flow = useQuery<Flow>(flowSql);
  const stat = phase.data?.find((p) => p.priority === 'STAT');
  const routine = phase.data?.find((p) => p.priority === 'ROUTINE');

  // --- heatmapa den × hodina ---
  const days = [1, 2, 3, 4, 5, 6, 7].map((d) => t(`tat.dow.${d}`));
  const cells = heat.data ?? [];
  const maxN = Math.max(1, ...cells.map((c) => c.n));
  const heatOption: EChartsOption = {
    ...baseOption(theme),
    grid: { left: 8, right: 16, top: 8, bottom: 56, containLabel: true },
    tooltip: {
      ...baseOption(theme).tooltip,
      formatter: (p: unknown) => {
        const [h, d, n] = (p as { data: number[] }).data;
        return `${days[d]} ${h}:00–${h + 1}:00<br/><b>${f.num(n)}</b> ${t('tat.samples')}`;
      },
    },
    xAxis: {
      type: 'category',
      data: Array.from({ length: 24 }, (_, h) => String(h)),
      ...axisStyle(theme),
      splitLine: { show: false },
      name: t('tat.hour'),
      nameLocation: 'middle',
      nameGap: 24,
    },
    yAxis: { type: 'category', data: days, inverse: true, ...axisStyle(theme), splitLine: { show: false } },
    visualMap: {
      min: 0,
      max: maxN,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemHeight: 160,
      itemWidth: 10,
      textStyle: { color: theme.muted, fontSize: 11 },
      // sekvenční škála jednoho odstínu: světlá = málo, tmavá = hodně
      inRange: { color: theme.sequential },
    },
    series: [
      {
        type: 'heatmap',
        data: cells.map((c) => [c.h, c.dow - 1, c.n]),
        itemStyle: { borderColor: theme.surface, borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { borderColor: theme.text, borderWidth: 1 } },
      },
    ],
  };

  // --- kumulativní distribuce TAT (ECDF) ---
  const ecdfSeries = (['STAT', 'ROUTINE'] as const).map((prio, i) => {
    const rows = (ecdf.data ?? []).filter((r) => r.priority === prio);
    const total = rows.reduce((s, r) => s + r.n, 0) || 1;
    let cum = 0;
    const pts = rows.filter((r) => r.m <= MAX_MIN).map((r) => [r.m, (cum += r.n) / total]);
    return {
      type: 'line' as const,
      name: t(`values.priority.${prio}`),
      color: theme.series[i === 0 ? 1 : 0],
      showSymbol: false,
      step: 'end' as const,
      lineStyle: { width: 2 },
      data: pts,
      markLine:
        i === 0
          ? {
              symbol: 'none',
              silent: true,
              lineStyle: { color: theme.text2, type: 'dashed' as const },
              label: { color: theme.text2, formatter: '{b}' },
              data: [
                { xAxis: 60, name: '60 min' },
                { xAxis: 240, name: '4 h' },
              ],
            }
          : undefined,
    };
  });
  const ecdfOption: EChartsOption = {
    ...baseOption(theme),
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'axis',
      valueFormatter: (v) => f.pct(Number(v)),
      axisPointer: { type: 'line' },
    },
    xAxis: {
      type: 'value',
      max: MAX_MIN,
      interval: 60,
      ...axisStyle(theme),
      name: t('tat.minutes'),
      nameLocation: 'middle',
      nameGap: 24,
    },
    yAxis: {
      type: 'value',
      max: 1,
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, formatter: (v: number) => f.pct(v, 0) },
    },
    series: ecdfSeries,
  };

  // --- fáze TAT ---
  const phases = (['transport', 'lab', 'validation'] as const).map((key, i) => ({
    type: 'bar' as const,
    name: t(`tat.phase.${key}`),
    stack: 'tat',
    color: theme.series[[0, 2, 6][i]],
    barMaxWidth: 26,
    itemStyle: { borderColor: theme.surface, borderWidth: 1, borderRadius: i === 2 ? [0, 4, 4, 0] : 0 },
    label: {
      show: true,
      color: '#fff',
      fontSize: 11,
      formatter: (p: { value: unknown }) => f.num(Number(p.value), 0),
    },
    data: (['STAT', 'ROUTINE'] as const).map((p) => phase.data?.find((r) => r.priority === p)?.[key] ?? 0),
  }));
  const phaseOption: EChartsOption = {
    ...baseOption(theme),
    grid: { left: 8, right: 24, top: 36, bottom: 8, containLabel: true },
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v) => `${f.num(Number(v), 0)} min`,
    },
    yAxis: {
      type: 'category',
      data: [t('values.priority.STAT'), t('values.priority.ROUTINE')],
      ...axisStyle(theme),
    },
    xAxis: { type: 'value', ...axisStyle(theme), name: 'min', nameTextStyle: { color: theme.muted } },
    series: phases,
  };

  // --- Sankey: cesta výsledku ---
  const flows = flow.data ?? [];
  const nodeName = {
    prio: (v: string) => t(`values.priority.${v}`),
    issue: (v: string) => t(`tat.issue.${v}`),
    outcome: (v: string) => t(`tat.outcome.${v}`),
  };
  const linkMap = new Map<string, number>();
  for (const r of flows) {
    const a = `${nodeName.prio(r.priority)}|${nodeName.issue(r.sample_issue)}`;
    const b = `${nodeName.issue(r.sample_issue)}|${nodeName.outcome(r.outcome)}`;
    linkMap.set(a, (linkMap.get(a) ?? 0) + r.n);
    linkMap.set(b, (linkMap.get(b) ?? 0) + r.n);
  }
  const links = [...linkMap].map(([k, value]) => {
    const [source, target] = k.split('|');
    return { source, target, value };
  });
  // pevné barvy uzlů podle významu (ne podle pořadí), stav „kritické“ ve stavové barvě
  const nodeColor: Record<string, string> = {
    [nodeName.prio('STAT')]: theme.series[1],
    [nodeName.prio('ROUTINE')]: theme.series[0],
    [nodeName.issue('NONE')]: theme.muted,
    [nodeName.issue('HEMOLYSIS')]: theme.series[4],
    [nodeName.issue('CLOT')]: theme.series[6],
    [nodeName.issue('INSUFFICIENT')]: theme.series[3],
    [nodeName.outcome('NORMAL')]: theme.series[2],
    [nodeName.outcome('ABNORMAL')]: theme.series[5],
    [nodeName.outcome('CRITICAL')]: theme.critical,
    [nodeName.outcome('NOT_REPORTED')]: theme.muted,
  };
  const nodes = [...new Set(links.flatMap((l) => [l.source, l.target]))].map((name) => ({
    name,
    itemStyle: { color: nodeColor[name] ?? theme.muted },
  }));
  const sankeyOption: EChartsOption = {
    ...baseOption(theme),
    tooltip: { ...baseOption(theme).tooltip, trigger: 'item', valueFormatter: (v) => f.num(Number(v)) },
    series: [
      {
        type: 'sankey',
        left: 8,
        right: 120,
        top: 8,
        bottom: 8,
        nodeGap: 14,
        nodeWidth: 14,
        emphasis: { focus: 'adjacency' },
        lineStyle: { color: 'gradient', opacity: 0.35, curveness: 0.5 },
        label: {
          color: theme.text,
          fontSize: 12,
          formatter: (p: { name: string; value: unknown }) => `${p.name}  ${f.num(Number(p.value))}`,
        },
        data: nodes,
        links,
      },
    ],
  };

  const mins = (v: number | undefined) => (v != null ? t('kpi.minutes', { value: f.num(v, 0) }) : '–');
  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t('pages.clinical.tat')}</h1>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label={t('kpi.tatStat')}
          info={t('glossary.tat')}
          value={mins(stat?.total)}
          loading={phase.loading && !stat}
        />
        <KpiCard
          label={t('tat.p90Stat')}
          info={t('glossary.percentile')}
          value={mins(stat?.p90)}
          loading={phase.loading && !stat}
        />
        <KpiCard
          label={t('kpi.tatRoutine')}
          info={t('glossary.tat')}
          value={mins(routine?.total)}
          loading={phase.loading && !routine}
        />
        <KpiCard
          label={t('tat.p90Routine')}
          info={t('glossary.percentile')}
          value={mins(routine?.p90)}
          loading={phase.loading && !routine}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title={t('tat.heatmap')}
          subtitle={t('tat.heatmapSub')}
          sql={heatSql}
          data={heat.data}
          loading={heat.loading}
          error={heat.error}
          fileName="workload-heatmap"
          height={320}
        >
          {(register) => <EChart option={heatOption} onReady={register} />}
        </ChartCard>
        <ChartCard
          title={t('tat.ecdf')}
          subtitle={t('tat.ecdfSub')}
          info={t('glossary.ecdf')}
          sql={ecdfSql}
          data={ecdf.data}
          loading={ecdf.loading}
          error={ecdf.error}
          fileName="tat-cumulative"
          height={320}
        >
          {(register) => <EChart option={ecdfOption} onReady={register} />}
        </ChartCard>
      </div>
      <ChartCard
        title={t('tat.phases')}
        subtitle={t('tat.phasesSub')}
        sql={phaseSql}
        data={phase.data}
        loading={phase.loading}
        error={phase.error}
        fileName="tat-phases"
        height={200}
      >
        {(register) => (
          <EChart
            option={phaseOption}
            onReady={register}
            onItemClick={(p) => crossFilter('priority', p.dataIndex === 0 ? 'STAT' : 'ROUTINE')}
          />
        )}
      </ChartCard>
      <ChartCard
        title={t('tat.sankey')}
        subtitle={t('tat.sankeySub')}
        info={t('glossary.sankey')}
        sql={flowSql}
        data={flow.data}
        loading={flow.loading}
        error={flow.error}
        fileName="sample-flow-sankey"
        height={380}
      >
        {(register) => <EChart option={sankeyOption} onReady={register} />}
      </ChartCard>
    </div>
  );
}
