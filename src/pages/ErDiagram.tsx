import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '../db/useQuery';
import { useFormat } from '../i18n/format';

type ColRow = { table_name: string; column_name: string; data_type: string };
type CountRow = { table_name: string; n: number };

type Box = { id: string; x: number; y: number; fact?: boolean; keys: string[] };

/** Rozmístění tabulek hvězdicového schématu (souřadnice v SVG viewBoxu). */
const BOXES: Box[] = [
  {
    id: 'dim_patients',
    x: 20,
    y: 20,
    keys: ['patient_id', 'sex', 'birth_year', 'age_group', 'insurer_code', 'district'],
  },
  {
    id: 'dim_insurers',
    x: 20,
    y: 300,
    keys: ['insurer_code', 'name_cs', 'contract_coef', 'point_value_801'],
  },
  { id: 'dim_departments', x: 20, y: 520, keys: ['dept_id', 'name_cs', 'category', 'kind'] },
  {
    id: 'fact_orders',
    x: 330,
    y: 150,
    fact: true,
    keys: [
      'order_id',
      'episode_id',
      'patient_id',
      'dept_id',
      'date_key',
      'insurer_code',
      'priority',
      'payer_type',
    ],
  },
  { id: 'dim_date', x: 330, y: 520, keys: ['date_key', 'date', 'month_key', 'day_of_week', 'is_holiday'] },
  {
    id: 'fact_results',
    x: 640,
    y: 150,
    fact: true,
    keys: ['result_id', 'order_id', 'test_id', 'analyzer_id', 'value', 'flag', 'points', 'revenue_czk'],
  },
  { id: 'dim_analyzers', x: 640, y: 520, keys: ['analyzer_id', 'analyzer_group', 'lease_service_month_czk'] },
  {
    id: 'dim_tests',
    x: 950,
    y: 150,
    keys: ['test_id', 'procedure_code', 'points', 'specialty', 'method_status', 'reagent_czk'],
  },
  {
    id: 'fact_qc_runs',
    x: 950,
    y: 470,
    fact: true,
    keys: ['run_id', 'test_id', 'analyzer_id', 'date_key', 'level', 'value', 'target_sd'],
  },
  { id: 'dim_reference_ranges', x: 1260, y: 20, keys: ['test_id', 'sex', 'age_min', 'ref_low', 'ref_high'] },
  {
    id: 'dim_method_registry',
    x: 1260,
    y: 240,
    keys: ['test_id', 'category', 'introduced_on', 'planned_monthly_volume'],
  },
  {
    id: 'fact_monthly_costs',
    x: 1260,
    y: 450,
    fact: true,
    keys: ['month_key', 'test_id', 'analyzer_id', 'total_cost_czk', 'expiry_czk', 'reportable_results'],
  },
];

/** Vztahy 1:N (z = strana N s cizím klíčem, do = strana 1). */
const LINKS: { from: string; to: string; key: string }[] = [
  { from: 'fact_results', to: 'fact_orders', key: 'order_id' },
  { from: 'fact_results', to: 'dim_tests', key: 'test_id' },
  { from: 'fact_results', to: 'dim_analyzers', key: 'analyzer_id' },
  { from: 'fact_orders', to: 'dim_patients', key: 'patient_id' },
  { from: 'fact_orders', to: 'dim_departments', key: 'dept_id' },
  { from: 'fact_orders', to: 'dim_insurers', key: 'insurer_code' },
  { from: 'fact_orders', to: 'dim_date', key: 'date_key' },
  { from: 'dim_patients', to: 'dim_insurers', key: 'insurer_code' },
  { from: 'fact_qc_runs', to: 'dim_tests', key: 'test_id' },
  { from: 'fact_qc_runs', to: 'dim_analyzers', key: 'analyzer_id' },
  { from: 'fact_qc_runs', to: 'dim_date', key: 'date_key' },
  { from: 'fact_monthly_costs', to: 'dim_tests', key: 'test_id' },
  { from: 'fact_monthly_costs', to: 'dim_analyzers', key: 'analyzer_id' },
  { from: 'dim_reference_ranges', to: 'dim_tests', key: 'test_id' },
  { from: 'dim_method_registry', to: 'dim_tests', key: 'test_id' },
];

const W = 260;
const HEAD = 30;
const ROW = 19;
const boxHeight = (b: Box) => HEAD + b.keys.length * ROW + 24;

function anchor(a: Box, b: Box): [number, number, 'h' | 'v'] {
  const ac = [a.x + W / 2, a.y + boxHeight(a) / 2];
  const bc = [b.x + W / 2, b.y + boxHeight(b) / 2];
  if (Math.abs(bc[0] - ac[0]) > W * 0.6) return [bc[0] > ac[0] ? a.x + W : a.x, ac[1], 'h'];
  return [ac[0], bc[1] > ac[1] ? a.y + boxHeight(a) : a.y, 'v'];
}

export default function ErDiagram() {
  const { t } = useTranslation();
  const f = useFormat();
  const cols = useQuery<ColRow>(
    `SELECT table_name, column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'main' AND table_name NOT LIKE '%_wide' ORDER BY table_name, ordinal_position`,
  );
  const counts = useQuery<CountRow>(
    BOXES.map((b) => `SELECT '${b.id}' AS table_name, count(*) AS n FROM ${b.id}`).join('\nUNION ALL\n'),
  );
  const byTable = useMemo(() => {
    const m = new Map<string, ColRow[]>();
    for (const c of cols.data ?? []) m.set(c.table_name, [...(m.get(c.table_name) ?? []), c]);
    return m;
  }, [cols.data]);
  const count = (id: string) => counts.data?.find((c) => c.table_name === id)?.n;
  const box = (id: string) => BOXES.find((b) => b.id === id)!;
  const pkOf = (b: Box) =>
    b.id === 'fact_monthly_costs' ? ['month_key', 'test_id', 'analyzer_id'] : [b.keys[0]];
  const fkOf = (b: Box) => LINKS.filter((l) => l.from === b.id).map((l) => l.key);

  return (
    <div className="space-y-4">
      <header className="rounded-xl border border-line bg-surface p-4">
        <h1 className="text-lg font-semibold">{t('er.title')}</h1>
        <p className="mt-1 text-sm text-ink-2">{t('er.intro')}</p>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-2">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-sm border-2 border-accent bg-accent-soft" />{' '}
            {t('er.fact')}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-3 rounded-sm border border-line bg-surface-2" /> {t('er.dim')}
          </span>
          <span>
            <b className="text-accent">PK</b> {t('er.pk')}
          </span>
          <span>
            <b className="text-muted">FK</b> {t('er.fk')}
          </span>
          <span>1 — N {t('er.rel')}</span>
        </div>
      </header>

      <section
        className="overflow-x-auto rounded-xl border border-line bg-surface p-2"
        aria-label={t('er.title')}
      >
        <svg
          viewBox="0 0 1540 720"
          className="h-auto w-full min-w-[900px]"
          role="img"
          aria-label={t('er.title')}
        >
          {LINKS.map((l) => {
            const a = box(l.from);
            const b = box(l.to);
            const [x1, y1, d1] = anchor(a, b);
            const [x2, y2, d2] = anchor(b, a);
            const c1 = d1 === 'h' ? [x1 + (x2 > x1 ? 60 : -60), y1] : [x1, y1 + (y2 > y1 ? 60 : -60)];
            const c2 = d2 === 'h' ? [x2 + (x1 > x2 ? 60 : -60), y2] : [x2, y2 + (y1 > y2 ? 60 : -60)];
            return (
              <g key={`${l.from}-${l.to}-${l.key}`}>
                <path
                  d={`M${x1},${y1} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${x2},${y2}`}
                  fill="none"
                  stroke="var(--muted)"
                  strokeWidth={1.5}
                  opacity={0.7}
                />
                <text
                  x={x1 + (d1 === 'h' ? (x2 > x1 ? 6 : -14) : 6)}
                  y={y1 + (d1 === 'v' ? (y2 > y1 ? 14 : -6) : -5)}
                  fontSize={11}
                  fill="var(--muted)"
                >
                  N
                </text>
                <text
                  x={x2 + (d2 === 'h' ? (x1 > x2 ? 6 : -12) : 6)}
                  y={y2 + (d2 === 'v' ? (y1 > y2 ? 14 : -6) : -5)}
                  fontSize={11}
                  fill="var(--muted)"
                >
                  1
                </text>
              </g>
            );
          })}
          {BOXES.map((b) => {
            const h = boxHeight(b);
            const total = byTable.get(b.id)?.length ?? b.keys.length;
            const pk = pkOf(b);
            const fk = fkOf(b);
            return (
              <g key={b.id}>
                <rect
                  x={b.x}
                  y={b.y}
                  width={W}
                  height={h}
                  rx={8}
                  fill="var(--surface)"
                  stroke={b.fact ? 'var(--accent)' : 'var(--border)'}
                  strokeWidth={b.fact ? 2 : 1}
                />
                <path
                  d={`M${b.x},${b.y + 8} a8,8 0 0 1 8,-8 h${W - 16} a8,8 0 0 1 8,8 v${HEAD - 8} h-${W} z`}
                  fill={b.fact ? 'var(--accent-soft)' : 'var(--surface-2)'}
                />
                <text
                  x={b.x + 10}
                  y={b.y + 20}
                  fontSize={13}
                  fontWeight={600}
                  fill="var(--text)"
                  fontFamily="ui-monospace, monospace"
                >
                  {b.id}
                </text>
                <text x={b.x + W - 10} y={b.y + 20} fontSize={11} fill="var(--muted)" textAnchor="end">
                  {count(b.id) != null ? f.num(count(b.id)) : ''}
                </text>
                {b.keys.map((k, i) => {
                  const type = byTable.get(b.id)?.find((c) => c.column_name === k)?.data_type ?? '';
                  return (
                    <g key={k}>
                      <text
                        x={b.x + 10}
                        y={b.y + HEAD + 15 + i * ROW}
                        fontSize={9}
                        fontWeight={700}
                        fill={pk.includes(k) ? 'var(--accent)' : 'var(--muted)'}
                      >
                        {pk.includes(k) ? 'PK' : fk.includes(k) ? 'FK' : ''}
                      </text>
                      <text
                        x={b.x + 30}
                        y={b.y + HEAD + 15 + i * ROW}
                        fontSize={12}
                        fill="var(--text)"
                        fontFamily="ui-monospace, monospace"
                      >
                        {k}
                      </text>
                      <text
                        x={b.x + W - 10}
                        y={b.y + HEAD + 15 + i * ROW}
                        fontSize={10}
                        fill="var(--muted)"
                        textAnchor="end"
                      >
                        {type.toLowerCase().replace('timestamp with time zone', 'timestamptz')}
                      </text>
                    </g>
                  );
                })}
                <text x={b.x + 10} y={b.y + h - 9} fontSize={10} fill="var(--muted)">
                  {total > b.keys.length ? t('er.more', { n: total - b.keys.length }) : ''}
                </text>
              </g>
            );
          })}
        </svg>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label={t('er.columns')}>
        {BOXES.map((b) => (
          <details key={b.id} className="rounded-xl border border-line bg-surface p-3 text-sm">
            <summary className="cursor-pointer">
              <span className="font-mono font-semibold">{b.id}</span>{' '}
              <span className="text-xs text-muted">
                · {b.fact ? t('er.fact') : t('er.dim')} · {f.num(count(b.id))} {t('er.rows')}
              </span>
              <p className="mt-1 text-xs text-ink-2">{t(`er.desc.${b.id}`)}</p>
            </summary>
            <ul className="mt-2 grid grid-cols-1 gap-x-4 font-mono text-[11px] sm:grid-cols-2">
              {(byTable.get(b.id) ?? []).map((c) => (
                <li key={c.column_name} className="truncate">
                  {c.column_name} <span className="text-muted">{c.data_type.toLowerCase()}</span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>
      <p className="text-xs text-muted">{t('er.wideNote')}</p>
    </div>
  );
}
