import { useState } from 'react';
import type { EChartsOption } from 'echarts';
import { useTranslation } from 'react-i18next';
import { ChartCard } from '../../components/charts/ChartCard';
import { axisStyle, baseOption, useChartTheme } from '../../components/charts/chartTheme';
import { EChart } from '../../components/charts/EChart';
import { KpiCard } from '../../components/ui/KpiCard';
import { Segmented } from '../../components/ui/Segmented';
import { Select } from '../../components/ui/Select';
import { lit } from '../../db/where';
import { useQuery } from '../../db/useQuery';
import { useFocusTest, useLabels, useTestMeta, useWhere } from '../../hooks/usePageData';
import { useFormat } from '../../i18n/format';

type Kpi = { n: number; med: number | null; low: number | null; high: number | null };
type Bin = { bin: number; lo: number; hi: number; n: number };
type Ref = { sex: string; ref_low: number | null; ref_high: number | null };
type Box = { k: string; n: number; p05: number; p25: number; p50: number; p75: number; p95: number };
type Oor = { test_id: string; n: number; low: number; high: number };
type BoxDim = 'dept_id' | 'sex' | 'age_group';

const BINS = 40;

export default function Results() {
  const { t } = useTranslation();
  const f = useFormat();
  const theme = useChartTheme();
  const labels = useLabels();
  const meta = useTestMeta();
  const { where, filters } = useWhere('results');
  const { test, setTest, testOptions } = useFocusTest('CREA');
  const [dim, setDim] = useState<BoxDim>('dept_id');
  const unit = meta.get(test)?.unit ?? '';
  const dec = meta.get(test)?.decimals ?? 1;
  const base = `test_id = ${lit(test)} AND value IS NOT NULL AND ${where}`;

  const kpiSql = `-- Souhrn vybraného vyšetření / summary of the selected test
SELECT count(*)                                         AS n,
       median(value)                                    AS med,
       avg(CASE WHEN flag IN ('L', 'LL') THEN 1 ELSE 0 END) AS low,
       avg(CASE WHEN flag IN ('H', 'HH') THEN 1 ELSE 0 END) AS high
FROM results_wide
WHERE ${base}`;

  const histSql = `-- Histogram: 40 košů mezi 0,5. a 99,5. percentilem (odlehlé hodnoty jdou do krajních košů)
-- Histogram: 40 bins between the 0.5th and 99.5th percentile (outliers fall into the edge bins)
WITH f AS (
  SELECT value FROM results_wide
  WHERE ${base}
),
r AS (
  SELECT quantile_cont(value, 0.005) AS lo, quantile_cont(value, 0.995) AS hi FROM f
)
SELECT least(greatest(floor((value - lo) / ((hi - lo) / ${BINS})), 0), ${BINS - 1})::INT AS bin,
       any_value(lo) AS lo, any_value(hi) AS hi, count(*) AS n
FROM f, r
GROUP BY bin
ORDER BY bin`;

  const refSql = `SELECT sex, ref_low, ref_high FROM dim_reference_ranges
WHERE test_id = ${lit(test)} AND age_min = 18`;

  const boxSql = `-- Rozložení hodnot podle ${dim}: whiskery = 5. a 95. percentil
-- Distribution by ${dim}: whiskers = 5th and 95th percentile
SELECT ${dim} AS k, count(*) AS n,
       quantile_cont(value, 0.05) AS p05, quantile_cont(value, 0.25) AS p25,
       quantile_cont(value, 0.50) AS p50, quantile_cont(value, 0.75) AS p75,
       quantile_cont(value, 0.95) AS p95
FROM results_wide
WHERE ${base}
GROUP BY ${dim}
HAVING count(*) >= 20
ORDER BY p50`;

  const oorSql = `-- Podíl výsledků pod a nad referenční mezí podle vyšetření
-- Share of results below and above the reference interval by test
SELECT test_id, count(*) AS n,
       avg(CASE WHEN flag IN ('L', 'LL') THEN 1 ELSE 0 END) AS low,
       avg(CASE WHEN flag IN ('H', 'HH') THEN 1 ELSE 0 END) AS high
FROM results_wide
WHERE value IS NOT NULL AND test_id <> 'EGFR' AND ${where}
GROUP BY test_id
HAVING count(*) >= 30
ORDER BY low + high DESC
LIMIT 20`;

  const kpi = useQuery<Kpi>(kpiSql);
  const hist = useQuery<Bin>(histSql);
  const ref = useQuery<Ref>(refSql);
  const box = useQuery<Box>(boxSql);
  const oor = useQuery<Oor>(oorSql);
  const k = kpi.data?.[0];

  // --- histogram s referenčním intervalem ---
  const bins = hist.data ?? [];
  const lo = bins[0]?.lo ?? 0;
  const width = bins.length ? (bins[0].hi - bins[0].lo) / BINS : 1;
  const binIndex = (v: number) => Math.min(Math.max((v - lo) / width, 0), BINS) - 0.5;
  const sexes = filters.sex.length === 1 ? filters.sex : ['M', 'F'];
  const refs = (ref.data ?? []).filter((r) => sexes.includes(r.sex));
  const sameRef =
    refs.length > 1 && refs.every((r) => r.ref_low === refs[0].ref_low && r.ref_high === refs[0].ref_high);
  const refLines = (sameRef ? refs.slice(0, 1) : refs).flatMap((r) =>
    (['ref_low', 'ref_high'] as const)
      .filter((key) => r[key] != null && r[key]! > 0)
      .map((key) => ({
        xAxis: binIndex(r[key]!),
        // svislý popisek podél čáry, aby se meze mužů a žen nepřekrývaly
        label: {
          formatter: `${refs.length > 1 && !sameRef ? t(`values.sex.${r.sex}`) + ' ' : ''}${f.num(r[key], dec)}`,
          color: theme.text2,
          position: 'insideEndTop' as const,
          fontSize: 10,
        },
      })),
  );
  const counts = Array.from({ length: BINS }, (_, i) => bins.find((b) => b.bin === i)?.n ?? 0);
  const histOption: EChartsOption = {
    ...baseOption(theme),
    legend: { show: false },
    grid: { left: 8, right: 16, top: 12, bottom: 8, containLabel: true },
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'axis',
      formatter: (p: unknown) => {
        const i = (p as { dataIndex: number }[])[0].dataIndex;
        return `${f.num(lo + i * width, dec)} – ${f.num(lo + (i + 1) * width, dec)} ${unit}<br/><b>${f.num(counts[i])}</b>`;
      },
    },
    xAxis: {
      type: 'category',
      data: counts.map((_, i) => f.num(lo + i * width, dec)),
      ...axisStyle(theme),
      splitLine: { show: false },
      name: unit,
      nameLocation: 'end',
      nameTextStyle: { color: theme.muted, fontSize: 11 },
    },
    yAxis: { type: 'value', ...axisStyle(theme) },
    series: [
      {
        type: 'bar',
        name: t('results.count'),
        data: counts,
        barCategoryGap: '8%',
        color: theme.series[0],
        itemStyle: { borderRadius: [3, 3, 0, 0] },
        markLine: {
          symbol: 'none',
          silent: true,
          lineStyle: { color: theme.text2, type: 'dashed', width: 1.5 },
          data: refLines,
        },
      },
    ],
  };

  // --- boxplot podle dimenze ---
  const boxes = box.data ?? [];
  const dimLabel = (v: string) =>
    dim === 'dept_id' ? labels.dept(v) : dim === 'sex' ? t(`values.sex.${v}`) : v;
  const boxOption: EChartsOption = {
    ...baseOption(theme),
    grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'item',
      formatter: (p: unknown) => {
        const b = boxes[(p as { dataIndex: number }).dataIndex];
        return `<b>${dimLabel(b.k)}</b> (n = ${f.num(b.n)})<br/>P95 ${f.num(b.p95, dec)}<br/>P75 ${f.num(b.p75, dec)}<br/>${t('results.median')} <b>${f.num(b.p50, dec)}</b><br/>P25 ${f.num(b.p25, dec)}<br/>P5 ${f.num(b.p05, dec)} ${unit}`;
      },
    },
    yAxis: {
      type: 'category',
      data: boxes.map((b) => dimLabel(b.k)),
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, width: 150, overflow: 'truncate' },
    },
    xAxis: {
      type: 'value',
      scale: true,
      ...axisStyle(theme),
      name: unit,
      nameTextStyle: { color: theme.muted },
    },
    series: [
      {
        type: 'boxplot',
        data: boxes.map((b) => [b.p05, b.p25, b.p50, b.p75, b.p95]),
        itemStyle: { color: theme.surface, borderColor: theme.series[0], borderWidth: 1.5 },
        boxWidth: [6, 18],
      },
    ],
  };

  // --- podíl mimo referenční meze podle vyšetření ---
  const oorRows = [...(oor.data ?? [])].reverse();
  const oorOption: EChartsOption = {
    ...baseOption(theme),
    grid: { left: 8, right: 24, top: 28, bottom: 8, containLabel: true },
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v) => f.pct(Number(v)),
    },
    yAxis: {
      type: 'category',
      data: oorRows.map((r) => labels.test(r.test_id)),
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, width: 150, overflow: 'truncate' },
    },
    xAxis: {
      type: 'value',
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, formatter: (v: number) => f.pct(v, 0) },
    },
    series: (['low', 'high'] as const).map((key, i) => ({
      type: 'bar' as const,
      name: t(`results.${key}`),
      stack: 'oor',
      color: theme.series[i],
      barMaxWidth: 16,
      itemStyle: { borderColor: theme.surface, borderWidth: 1, borderRadius: i === 1 ? [0, 3, 3, 0] : 0 },
      data: oorRows.map((r) => ({
        value: r[key],
        itemStyle: r.test_id === test ? { borderColor: theme.text, borderWidth: 1.5 } : undefined,
      })),
    })),
  };

  const testPicker = (
    <Select
      label={t('results.test')}
      value={test}
      onChange={setTest}
      options={testOptions.map((o) => ({ value: o.value, label: o.label }))}
    />
  );

  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t('pages.clinical.results')}</h1>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3">
        {testPicker}
        <span className="text-xs text-muted">{t('results.pickerHint')}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label={t('results.kpiN')} value={f.num(k?.n)} loading={kpi.loading && !k} />
        <KpiCard
          label={t('results.kpiMedian')}
          value={k?.med != null ? `${f.num(k.med, dec)} ${unit}` : '–'}
          loading={kpi.loading && !k}
        />
        <KpiCard
          label={t('results.kpiLow')}
          info={t('glossary.pathological')}
          value={f.pct(k?.low)}
          loading={kpi.loading && !k}
        />
        <KpiCard
          label={t('results.kpiHigh')}
          info={t('glossary.pathological')}
          value={f.pct(k?.high)}
          loading={kpi.loading && !k}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title={t('results.histogram', { test: labels.test(test) })}
          subtitle={t('results.histogramSub')}
          info={t('glossary.histogram')}
          sql={histSql}
          data={hist.data}
          loading={hist.loading}
          error={hist.error}
          fileName={`histogram-${test}`}
        >
          {(register) => <EChart option={histOption} onReady={register} />}
        </ChartCard>
        <ChartCard
          title={t('results.boxplot')}
          subtitle={t('results.boxplotSub')}
          info={t('glossary.boxplot')}
          sql={boxSql}
          data={box.data}
          loading={box.loading}
          error={box.error}
          fileName={`boxplot-${test}-${dim}`}
          height={dim === 'dept_id' ? 520 : 300}
          controls={
            <Segmented
              label={t('results.boxplotBy')}
              value={dim}
              onChange={setDim}
              options={[
                { value: 'dept_id', label: t('slicers.depts') },
                { value: 'sex', label: t('slicers.sex') },
                { value: 'age_group', label: t('slicers.ages') },
              ]}
            />
          }
        >
          {(register) => <EChart option={boxOption} onReady={register} />}
        </ChartCard>
      </div>
      <ChartCard
        title={t('results.outOfRange')}
        subtitle={t('results.outOfRangeSub')}
        sql={oorSql}
        data={oor.data}
        loading={oor.loading}
        error={oor.error}
        fileName="out-of-range-by-test"
        height={520}
      >
        {(register) => (
          <EChart
            option={oorOption}
            onReady={register}
            onItemClick={(p) => {
              const row = oorRows[p.dataIndex];
              if (row) setTest(row.test_id);
            }}
          />
        )}
      </ChartCard>
    </div>
  );
}
