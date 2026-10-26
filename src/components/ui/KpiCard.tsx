import { InfoTip } from './InfoTip';

type Props = {
  label: string;
  value: string;
  sub?: string;
  info?: string;
  loading?: boolean;
};

/** KPI dlaždice: velké číslo nahoře, kontext pod ním. */
export function KpiCard({ label, value, sub, info, loading }: Props) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
        {label}
        {info && <InfoTip text={info} />}
      </div>
      {loading ? (
        <div className="mt-2 h-8 w-24 animate-pulse rounded bg-surface-2" />
      ) : (
        <div className="tabular mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      )}
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}
