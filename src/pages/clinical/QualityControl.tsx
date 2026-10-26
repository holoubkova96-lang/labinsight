import { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { useTranslation } from 'react-i18next';
import { ChartCard } from '../../components/charts/ChartCard';
import { axisStyle, baseOption, useChartTheme } from '../../components/charts/chartTheme';
import { EChart } from '../../components/charts/EChart';
import { DataTable } from '../../components/ui/DataTable';
import { KpiCard } from '../../components/ui/KpiCard';
import { Select } from '../../components/ui/Select';
import { useQuery } from '../../db/useQuery';
import { lit } from '../../db/where';
import { isRejected, westgard, type Rule } from '../../domain/westgard';
import { useFocusTest, useLabels, useTestMeta, useWhere } from '../../hooks/usePageData';
import { useFormat } from '../../i18n/format';

type Summary = {
  test_id: string;
  analyzer_id: string;
  n: number;
  cv_pct: number;
  bias_pct: number;
  n_13s: number;
  n_12s: number;
};
type Run = {
  t: number;
  run: string;
  level: number;
  value: number;
  target_mean: number;
  target_sd: number;
  z: number;
  lot_number: string;
};
type Violation = Run & { rules: string; id: number };

const DAY = 86_400_000;

export default function QualityControl() {
  const { t } = useTranslation();
  const f = useFormat();
  const theme = useChartTheme();
  const labels = useLabels();
  const meta = useTestMeta();
  const { where, ignoredNote } = useWhere('qc');
  const { test, setTest, testOptions } = useFocusTest('CREA', ['EGFR']);
  const [pickedAnalyzer, setPickedAnalyzer] = useState<string | null>(null);
  const dec = (meta.get(test)?.decimals ?? 1) + 1;

  const summarySql = `-- Souhrn QC za období: CV % (nepřesnost) a bias % (vychýlení od cílové hodnoty)
-- QC summary for the period: CV % (imprecision) and bias % (deviation from target)
WITH lvl AS (
  SELECT test_id, analyzer_id, level,
         count(*)                         AS n,
         avg(value)                       AS mean,
         stddev_samp(value)               AS sd,
         avg(target_mean)                 AS target,
         count(*) FILTER (WHERE abs(value - target_mean) > 3 * target_sd) AS n_13s,
         count(*) FILTER (WHERE abs(value - target_mean) > 2 * target_sd) AS n_12s
  FROM qc_wide
  WHERE ${where}
  GROUP BY ALL
)
SELECT test_id, analyzer_id,
       sum(n)                              AS n,
       avg(100 * sd / mean)                AS cv_pct,
       avg(100 * (mean - target) / target) AS bias_pct,
       sum(n_13s)                          AS n_13s,
       sum(n_12s)                          AS n_12s
FROM lvl
GROUP BY ALL
ORDER BY n_13s DESC, abs(bias_pct) DESC`;

  const summary = useQuery<Summary>(summarySql);
  const analyzers = useMemo(
    () => (summary.data ?? []).filter((r) => r.test_id === test).map((r) => r.analyzer_id),
    [summary.data, test],
  );
  const analyzer =
    pickedAnalyzer && analyzers.includes(pickedAnalyzer) ? pickedAnalyzer : (analyzers[0] ?? '');

  const runsSql = `-- Levey-Jenningsův graf: měření kontrol převedená na z-skóre
-- Levey-Jennings chart: control measurements converted to z-scores
SELECT epoch_ms(run_at)                         AS t,
       CAST(run_date AS VARCHAR)                AS run,
       level, value, target_mean, target_sd,
       (value - target_mean) / target_sd        AS z,
       lot_number
FROM qc_wide
WHERE test_id = ${lit(test)} AND analyzer_id = ${lit(analyzer)}
  AND ${where}
ORDER BY run_at, level`;
  const runs = useQuery<Run>(analyzer ? runsSql : null);

  // Westgardova pravidla se vyhodnocují v prohlížeči nad výsledkem dotazu
  const evaluated = useMemo(() => {
    const rows = runs.data ?? [];
    const rules = westgard(rows.map((r) => ({ t: r.t, level: r.level, z: r.z, run: r.run })));
    return rows.map((r, i) => ({ ...r, rules: rules[i] }));
  }, [runs.data]);
  const violations: Violation[] = evaluated
    .map((r, i) => ({ ...r, id: i, rules: r.rules.join(', ') }))
    .filter((r) => isRejected(r.rules.split(', ') as Rule[]))
    .reverse();
  const ruleCounts = evaluated.reduce<Record<string, number>>((acc, r) => {
    r.rules.forEach((x) => (acc[x] = (acc[x] ?? 0) + 1));
    return acc;
  }, {});

  const sel = (summary.data ?? []).find((r) => r.test_id === test && r.analyzer_id === analyzer);
  const lastT = evaluated.at(-1)?.t ?? 0;
  const firstT = evaluated[0]?.t ?? 0;

  const levelColor = [theme.series[0], theme.series[6]];
  const ljOption: EChartsOption = {
    ...baseOption(theme),
    grid: { left: 8, right: 56, top: 36, bottom: 48, containLabel: true },
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'item',
      formatter: (p: unknown) => {
        const { seriesIndex, dataIndex } = p as { seriesIndex: number; dataIndex: number };
        const levelRows = evaluated.filter((r) => r.level === seriesIndex + 1);
        const r = seriesIndex < 2 ? levelRows[dataIndex] : evaluated[(p as { data: number[] }).data[2]];
        if (!r) return '';
        return `<b>L${r.level}</b> · ${f.date(r.t)}<br/>${f.num(r.value, dec)} (${t('qc.target')} ${f.num(r.target_mean, dec)} ± ${f.num(r.target_sd, dec)})<br/>z = ${f.num(r.z, 2)}${r.rules.length ? `<br/><b>${r.rules.join(', ')}</b>` : ''}<br/><span style="opacity:.7">${t('qc.lot')} ${r.lot_number}</span>`;
      },
    },
    legend: { ...baseOption(theme).legend },
    xAxis: {
      type: 'time',
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, hideOverlap: true },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: (e: { min: number }) => Math.min(-4, Math.floor(e.min)),
      max: (e: { max: number }) => Math.max(4, Math.ceil(e.max)),
      interval: 1,
      ...axisStyle(theme),
      axisLabel: {
        ...axisStyle(theme).axisLabel,
        formatter: (v: number) => (v === 0 ? t('qc.mean') : `${v > 0 ? '+' : ''}${v} SD`),
      },
      splitLine: { show: false },
    },
    dataZoom: [
      { type: 'inside', startValue: Math.max(firstT, lastT - 90 * DAY), endValue: lastT },
      {
        type: 'slider',
        height: 18,
        bottom: 8,
        startValue: Math.max(firstT, lastT - 90 * DAY),
        endValue: lastT,
      },
    ],
    series: [
      ...[1, 2].map((level, i) => ({
        type: 'line' as const,
        name: `${t('qc.level')} ${level}`,
        color: levelColor[i],
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: { width: 1.5 },
        data: evaluated.filter((r) => r.level === level).map((r) => [r.t, r.z]),
        markArea:
          i === 0
            ? {
                silent: true,
                itemStyle: { color: theme.grid, opacity: 0.6 },
                data: [[{ yAxis: -2 }, { yAxis: 2 }] as [{ yAxis: number }, { yAxis: number }]],
              }
            : undefined,
        markLine:
          i === 0
            ? {
                symbol: 'none',
                silent: true,
                label: { position: 'end' as const, color: theme.muted, fontSize: 10, formatter: '{b}' },
                data: [
                  {
                    yAxis: 0,
                    name: t('qc.mean'),
                    lineStyle: { color: theme.text2, type: 'solid' as const, width: 1 },
                  },
                  ...[1, -1].map((v) => ({
                    yAxis: v,
                    name: `${v > 0 ? '+' : ''}${v}SD`,
                    lineStyle: { color: theme.border, type: 'dotted' as const },
                  })),
                  ...[2, -2].map((v) => ({
                    yAxis: v,
                    name: `${v > 0 ? '+' : ''}${v}SD`,
                    lineStyle: { color: theme.muted, type: 'dashed' as const },
                  })),
                  ...[3, -3].map((v) => ({
                    yAxis: v,
                    name: `${v > 0 ? '+' : ''}${v}SD`,
                    lineStyle: { color: theme.critical, type: 'solid' as const, width: 1 },
                  })),
                ],
              }
            : undefined,
      })),
      {
        type: 'scatter',
        name: t('qc.warning'),
        symbol: 'triangle',
        symbolSize: 10,
        color: theme.warning,
        itemStyle: { borderColor: theme.surface, borderWidth: 1 },
        z: 5,
        data: evaluated
          .map((r, i) => [r.t, r.z, i] as number[])
          .filter((d) => {
            const rules = evaluated[d[2]].rules;
            return rules.length > 0 && !isRejected(rules);
          }),
      },
      {
        type: 'scatter',
        name: t('qc.reject'),
        symbol: 'diamond',
        symbolSize: 12,
        color: theme.critical,
        itemStyle: { borderColor: theme.surface, borderWidth: 1 },
        z: 6,
        data: evaluated
          .map((r, i) => [r.t, r.z, i] as number[])
          .filter((d) => isRejected(evaluated[d[2]].rules)),
      },
    ],
  };

  const testSelect = (
    <Select
      label={t('results.test')}
      value={test}
      onChange={(v) => {
        setTest(v);
        setPickedAnalyzer(null);
      }}
      options={testOptions.map((o) => ({ value: o.value, label: o.label }))}
    />
  );
  const analyzerSelect = (
    <Select
      label={t('slicers.analyzers')}
      value={analyzer}
      onChange={setPickedAnalyzer}
      options={analyzers.map((a) => ({ value: a, label: labels.analyzer(a) }))}
    />
  );

  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t('pages.clinical.qc')}</h1>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3">
        {testSelect}
        {analyzerSelect}
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label={t('qc.runs')} value={f.num(sel?.n)} loading={summary.loading && !sel} />
        <KpiCard
          label={t('qc.cv')}
          info={t('glossary.cv')}
          value={sel ? `${f.num(sel.cv_pct, 2)} %` : '–'}
          loading={summary.loading && !sel}
        />
        <KpiCard
          label={t('qc.bias')}
          info={t('glossary.bias')}
          value={sel ? `${sel.bias_pct > 0 ? '+' : ''}${f.num(sel.bias_pct, 2)} %` : '–'}
          loading={summary.loading && !sel}
        />
        <KpiCard
          label={t('qc.rejections')}
          info={t('glossary.westgard')}
          value={f.num(violations.length)}
          sub={Object.entries(ruleCounts)
            .filter(([r]) => r !== '1-2s')
            .map(([r, n]) => `${r}: ${n}`)
            .join(' · ')}
          loading={runs.loading && !runs.data}
        />
      </div>
      <ChartCard
        title={t('qc.lj', { test: labels.test(test), analyzer: labels.analyzer(analyzer) })}
        subtitle={t('qc.ljSub')}
        info={t('glossary.leveyJennings')}
        sql={runsSql}
        data={runs.data}
        loading={runs.loading}
        error={runs.error}
        ignoredNote={ignoredNote}
        fileName={`levey-jennings-${test}-${analyzer}`}
        height={380}
      >
        {(register) => <EChart option={ljOption} onReady={register} />}
      </ChartCard>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title={t('qc.violations')}
          subtitle={t('qc.violationsSub')}
          sql={runsSql}
          data={violations as unknown as Run[]}
          loading={runs.loading}
          error={runs.error}
          fileName={`westgard-violations-${test}-${analyzer}`}
          height="auto"
          png={false}
        >
          {() => (
            <DataTable<Violation>
              rows={violations}
              columns={[
                { key: 't', label: t('qc.date'), render: (r) => f.date(r.t) },
                { key: 'level', label: t('qc.level'), render: (r) => `L${r.level}` },
                { key: 'value', label: t('qc.value'), align: 'right', render: (r) => f.num(r.value, dec) },
                { key: 'z', label: 'z', align: 'right', render: (r) => f.num(r.z, 2) },
                { key: 'rules', label: t('qc.rules') },
                { key: 'lot_number', label: t('qc.lot') },
              ]}
            />
          )}
        </ChartCard>
        <ChartCard
          title={t('qc.summary')}
          subtitle={t('qc.summarySub')}
          sql={summarySql}
          data={summary.data}
          loading={summary.loading}
          error={summary.error}
          ignoredNote={ignoredNote}
          fileName="qc-summary"
          height="auto"
          png={false}
        >
          {() => (
            <DataTable<Summary>
              rows={summary.data ?? []}
              isActive={(r) => r.test_id === test && r.analyzer_id === analyzer}
              onRowClick={(r) => {
                setTest(r.test_id);
                setPickedAnalyzer(r.analyzer_id);
              }}
              columns={[
                { key: 'test_id', label: t('slicers.tests'), render: (r) => labels.test(r.test_id) },
                {
                  key: 'analyzer_id',
                  label: t('slicers.analyzers'),
                  render: (r) => r.analyzer_id.replace('AN_', ''),
                },
                { key: 'cv_pct', label: 'CV %', align: 'right', render: (r) => f.num(r.cv_pct, 2) },
                { key: 'bias_pct', label: 'Bias %', align: 'right', render: (r) => f.num(r.bias_pct, 2) },
                { key: 'n_13s', label: '>3 SD', align: 'right', render: (r) => f.num(r.n_13s) },
                { key: 'n_12s', label: '>2 SD', align: 'right', render: (r) => f.num(r.n_12s) },
              ]}
            />
          )}
        </ChartCard>
      </div>
    </div>
  );
}
