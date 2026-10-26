import { useMemo } from 'react';
import { useQuery } from '../../db/useQuery';
import type { MethodParams } from '../../domain/costModel';

type ParamRow = {
  test_id: string;
  points: number;
  specialty: string;
  reagent_czk: number;
  pack_size: number;
  stability_days: number;
  qc_per_day: number;
  qc_czk: number;
  cal_per_month: number;
  cal_czk: number;
  ehk_year_czk: number;
  tech_min: number;
  uni_min: number;
  lease_month: number | null;
  overhead_per: number | null;
  analyzers: number | null;
  one_off: number | null;
  point_value: number | null;
};

export type MethodInfo = { params: MethodParams; analyzers: number };

/** Hodnota bodu podle odbornosti (vyhl. č. 432/2025 Sb.) – výchozí, pokud metoda nemá výnosy. */
export const POINT_VALUE: Record<string, number> = { '801': 0.8, '813': 0.8, '818': 0.9, '999': 1.05 };

export const PARAMS_SQL = `-- Parametry nákladového modelu metod / cost-model parameters per method
SELECT t.test_id, t.points, t.specialty, t.reagent_czk, t.pack_size, t.stability_days,
       t.qc_per_day, t.qc_czk, t.cal_per_month, t.cal_czk, t.ehk_year_czk, t.tech_min, t.uni_min,
       c.lease_month, c.overhead_per, c.analyzers,
       m.validation_cost_czk + m.training_cost_czk AS one_off,
       v.point_value
FROM dim_tests t
LEFT JOIN (
  SELECT test_id,
         sum(lease_service_czk) / count(DISTINCT month_key)       AS lease_month,
         sum(overhead_czk) / nullif(sum(reportable_results), 0)    AS overhead_per,
         count(DISTINCT analyzer_id)                              AS analyzers
  FROM costs_wide GROUP BY test_id
) c USING (test_id)
LEFT JOIN dim_method_registry m USING (test_id)
LEFT JOIN (  -- průměrná dosažená hodnota bodu u pojišťoven / average realised point value
  SELECT test_id, sum(revenue_czk) / nullif(sum(points), 0) AS point_value
  FROM results_wide WHERE payer_type = 'INSURANCE' GROUP BY test_id
) v USING (test_id)
WHERE t.test_id <> 'EGFR'`;

/** Parametry nákladového modelu všech metod z dim_tests a skutečných nákladů. */
export function useMethodParams() {
  const q = useQuery<ParamRow>(PARAMS_SQL);
  const map = useMemo(() => {
    const m = new Map<string, MethodInfo>();
    for (const r of q.data ?? []) {
      m.set(r.test_id, {
        analyzers: r.analyzers ?? 1,
        params: {
          points: r.points,
          pointValue: r.point_value ?? POINT_VALUE[r.specialty] ?? 0.8,
          reagentCzk: r.reagent_czk,
          packSize: r.pack_size,
          stabilityDays: r.stability_days,
          qcPerDay: r.qc_per_day,
          qcCzk: r.qc_czk,
          calPerMonth: r.cal_per_month,
          calCzk: r.cal_czk,
          ehkYearCzk: r.ehk_year_czk,
          techMin: r.tech_min,
          uniMin: r.uni_min,
          leaseMonthCzk: r.lease_month ?? 0,
          overheadPerResult: r.overhead_per ?? 7.5,
          oneOffCzk: r.one_off ?? 0,
        },
      });
    }
    return m;
  }, [q.data]);
  return { map, loading: q.loading };
}
