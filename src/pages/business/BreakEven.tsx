import { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { useTranslation } from 'react-i18next';
import { ChartCard } from '../../components/charts/ChartCard';
import { axisStyle, baseOption, useChartTheme } from '../../components/charts/chartTheme';
import { EChart } from '../../components/charts/EChart';
import { Icon } from '../../components/ui/Icon';
import { KpiCard } from '../../components/ui/KpiCard';
import { Select } from '../../components/ui/Select';
import {
  breakEven,
  monthly,
  paybackMonths,
  sensitivity,
  type MethodParams,
  type SensitivityKey,
} from '../../domain/costModel';
import { useLabels } from '../../hooks/usePageData';
import { useFormat } from '../../i18n/format';
import { PARAMS_SQL, useMethodParams } from './useMethodParams';

/** Šablona nové metody (fiktivní, realistické parametry speciální imunochemie). */
const NEW_METHOD: MethodParams = {
  points: 450,
  pointValue: 0.8,
  reagentCzk: 180,
  packSize: 50,
  stabilityDays: 14,
  qcPerDay: 2,
  qcCzk: 180,
  calPerMonth: 1,
  calCzk: 2500,
  ehkYearCzk: 12000,
  techMin: 5,
  uniMin: 1,
  leaseMonthCzk: 6000,
  overheadPerResult: 7.5,
  oneOffCzk: 120000,
};

type Field = { key: keyof MethodParams; step: number; unit: string; max?: number };
const GROUPS: { id: string; fields: Field[] }[] = [
  {
    id: 'revenue',
    fields: [
      { key: 'points', step: 1, unit: 'pts' },
      { key: 'pointValue', step: 0.01, unit: 'czk' },
    ],
  },
  {
    id: 'reagent',
    fields: [
      { key: 'reagentCzk', step: 1, unit: 'czk' },
      { key: 'packSize', step: 1, unit: '' },
      { key: 'stabilityDays', step: 1, unit: 'days' },
    ],
  },
  {
    id: 'quality',
    fields: [
      { key: 'qcPerDay', step: 1, unit: '' },
      { key: 'qcCzk', step: 1, unit: 'czk' },
      { key: 'calPerMonth', step: 0.5, unit: '' },
      { key: 'calCzk', step: 10, unit: 'czk' },
      { key: 'ehkYearCzk', step: 100, unit: 'czk' },
    ],
  },
  {
    id: 'fixed',
    fields: [
      { key: 'techMin', step: 0.1, unit: 'min' },
      { key: 'uniMin', step: 0.1, unit: 'min' },
      { key: 'leaseMonthCzk', step: 100, unit: 'czk' },
      { key: 'overheadPerResult', step: 0.5, unit: 'czk' },
      { key: 'oneOffCzk', step: 1000, unit: 'czk' },
    ],
  },
];
const TORNADO_KEYS: SensitivityKey[] = [
  'freq',
  'pointValue',
  'reagentCzk',
  'qcCzk',
  'stabilityDays',
  'packSize',
  'calCzk',
  'leaseMonthCzk',
  'techMin',
  'ehkYearCzk',
];
const COST_PARTS = [
  'variable',
  'expiry',
  'qc',
  'calibration',
  'ehk',
  'staff',
  'lease',
  'overhead',
  'amortization',
] as const;

export default function BreakEven() {
  const { t } = useTranslation();
  const f = useFormat();
  const theme = useChartTheme();
  const labels = useLabels();
  const methods = useMethodParams();
  const [preset, setPreset] = useState('NEW');
  const [params, setParams] = useState<MethodParams>(NEW_METHOD);
  const [freq, setFreq] = useState(60);

  const loadPreset = (id: string) => {
    setPreset(id);
    const m = methods.map.get(id);
    if (id === 'NEW' || !m) {
      setParams(NEW_METHOD);
      setFreq(60);
      return;
    }
    // u existující metody simulujeme „zavedení na jednom analyzátoru“
    setParams({ ...m.params, oneOffCzk: m.params.oneOffCzk || 80000 });
  };

  const result = useMemo(() => {
    const m = monthly(params, freq);
    const be = breakEven(params);
    const beOperating = breakEven(params, 20_000, false);
    const payback = paybackMonths(params, freq);
    const sens = sensitivity(params, freq, TORNADO_KEYS);
    return { m, be, beOperating, payback, sens };
  }, [params, freq]);
  const { m, be, beOperating, payback, sens } = result;
  const verdict = be == null ? 'no' : freq >= be * 1.2 ? 'yes' : freq >= be ? 'borderline' : 'no';
  const revPer = params.points * params.pointValue;

  // --- křivka nákladu na výsledek ---
  const grid = Array.from({ length: 90 }, (_, i) => Math.max(1, Math.round(10 ** ((i / 89) * 3.5))));
  const curveOption: EChartsOption = {
    ...baseOption(theme),
    grid: { left: 8, right: 24, top: 40, bottom: 32, containLabel: true },
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'axis',
      valueFormatter: (v) => f.czk(Number(v), 1),
    },
    xAxis: {
      type: 'log',
      ...axisStyle(theme),
      name: t('frequency.xAxis'),
      nameLocation: 'middle',
      nameGap: 26,
      axisLabel: { ...axisStyle(theme).axisLabel, formatter: (v: number) => f.num(v) },
    },
    yAxis: {
      type: 'log',
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, formatter: (v: number) => f.czk(v) },
    },
    series: [
      {
        type: 'line',
        name: t('frequency.costPer'),
        color: theme.series[1],
        showSymbol: false,
        lineStyle: { width: 2 },
        data: grid.map((x) => [x, monthly(params, x).costPerResult]),
        markLine: {
          symbol: 'none',
          silent: true,
          label: { color: theme.text2, fontSize: 11 },
          data: [
            {
              xAxis: freq,
              lineStyle: { color: theme.series[2], type: 'solid' },
              label: { formatter: t('breakeven.expected'), position: 'insideStartTop' },
            },
            ...(be
              ? [
                  {
                    xAxis: be,
                    lineStyle: { color: theme.text2, type: 'dashed' as const },
                    label: { formatter: `${t('frequency.breakEven')} ${f.num(be)}` },
                  },
                ]
              : []),
          ],
        },
      },
      {
        type: 'line',
        name: t('frequency.revPer'),
        color: theme.series[0],
        showSymbol: false,
        lineStyle: { width: 2 },
        data: grid.map((x) => [x, revPer]),
      },
    ],
  };

  // --- tornádo ---
  const sRows = [...sens.rows].reverse();
  const paramLabel = (k: SensitivityKey) => (k === 'freq' ? t('breakeven.freq') : t(`breakeven.field.${k}`));
  const tornadoOption: EChartsOption = {
    ...baseOption(theme),
    grid: { left: 8, right: 32, top: 36, bottom: 28, containLabel: true },
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (p: unknown) => {
        const r = sRows[(p as { dataIndex: number }[])[0].dataIndex];
        return `<b>${paramLabel(r.key)}</b><br/>−20 %: ${f.czk(r.low)}<br/>+20 %: ${f.czk(r.high)}<br/>${t('breakeven.base')}: ${f.czk(sens.base)}`;
      },
    },
    yAxis: { type: 'category', data: sRows.map((r) => paramLabel(r.key)), ...axisStyle(theme) },
    xAxis: {
      type: 'value',
      ...axisStyle(theme),
      name: t('breakeven.marginChange'),
      nameLocation: 'middle',
      nameGap: 28,
      axisLabel: {
        ...axisStyle(theme).axisLabel,
        hideOverlap: true,
        formatter: (v: number) => `${f.num(v / 1000)} ${t('units.kCzk')}`,
      },
    },
    series: [
      { name: '−20 %', key: 'low' as const, color: theme.series[1] },
      { name: '+20 %', key: 'high' as const, color: theme.series[0] },
    ].map((s) => ({
      type: 'bar' as const,
      name: s.name,
      color: s.color,
      stack: 'delta',
      barMaxWidth: 18,
      itemStyle: { borderRadius: 3 },
      data: sRows.map((r) => r[s.key] - sens.base),
    })),
  };

  // --- struktura měsíčních nákladů ---
  const parts = COST_PARTS.map((k) => ({ k, v: m[k] })).filter((p) => p.v > 0.5);
  const structureOption: EChartsOption = {
    ...baseOption(theme),
    legend: { show: false },
    grid: { left: 8, right: 72, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      ...baseOption(theme).tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v) => f.czk(Number(v)),
    },
    yAxis: {
      type: 'category',
      data: parts.map((p) => t(`breakeven.part.${p.k}`)),
      inverse: true,
      ...axisStyle(theme),
    },
    xAxis: {
      type: 'value',
      ...axisStyle(theme),
      axisLabel: { ...axisStyle(theme).axisLabel, formatter: (v: number) => f.czk(v) },
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
          formatter: (p) => f.pct(Number(p.value) / m.total, 0),
        },
        data: parts.map((p) => p.v),
      },
    ],
  };

  const presetOptions = [
    { value: 'NEW', label: t('breakeven.newMethod') },
    ...[...methods.map.keys()]
      .sort((a, b) => labels.test(a).localeCompare(labels.test(b)))
      .map((id) => ({ value: id, label: labels.test(id), group: t('breakeven.existing') })),
  ];
  const tableRows = [{ ...params, freq } as unknown as Record<string, number>];

  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t('pages.business.breakeven')}</h1>
      <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
        {/* --- formulář parametrů --- */}
        <section
          className="space-y-4 rounded-xl border border-line bg-surface p-4"
          aria-label={t('breakeven.form')}
        >
          <h2 className="text-sm font-semibold">{t('breakeven.form')}</h2>
          <Select
            label={t('breakeven.preset')}
            value={preset}
            onChange={loadPreset}
            options={presetOptions}
          />
          <label className="block text-xs font-medium text-ink-2">
            {t('breakeven.freq')}: <span className="tabular font-semibold text-ink">{f.num(freq)}</span> /{' '}
            {t('frequency.month')}
            <input
              type="range"
              min={1}
              max={1500}
              step={1}
              value={freq}
              onChange={(e) => setFreq(Number(e.target.value))}
              className="mt-1 w-full accent-[var(--accent)]"
            />
          </label>
          {GROUPS.map((g) => (
            <fieldset key={g.id} className="space-y-2">
              <legend className="mb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
                {t(`breakeven.group.${g.id}`)}
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {g.fields.map((fl) => (
                  <label key={fl.key} className="text-xs text-ink-2">
                    {t(`breakeven.field.${fl.key}`)}
                    <span className="mt-0.5 flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        step={fl.step}
                        value={Number(params[fl.key].toFixed(4))}
                        onChange={(e) => {
                          setPreset('CUSTOM');
                          setParams((p) => ({ ...p, [fl.key]: Math.max(0, Number(e.target.value) || 0) }));
                        }}
                        className="tabular w-full min-w-0 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-accent"
                      />
                      {fl.unit && <span className="text-muted">{t(`breakeven.unit.${fl.unit}`)}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <p className="text-xs text-muted">{t('breakeven.formNote')}</p>
        </section>

        {/* --- výsledky --- */}
        <div className="min-w-0 space-y-4">
          <div
            role="status"
            className={`flex items-start gap-3 rounded-xl border p-4 ${
              verdict === 'yes'
                ? 'border-good/50 bg-good/10'
                : verdict === 'borderline'
                  ? 'border-[var(--warning)]/60 bg-[var(--warning)]/10'
                  : 'border-critical/50 bg-critical/10'
            }`}
          >
            <Icon name={verdict === 'yes' ? 'check' : 'alert'} className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">{t(`breakeven.verdict.${verdict}`)}</p>
              <p className="mt-0.5 text-sm text-ink-2">
                {be == null
                  ? t('breakeven.verdictNever')
                  : t('breakeven.verdictText', {
                      be: f.num(be),
                      freq: f.num(freq),
                      ratio: f.pct(freq / be, 0),
                    })}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiCard
              label={t('breakeven.kpiBreakEven')}
              info={t('glossary.breakEven')}
              value={be == null ? '∞' : `${f.num(be)} / ${t('frequency.month')}`}
              sub={beOperating != null ? t('breakeven.withoutAmort', { n: f.num(beOperating) }) : undefined}
            />
            <KpiCard
              label={t('frequency.costPer')}
              value={f.czk(m.costPerResult, 1)}
              sub={t('breakeven.vsRevenue', { rev: f.czk(revPer, 1) })}
            />
            <KpiCard
              label={t('breakeven.monthlyMargin')}
              value={f.czk(m.margin)}
              sub={t('breakeven.yearly', { v: f.czk(m.margin * 12) })}
            />
            <KpiCard
              label={t('breakeven.payback')}
              info={t('glossary.payback')}
              value={payback == null ? '∞' : t('breakeven.months', { n: f.num(payback, 1) })}
            />
          </div>
          <ChartCard
            title={t('breakeven.curve')}
            subtitle={t('breakeven.curveSub')}
            sql={PARAMS_SQL}
            data={tableRows}
            loading={false}
            error={null}
            fileName="break-even-curve"
            height={320}
          >
            {(register) => <EChart option={curveOption} onReady={register} />}
          </ChartCard>
          <div className="grid gap-4 2xl:grid-cols-2">
            <ChartCard
              title={t('breakeven.tornado')}
              subtitle={t('breakeven.tornadoSub', { base: f.czk(sens.base) })}
              info={t('glossary.sensitivity')}
              sql={PARAMS_SQL}
              data={tableRows}
              loading={false}
              error={null}
              fileName="sensitivity-tornado"
              height={340}
            >
              {(register) => <EChart option={tornadoOption} onReady={register} />}
            </ChartCard>
            <ChartCard
              title={t('breakeven.structure')}
              subtitle={t('breakeven.structureSub', { total: f.czk(m.total) })}
              sql={PARAMS_SQL}
              data={tableRows}
              loading={false}
              error={null}
              fileName="cost-structure"
              height={340}
            >
              {(register) => <EChart option={structureOption} onReady={register} />}
            </ChartCard>
          </div>
        </div>
      </div>
    </div>
  );
}
