import { useState } from 'react';
import type { EChartsOption } from 'echarts';
import { useTranslation } from 'react-i18next';
import { ChartCard } from '../../components/charts/ChartCard';
import { axisStyle, baseOption, useChartTheme } from '../../components/charts/chartTheme';
import { EChart } from '../../components/charts/EChart';
import { KpiCard } from '../../components/ui/KpiCard';
import { Segmented } from '../../components/ui/Segmented';
import { Select } from '../../components/ui/Select';
import { useQuery } from '../../db/useQuery';
import { lit } from '../../db/where';
import { useLabels, useTestMeta, useWhere } from '../../hooks/usePageData';
import { useFormat } from '../../i18n/format';
import { useUi } from '../../store/ui';

type Stats = {
  n: number;
  pearson: number | null;
  spearman: number | null;
  slope: number | null;
  intercept: number | null;
  r2: number | null;
};
type Pt = { x: number; y: number };
type Scale = 'log' | 'linear';

/** Analyty v korelační matici (časté a klinicky propojené). */
const MATRIX = [
  'NA',
  'K',
  'UREA',
  'CREA',
  'GLU',
  'ALT',
  'AST',
  'GGT',
  'BILI',
  'ALB',
  'CRP',
  'PCT',
  'TNT',
  'NTPROBNP',
  'KO_DIF',
  'FBG',
];
const SAMPLE = 3000;

export default function Correlation() {
  const { t } = useTranslation();
  const f = useFormat();
  const theme = useChartTheme();
  const dark = useUi((s) => s.theme) === 'dark';
  const labels = useLabels();
  const meta = useTestMeta();
  const { where } = useWhere('results');
  const [x, setX] = useState('CREA');
  const [y, setY] = useState('UREA');
  const [scale, setScale] = useState<Scale>('log');
  const tf = (c: string) => (scale === 'log' ? `ln(${c})` : c);

  // Dvojice výsledků ze stejného vzorku (žádanky)
  const pairs = `WITH p AS (  -- páry X a Y ze stejné žádanky / X–Y pairs from the same order
  SELECT order_id,
         max(value) FILTER (WHERE test_id = ${lit(x)}) AS x,
         max(value) FILTER (WHERE test_id = ${lit(y)}) AS y
  FROM results_wide
  WHERE test_id IN (${lit(x)}, ${lit(y)}) AND value > 0 AND ${where}
  GROUP BY order_id
  HAVING x IS NOT NULL AND y IS NOT NULL
)`;

  const statsSql = `${pairs}
SELECT count(*)                                AS n,
       corr(${tf('x')}, ${tf('y')})            AS pearson,
       (SELECT corr(rx, ry) FROM (              -- Spearman = Pearson na pořadích
          SELECT rank() OVER (ORDER BY x) AS rx, rank() OVER (ORDER BY y) AS ry FROM p))
                                               AS spearman,
       regr_slope(${tf('y')}, ${tf('x')})      AS slope,      -- lineární regrese y = a + b·x
       regr_intercept(${tf('y')}, ${tf('x')})  AS intercept,
       regr_r2(${tf('y')}, ${tf('x')})         AS r2
FROM p`;

  const pointsSql = `${pairs}
-- náhodný vzorek ${SAMPLE} bodů, aby graf zůstal čitelný / random sample to keep the chart readable
SELECT x, y FROM p USING SAMPLE reservoir(${SAMPLE} ROWS) REPEATABLE (42)`;

  const pairsList = MATRIX.flatMap((a, i) => MATRIX.slice(i + 1).map((b) => [a, b]));
  const matrixSql = `-- Korelační matice (Pearson na logaritmech hodnot ze stejné žádanky)
-- Correlation matrix (Pearson on log values from the same order)
WITH w AS (
  PIVOT (
    SELECT order_id, test_id, ln(value) AS v
    FROM results_wide
    WHERE value > 0 AND test_id IN (${MATRIX.map(lit).join(', ')}) AND ${where}
  ) ON test_id USING max(v) GROUP BY order_id
)
SELECT
  ${pairsList.map(([a, b]) => `corr("${a}", "${b}") AS "${a}|${b}"`).join(',\n  ')}
FROM w`;

  const stats = useQuery<Stats>(statsSql);
  const points = useQuery<Pt>(pointsSql);
  const matrix = useQuery<Record<string, number | null>>(matrixSql);
  const s = stats.data?.[0];
  const ux = meta.get(x)?.unit ?? '';
  const uy = meta.get(y)?.unit ?? '';

  // Regresní přímka; v log škále y = e^a · x^b
  const pts = points.data ?? [];
  const xs = pts.map((p) => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const fit = (v: number) =>
    s?.slope == null || s.intercept == null
      ? null
      : scale === 'log'
        ? Math.exp(s.intercept) * v ** s.slope
        : s.intercept + s.slope * v;
  const line = pts.length
    ? Array.from({ length: 40 }, (_, i) => {
        const v = scale === 'log' ? xMin * (xMax / xMin) ** (i / 39) : xMin + ((xMax - xMin) * i) / 39;
        return [v, fit(v)];
      })
    : [];

  const scatterOption: EChartsOption = {
    ...baseOption(theme),
    grid: { left: 8, right: 24, top: 36, bottom: 32, containLabel: true },
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'item',
      formatter: (p: unknown) => {
        const [vx, vy] = (p as { data: number[] }).data;
        return `${labels.test(x)}: ${f.num(vx, 2)} ${ux}<br/>${labels.test(y)}: ${f.num(vy, 2)} ${uy}`;
      },
    },
    xAxis: {
      type: scale === 'log' ? 'log' : 'value',
      scale: true,
      ...axisStyle(theme),
      name: `${labels.test(x)} (${ux})`,
      nameLocation: 'middle',
      nameGap: 26,
    },
    yAxis: {
      type: scale === 'log' ? 'log' : 'value',
      scale: true,
      ...axisStyle(theme),
      name: `${labels.test(y)} (${uy})`,
      nameLocation: 'middle',
      nameGap: 40,
      nameTextStyle: { color: theme.muted },
    },
    series: [
      {
        type: 'scatter',
        name: t('correlation.samples'),
        symbolSize: 5,
        color: theme.series[0],
        itemStyle: { opacity: 0.45 },
        data: pts.map((p) => [p.x, p.y]),
      },
      {
        type: 'line',
        name: t('correlation.regression'),
        showSymbol: false,
        silent: true,
        color: theme.series[1],
        lineStyle: { width: 2 },
        data: line,
      },
    ],
  };

  // --- korelační matice ---
  const row = matrix.data?.[0] ?? {};
  const cells: [number, number, number | null][] = [];
  MATRIX.forEach((a, i) =>
    MATRIX.forEach((b, j) => {
      const v = i === j ? 1 : (row[`${a}|${b}`] ?? row[`${b}|${a}`] ?? null);
      cells.push([j, i, v == null ? null : Math.round(v * 100) / 100]);
    }),
  );
  // divergentní škála: modrá (záporná) – šedý střed – červená (kladná)
  const diverging = dark
    ? ['#3987e5', '#1c5cab', '#383835', '#a63a3a', '#e66767']
    : ['#184f95', '#86b6ef', '#f0efec', '#f2a3a2', '#b42d2d'];
  const matrixOption: EChartsOption = {
    ...baseOption(theme),
    grid: { left: 8, right: 16, top: 8, bottom: 64, containLabel: true },
    tooltip: {
      ...baseOption(theme).tooltip,
      formatter: (p: unknown) => {
        const [j, i, v] = (p as { data: [number, number, number | null] }).data;
        return `${labels.test(MATRIX[i])} × ${labels.test(MATRIX[j])}<br/>r = <b>${v == null ? '–' : f.num(v, 2)}</b>`;
      },
    },
    xAxis: {
      type: 'category',
      data: MATRIX,
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, rotate: 45, interval: 0 },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'category',
      data: MATRIX,
      inverse: true,
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, interval: 0 },
      splitLine: { show: false },
    },
    visualMap: {
      min: -1,
      max: 1,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemHeight: 160,
      itemWidth: 10,
      calculable: false,
      text: ['+1', '−1'],
      textStyle: { color: theme.muted },
      inRange: { color: diverging },
    },
    series: [
      {
        type: 'heatmap',
        data: cells,
        label: {
          show: true,
          fontSize: 9,
          color: theme.text,
          formatter: (p) => {
            const v = (p.data as number[])[2];
            return v == null || Math.abs(v) < 0.3 ? '' : f.num(v, 1);
          },
        },
        itemStyle: { borderColor: theme.surface, borderWidth: 1.5 },
      },
    ],
  };

  const testOptions = labels.options.tests.map((o) => ({ value: o.value, label: o.label }));
  const strength = (r: number | null | undefined) =>
    r == null
      ? ''
      : t(
          `correlation.strength.${Math.abs(r) >= 0.7 ? 'strong' : Math.abs(r) >= 0.4 ? 'moderate' : Math.abs(r) >= 0.2 ? 'weak' : 'none'}`,
        );

  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t('pages.clinical.correlation')}</h1>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-3">
        <Select label="X" value={x} onChange={setX} options={testOptions} />
        <Select label="Y" value={y} onChange={setY} options={testOptions} />
        <Segmented
          label={t('correlation.scale')}
          value={scale}
          onChange={setScale}
          options={[
            { value: 'log', label: t('correlation.log') },
            { value: 'linear', label: t('correlation.linear') },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label={t('correlation.pairs')} value={f.num(s?.n)} loading={stats.loading && !s} />
        <KpiCard
          label={t('correlation.pearson')}
          info={t('glossary.pearson')}
          value={f.num(s?.pearson, 2)}
          sub={strength(s?.pearson)}
          loading={stats.loading && !s}
        />
        <KpiCard
          label={t('correlation.spearman')}
          info={t('glossary.spearman')}
          value={f.num(s?.spearman, 2)}
          sub={strength(s?.spearman)}
          loading={stats.loading && !s}
        />
        <KpiCard label="R²" info={t('glossary.r2')} value={f.num(s?.r2, 2)} loading={stats.loading && !s} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title={t('correlation.scatter', { x: labels.test(x), y: labels.test(y) })}
          subtitle={t('correlation.scatterSub', { n: SAMPLE })}
          sql={`${statsSql};\n\n${pointsSql}`}
          data={points.data}
          loading={points.loading}
          error={points.error}
          fileName={`scatter-${x}-${y}`}
          height={420}
        >
          {(register) => <EChart option={scatterOption} onReady={register} />}
        </ChartCard>
        <ChartCard
          title={t('correlation.matrix')}
          subtitle={t('correlation.matrixSub')}
          sql={matrixSql}
          data={matrix.data}
          loading={matrix.loading}
          error={matrix.error}
          fileName="correlation-matrix"
          height={420}
        >
          {(register) => (
            <EChart
              option={matrixOption}
              onReady={register}
              onItemClick={(p) => {
                const [j, i] = p.data as number[];
                if (i !== j) {
                  setX(MATRIX[j]);
                  setY(MATRIX[i]);
                }
              }}
            />
          )}
        </ChartCard>
      </div>
    </div>
  );
}
