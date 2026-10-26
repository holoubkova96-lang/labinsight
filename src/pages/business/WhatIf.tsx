import { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import { useTranslation } from 'react-i18next';
import { ChartCard } from '../../components/charts/ChartCard';
import { axisStyle, baseOption, useChartTheme } from '../../components/charts/chartTheme';
import { EChart } from '../../components/charts/EChart';
import { waterfallOption } from '../../components/charts/waterfall';
import { KpiCard } from '../../components/ui/KpiCard';
import {
  COST_KEYS,
  NO_CHANGE,
  applyScenario,
  bridgeSteps,
  result,
  revenue,
  type Pnl,
  type Scenario,
} from '../../domain/pnl';
import { useFormat } from '../../i18n/format';
import { usePnl } from './usePnl';

const SLIDERS: { key: keyof Scenario; min: number; max: number }[] = [
  { key: 'pointValue', min: -0.2, max: 0.2 },
  { key: 'volume', min: -0.3, max: 0.3 },
  { key: 'reagentPrice', min: -0.2, max: 0.3 },
  { key: 'qcPrice', min: -0.2, max: 0.3 },
  { key: 'staffRate', min: -0.1, max: 0.3 },
];
const PRESETS: { id: string; s: Partial<Scenario> }[] = [
  { id: 'pointCut', s: { pointValue: -0.05 } },
  { id: 'inflation', s: { reagentPrice: 0.1, qcPrice: 0.1, staffRate: 0.08 } },
  { id: 'growth', s: { volume: 0.15 } },
  { id: 'austerity', s: { pointValue: -0.05, volume: -0.1 } },
];

export default function WhatIf() {
  const { t } = useTranslation();
  const f = useFormat();
  const theme = useChartTheme();
  const pnl = usePnl();
  const [s, setS] = useState<Scenario>(NO_CHANGE);

  // Roční báze: průměrný měsíc období × 12
  const base = useMemo<Pnl | null>(() => {
    const p = pnl.total;
    if (!p) return null;
    const k = 12 / p.months;
    return {
      revenueInsurance: p.revenueInsurance * k,
      revenueSelf: p.revenueSelf * k,
      reagents: p.reagents * k,
      qcCal: p.qcCal * k,
      expiry: p.expiry * k,
      staff: p.staff * k,
      service: p.service * k,
      other: p.other * k,
    };
  }, [pnl.total]);
  const scen = base ? applyScenario(base, s) : null;

  const label = (key: string) => t(`pnl.item.${key}`);
  const short = (v: number) => `${v > 0 ? '+' : ''}${f.num(v / 1e6, 2)}`;
  const bridge =
    base && scen
      ? waterfallOption(
          bridgeSteps(base, scen),
          theme,
          label,
          short,
          (v) => `${f.num(v / 1e6, 1)} ${t('units.mCzk')}`,
          (v) => f.czk(v),
        )
      : {};

  const compareOption: EChartsOption =
    base && scen
      ? {
          ...baseOption(theme),
          grid: { left: 8, right: 24, top: 36, bottom: 8, containLabel: true },
          tooltip: {
            ...baseOption(theme).tooltip,
            trigger: 'axis',
            axisPointer: { type: 'shadow' },
            valueFormatter: (v) => f.czk(Number(v)),
          },
          yAxis: {
            type: 'category',
            data: ['revenue', ...COST_KEYS].map(label),
            inverse: true,
            ...axisStyle(theme),
          },
          xAxis: {
            type: 'value',
            ...axisStyle(theme),
            axisLabel: {
              ...axisStyle(theme).axisLabel,
              hideOverlap: true,
              formatter: (v: number) => `${f.num(v / 1e6, 1)} ${t('units.mCzk')}`,
            },
          },
          series: [
            { name: t('whatif.base'), p: base, color: theme.muted },
            { name: t('whatif.scenario'), p: scen, color: theme.series[0] },
          ].map((x) => ({
            type: 'bar' as const,
            name: x.name,
            color: x.color,
            barMaxWidth: 10,
            itemStyle: { borderRadius: [0, 3, 3, 0] },
            data: [revenue(x.p), ...COST_KEYS.map((k) => x.p[k])],
          })),
        }
      : {};

  const delta = base && scen ? result(scen) - result(base) : 0;
  const loading = pnl.loading && !base;
  const pct = (v: number) => `${v > 0 ? '+' : ''}${f.pct(v, 0)}`;

  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t('pages.business.whatif')}</h1>
      <div className="grid gap-4 xl:grid-cols-[20rem_1fr]">
        <section
          className="space-y-4 rounded-xl border border-line bg-surface p-4"
          aria-label={t('whatif.controls')}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t('whatif.controls')}</h2>
            <button
              onClick={() => setS(NO_CHANGE)}
              className="rounded-md px-2 py-1 text-xs text-ink-2 hover:bg-surface-2"
            >
              {t('whatif.reset')}
            </button>
          </div>
          {SLIDERS.map((sl) => (
            <label key={sl.key} className="block text-xs font-medium text-ink-2">
              <span className="flex justify-between">
                {t(`whatif.lever.${sl.key}`)}
                <span className={`tabular font-semibold ${s[sl.key] === 0 ? 'text-muted' : 'text-ink'}`}>
                  {pct(s[sl.key])}
                </span>
              </span>
              <input
                type="range"
                min={sl.min * 100}
                max={sl.max * 100}
                step={1}
                value={Math.round(s[sl.key] * 100)}
                onChange={(e) => setS((cur) => ({ ...cur, [sl.key]: Number(e.target.value) / 100 }))}
                className="mt-1 w-full accent-[var(--accent)]"
              />
            </label>
          ))}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
              {t('whatif.presets')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setS({ ...NO_CHANGE, ...p.s })}
                  className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-2 hover:border-accent hover:text-ink"
                >
                  {t(`whatif.preset.${p.id}`)}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted">{t('whatif.note')}</p>
        </section>

        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiCard
              label={t('whatif.baseResult')}
              value={f.czk(base ? result(base) : null)}
              sub={base ? t('pnl.marginPct', { pct: f.pct(result(base) / revenue(base)) }) : undefined}
              loading={loading}
            />
            <KpiCard
              label={t('whatif.scenarioResult')}
              value={f.czk(scen ? result(scen) : null)}
              sub={scen ? t('pnl.marginPct', { pct: f.pct(result(scen) / revenue(scen)) }) : undefined}
              loading={loading}
            />
            <KpiCard
              label={t('whatif.impact')}
              value={`${delta > 0 ? '+' : ''}${f.czk(delta)}`}
              sub={t('whatif.perYear')}
              loading={loading}
            />
            <KpiCard
              label={t('whatif.breakEvenPointValue')}
              info={t('glossary.breakEvenPointValue')}
              value={
                base
                  ? pct(
                      -result(applyScenario(base, { ...s, pointValue: 0 })) /
                        (base.revenueInsurance * (1 + s.volume)),
                    )
                  : '–'
              }
              sub={t('whatif.breakEvenPointValueSub')}
              loading={loading}
            />
          </div>
          <ChartCard
            title={t('whatif.bridge')}
            subtitle={t('whatif.bridgeSub')}
            info={t('glossary.waterfall')}
            sql={pnl.sql}
            data={pnl.data}
            loading={pnl.loading}
            error={pnl.error}
            fileName="what-if-bridge"
            height={360}
          >
            {(register) => <EChart option={bridge} onReady={register} />}
          </ChartCard>
          <ChartCard
            title={t('whatif.compare')}
            subtitle={t('whatif.compareSub')}
            sql={pnl.sql}
            data={pnl.data}
            loading={pnl.loading}
            error={pnl.error}
            fileName="what-if-compare"
            height={320}
          >
            {(register) => <EChart option={compareOption} onReady={register} />}
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
