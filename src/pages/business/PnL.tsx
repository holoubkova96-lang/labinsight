import { useTranslation } from 'react-i18next';
import { ChartCard } from '../../components/charts/ChartCard';
import { useChartTheme } from '../../components/charts/chartTheme';
import { EChart } from '../../components/charts/EChart';
import { waterfallOption } from '../../components/charts/waterfall';
import { DataTable } from '../../components/ui/DataTable';
import { KpiCard } from '../../components/ui/KpiCard';
import { COST_KEYS, result, revenue, totalCost, waterfallSteps } from '../../domain/pnl';
import { useLabels } from '../../hooks/usePageData';
import { useFormat } from '../../i18n/format';
import { useFilters } from '../../store/filters';
import { usePnl, type PnlRow } from './usePnl';

type GroupRow = PnlRow & { revenue: number; cost: number; result: number; margin: number };

export default function PnL() {
  const { t } = useTranslation();
  const f = useFormat();
  const theme = useChartTheme();
  const labels = useLabels();
  const crossFilter = useFilters((s) => s.crossFilter);
  const pnl = usePnl();
  const p = pnl.total;

  const label = (k: string) => t(`pnl.item.${k}`);
  const short = (v: number) => f.num(v / 1e6, 2);
  const option = p
    ? waterfallOption(
        waterfallSteps(p),
        theme,
        label,
        short,
        (v) => `${f.num(v / 1e6, 1)} ${t('units.mCzk')}`,
        (v) => f.czk(v),
      )
    : {};

  const groups: GroupRow[] = (pnl.data ?? []).map((r) => ({
    ...r,
    revenue: revenue(r),
    cost: totalCost(r),
    result: result(r),
    margin: revenue(r) ? result(r) / revenue(r) : 0,
  }));
  const groupName = (id: string) => labels.options.groups.find((o) => o.value === id)?.label ?? id;
  const loading = pnl.loading && !p;

  return (
    <div className="space-y-4">
      <h1 className="sr-only">{t('pages.business.pnl')}</h1>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label={t('pnl.item.revenue')}
          value={f.czk(p ? revenue(p) : null)}
          sub={p ? t('pnl.selfShare', { pct: f.pct(p.revenueSelf / revenue(p)) }) : undefined}
          loading={loading}
        />
        <KpiCard label={t('pnl.costs')} value={f.czk(p ? totalCost(p) : null)} loading={loading} />
        <KpiCard
          label={t('pnl.item.result')}
          value={f.czk(p ? result(p) : null)}
          sub={p ? t('pnl.marginPct', { pct: f.pct(result(p) / revenue(p)) }) : undefined}
          loading={loading}
        />
        <KpiCard
          label={t('pnl.annualized')}
          info={t('glossary.annualized')}
          value={f.czk(p ? (result(p) / p.months) * 12 : null)}
          sub={p ? t('pnl.months', { n: p.months }) : undefined}
          loading={loading}
        />
      </div>
      <ChartCard
        title={t('pnl.waterfall')}
        subtitle={t('pnl.waterfallSub')}
        info={t('glossary.waterfall')}
        sql={pnl.sql}
        data={pnl.data}
        loading={pnl.loading}
        error={pnl.error}
        fileName="pnl-waterfall"
        height={400}
      >
        {(register) => <EChart option={option} onReady={register} />}
      </ChartCard>
      <ChartCard
        title={t('pnl.byGroup')}
        subtitle={t('common.crossFilterHint')}
        sql={pnl.sql}
        data={pnl.data}
        loading={pnl.loading}
        error={pnl.error}
        fileName="pnl-by-group"
        height="auto"
        png={false}
      >
        {() => (
          <DataTable<GroupRow>
            rows={groups}
            onRowClick={(r) => crossFilter('groups', r.test_group)}
            columns={[
              { key: 'test_group', label: t('slicers.groups'), render: (r) => groupName(r.test_group) },
              { key: 'revenue', label: label('revenue'), align: 'right', render: (r) => f.czk(r.revenue) },
              ...COST_KEYS.map((k) => ({
                key: k,
                label: label(k),
                align: 'right' as const,
                render: (r: GroupRow) => f.czk(-r[k]),
              })),
              {
                key: 'result',
                label: label('result'),
                align: 'right',
                render: (r) => <b className={r.result < 0 ? 'text-critical' : ''}>{f.czk(r.result)}</b>,
              },
              { key: 'margin', label: t('pnl.marginCol'), align: 'right', render: (r) => f.pct(r.margin) },
            ]}
          />
        )}
      </ChartCard>
    </div>
  );
}
