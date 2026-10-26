import { useState } from 'react';
import type { EChartsOption } from 'echarts';
import { useTranslation } from 'react-i18next';
import { ChartCard } from '../../components/charts/ChartCard';
import { axisStyle, baseOption, useChartTheme } from '../../components/charts/chartTheme';
import { EChart } from '../../components/charts/EChart';
import { DataTable } from '../../components/ui/DataTable';
import { Select } from '../../components/ui/Select';
import { useQuery } from '../../db/useQuery';
import { buildWhere, lit } from '../../db/where';
import { DEFAULT_DELTA_LIMIT, DELTA_LIMITS, DELTA_WINDOW_DAYS, valuesSql } from '../../domain/retest';
import { useLabels, useTestMeta, useWhere } from '../../hooks/usePageData';
import { useFormat } from '../../i18n/format';

type PatientRow = { patient_id: string; sex: string; age_group: string; n_orders: number };
type Profile = {
  patient_id: string;
  sex: string;
  birth_year: number;
  age_group: string;
  district: string;
  insurer_code: string;
  orders: number;
  episodes: number;
  results: number;
  first_t: number | null;
  last_t: number | null;
  depts: string | null;
};
type TestCount = { test_id: string; n: number };
type Point = { test_id: string; t: number; value: number; flag: string };
type Ref = { test_id: string; ref_low: number | null; ref_high: number | null };
type Delta = {
  test_id: string;
  t: number;
  prev: number;
  value: number;
  rel: number;
  hours: number;
  max_rel: number;
};

const MAX_PANELS = 4;
const ID_PATTERN = /^P-\d{5}$/;

export default function Patient() {
  const { t } = useTranslation();
  const f = useFormat();
  const theme = useChartTheme();
  const labels = useLabels();
  const meta = useTestMeta();
  const { where, filters } = useWhere('results');
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [chosenTests, setChosenTests] = useState<string[] | null>(null);

  const listSql = `-- Pacienti s nejvíce žádankami (pseudonymizovaná ID)
-- Patients with the most orders (pseudonymised IDs)
SELECT patient_id, any_value(sex) AS sex, any_value(age_group) AS age_group,
       count(DISTINCT order_id) AS n_orders
FROM results_wide
WHERE ${where}
GROUP BY patient_id
ORDER BY n_orders DESC, patient_id
LIMIT 150`;
  const list = useQuery<PatientRow>(listSql);
  const patient = picked ?? list.data?.[0]?.patient_id ?? null;
  const pid = patient ? lit(patient) : "''";

  const rWhere = buildWhere(filters, 'results', 'r').sql;
  const profileSql = `SELECT p.patient_id, p.sex, p.birth_year, p.age_group, p.district, p.insurer_code,
       count(DISTINCT r.order_id)   AS orders,
       count(DISTINCT r.episode_id) AS episodes,
       count(r.result_id)           AS results,
       epoch_ms(min(r.collected_at)) AS first_t,
       epoch_ms(max(r.collected_at)) AS last_t,
       string_agg(DISTINCT r.dept_id, ',') AS depts
FROM dim_patients p
LEFT JOIN results_wide r ON r.patient_id = p.patient_id AND ${rWhere}
WHERE p.patient_id = ${pid}
GROUP BY ALL`;
  const profile = useQuery<Profile>(patient ? profileSql : null);
  const prof = profile.data?.[0];

  const testsSql = `SELECT test_id, count(*) AS n
FROM results_wide
WHERE patient_id = ${pid} AND value IS NOT NULL AND ${where}
GROUP BY test_id
ORDER BY n DESC, test_id`;
  const testCounts = useQuery<TestCount>(patient ? testsSql : null);
  const available = (testCounts.data ?? []).map((r) => r.test_id);
  const selected = (chosenTests ?? available.filter((x) => x !== 'EGFR').slice(0, MAX_PANELS)).filter((x) =>
    available.includes(x),
  );

  const seriesSql = `-- Vývoj výsledků pacienta v čase / patient's results over time
SELECT test_id, epoch_ms(collected_at) AS t, value, flag
FROM results_wide
WHERE patient_id = ${pid}
  AND test_id IN (${selected.map(lit).join(', ') || "''"})
  AND value IS NOT NULL AND ${where}
ORDER BY t`;
  const series = useQuery<Point>(patient && selected.length ? seriesSql : null);

  const refSql = `SELECT test_id, ref_low, ref_high FROM dim_reference_ranges
WHERE sex = ${lit(prof?.sex ?? 'F')} AND age_min = ${prof && prof.age_group === '0-17' ? 0 : 18}`;
  const refs = useQuery<Ref>(prof ? refSql : null);

  const deltaSql = `-- Delta check: změna proti předchozímu výsledku téhož testu do ${DELTA_WINDOW_DAYS} dnů
-- Delta check: change versus the previous result of the same test within ${DELTA_WINDOW_DAYS} days
WITH limits(test_id, max_rel) AS (VALUES ${valuesSql(DELTA_LIMITS)}),
s AS (
  SELECT test_id, collected_at, value,
         lag(value)        OVER w AS prev,
         lag(collected_at) OVER w AS prev_at
  FROM results_wide
  WHERE patient_id = ${pid} AND value IS NOT NULL AND test_id <> 'EGFR' AND ${where}
  WINDOW w AS (PARTITION BY test_id ORDER BY collected_at)
)
SELECT s.test_id, epoch_ms(collected_at) AS t, prev, value,
       (value - prev) / prev                     AS rel,
       date_diff('hour', prev_at, collected_at)  AS hours,
       coalesce(l.max_rel, ${DEFAULT_DELTA_LIMIT}) AS max_rel
FROM s LEFT JOIN limits l USING (test_id)
WHERE prev > 0
  AND collected_at - prev_at <= INTERVAL ${DELTA_WINDOW_DAYS} DAY
  AND abs((value - prev) / prev) > coalesce(l.max_rel, ${DEFAULT_DELTA_LIMIT})
ORDER BY t DESC`;
  const delta = useQuery<Delta>(patient ? deltaSql : null);

  // --- malé násobky: jeden panel na vyšetření, společná časová osa ---
  const pts = series.data ?? [];
  const n = Math.max(selected.length, 1);
  const panelH = 100 / n;
  const refOf = (id: string) => refs.data?.find((r) => r.test_id === id);
  const option: EChartsOption = {
    ...baseOption(theme),
    legend: { show: false },
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'item',
      formatter: (p: unknown) => {
        const { seriesIndex, data } = p as { seriesIndex: number; data: [number, number, string] };
        const id = selected[seriesIndex];
        return `<b>${labels.test(id)}</b><br/>${f.date(data[0])}<br/>${f.num(data[1], meta.get(id)?.decimals ?? 1)} ${meta.get(id)?.unit ?? ''} ${data[2] !== 'N' ? `(${data[2]})` : ''}`;
      },
    },
    title: selected.map((id, i) => ({
      text: `${labels.test(id)} (${meta.get(id)?.unit ?? ''})`,
      top: `${i * panelH + 1}%`,
      left: 8,
      textStyle: { fontSize: 12, fontWeight: 600, color: theme.text },
    })),
    grid: selected.map((_, i) => ({
      left: 56,
      right: 16,
      top: `${i * panelH + 7}%`,
      height: `${panelH - 13}%`,
    })),
    xAxis: selected.map((_, i) => ({
      type: 'time' as const,
      gridIndex: i,
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, show: i === n - 1, hideOverlap: true },
      splitLine: { show: false },
    })),
    yAxis: selected.map((_, i) => ({
      type: 'value' as const,
      gridIndex: i,
      scale: true,
      splitNumber: 3,
      ...axisStyle(theme),
    })),
    dataZoom: [{ type: 'inside', xAxisIndex: selected.map((_, i) => i) }],
    series: selected.map((id, i) => {
      const ref = refOf(id);
      return {
        type: 'line' as const,
        xAxisIndex: i,
        yAxisIndex: i,
        color: theme.series[0],
        symbolSize: 6,
        lineStyle: { width: 1.5 },
        data: pts
          .filter((p) => p.test_id === id)
          .map((p) => ({
            value: [p.t, p.value, p.flag],
            itemStyle:
              p.flag !== 'N' ? { color: p.flag.length === 2 ? theme.critical : theme.series[1] } : undefined,
          })),
        markArea:
          ref && ref.ref_high != null
            ? {
                silent: true,
                itemStyle: { color: theme.grid, opacity: 0.7 },
                data: [[{ yAxis: ref.ref_low ?? 0 }, { yAxis: ref.ref_high }]] as [
                  { yAxis: number },
                  { yAxis: number },
                ][],
              }
            : undefined,
      };
    }),
  };

  const goTyped = () => {
    const id = typed.trim().toUpperCase();
    if (ID_PATTERN.test(id)) {
      setPicked(id);
      setChosenTests(null);
    }
  };
  const toggleTest = (id: string) =>
    setChosenTests((cur) => {
      const base = cur ?? selected;
      if (base.includes(id)) return base.filter((x) => x !== id);
      return base.length >= MAX_PANELS ? [...base.slice(1), id] : [...base, id];
    });

  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t('pages.clinical.patient')}</h1>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-3">
        <Select
          label={t('patient.pick')}
          value={patient ?? ''}
          onChange={(v) => {
            setPicked(v);
            setChosenTests(null);
          }}
          options={(list.data ?? []).map((p) => ({
            value: p.patient_id,
            label: `${p.patient_id} · ${t(`values.sex.${p.sex}`)} · ${p.age_group} · ${t('patient.orders', { count: p.n_orders })}`,
          }))}
        />
        <form
          className="flex items-center gap-2 text-xs font-medium text-ink-2"
          onSubmit={(e) => {
            e.preventDefault();
            goTyped();
          }}
        >
          <label htmlFor="pid">{t('patient.byId')}</label>
          <input
            id="pid"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="P-00123"
            className="w-28 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
          />
          <button className="rounded-lg border border-line px-2.5 py-1.5 text-xs hover:bg-surface-2">
            {t('patient.show')}
          </button>
        </form>
        <p className="w-full text-xs text-muted">{t('patient.gdpr')}</p>
      </div>

      {prof && (
        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface p-4 text-sm sm:grid-cols-4 xl:grid-cols-8">
          {[
            [t('patient.id'), prof.patient_id],
            [t('slicers.sex'), t(`values.sex.${prof.sex}`)],
            [t('patient.birthYear'), String(prof.birth_year)],
            [t('slicers.payers'), prof.insurer_code],
            [t('patient.district'), prof.district],
            [t('patient.ordersEpisodes'), `${f.num(prof.orders)} / ${f.num(prof.episodes)}`],
            [t('patient.period'), prof.first_t ? `${f.date(prof.first_t)} – ${f.date(prof.last_t)}` : '–'],
            [
              t('slicers.depts'),
              (prof.depts ?? '')
                .split(',')
                .filter(Boolean)
                .map((d) => labels.dept(d))
                .join(', ') || '–',
            ],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="truncate font-medium" title={v}>
                {v}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <ChartCard
        title={t('patient.trend')}
        subtitle={t('patient.trendSub')}
        sql={seriesSql}
        data={series.data}
        loading={series.loading || testCounts.loading}
        error={series.error}
        fileName={`patient-${patient}-trend`}
        height={Math.max(220, selected.length * 170)}
        controls={
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('patient.tests')}>
            {available.map((id) => (
              <button
                key={id}
                aria-pressed={selected.includes(id)}
                onClick={() => toggleTest(id)}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${
                  selected.includes(id)
                    ? 'border-accent bg-accent-soft text-ink'
                    : 'border-line text-ink-2 hover:text-ink'
                }`}
              >
                {labels.test(id)}
              </button>
            ))}
          </div>
        }
      >
        {(register) => <EChart option={option} onReady={register} />}
      </ChartCard>

      <ChartCard
        title={t('patient.delta')}
        subtitle={t('patient.deltaSub', { days: DELTA_WINDOW_DAYS })}
        info={t('glossary.deltaCheck')}
        sql={deltaSql}
        data={delta.data}
        loading={delta.loading}
        error={delta.error}
        fileName={`patient-${patient}-delta-check`}
        height="auto"
        png={false}
      >
        {() => (
          <DataTable<Delta>
            rows={delta.data ?? []}
            columns={[
              { key: 't', label: t('qc.date'), render: (r) => f.date(r.t) },
              { key: 'test_id', label: t('slicers.tests'), render: (r) => labels.test(r.test_id) },
              { key: 'prev', label: t('patient.previous'), align: 'right', render: (r) => f.num(r.prev, 2) },
              { key: 'value', label: t('patient.current'), align: 'right', render: (r) => f.num(r.value, 2) },
              {
                key: 'rel',
                label: t('patient.change'),
                align: 'right',
                render: (r) => `${r.rel > 0 ? '+' : ''}${f.pct(r.rel, 0)}`,
              },
              {
                key: 'max_rel',
                label: t('patient.limit'),
                align: 'right',
                render: (r) => `±${f.pct(r.max_rel, 0)}`,
              },
              { key: 'hours', label: t('patient.hours'), align: 'right', render: (r) => f.num(r.hours) },
            ]}
          />
        )}
      </ChartCard>
    </div>
  );
}
