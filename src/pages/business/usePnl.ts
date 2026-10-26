import { useMemo } from 'react';
import { useQuery } from '../../db/useQuery';
import type { Pnl } from '../../domain/pnl';
import { useWhere } from '../../hooks/usePageData';

export type PnlRow = Pnl & { test_group: string; months: number };

/**
 * P&L za období po skupinách vyšetření. Každá nákladová položka se přiřazuje
 * vydaným výsledkům (počet výsledků × složka nákladu na výsledek metody v měsíci).
 */
export function usePnl() {
  const { where } = useWhere('results');
  const { where: costWhere } = useWhere('costs');
  const per = (expr: string) => `sum(${expr}) / nullif(sum(reportable_results), 0)`;
  const sql = `-- Výkaz zisku a ztráty (P&L) po skupinách vyšetření
-- Profit & loss statement by test group
WITH comp AS (  -- složky nákladu na vydaný výsledek / cost components per reportable result
  SELECT month_key, test_id,
         ${per('reagent_czk + consumables_czk')}       AS reagents,
         ${per('qc_czk + calibration_czk + ehk_czk')}  AS qc_cal,
         ${per('expiry_czk')}                           AS expiry,
         ${per('staff_czk')}                            AS staff,
         ${per('lease_service_czk')}                    AS service,
         ${per('validation_czk + overhead_czk')}        AS other
  FROM costs_wide
  WHERE ${costWhere}
  GROUP BY month_key, test_id
),
r AS (
  SELECT month_key, test_id, test_group, payer_type, revenue_czk
  FROM results_wide
  WHERE value IS NOT NULL AND ${where}
)
SELECT r.test_group,
       coalesce(sum(revenue_czk) FILTER (WHERE payer_type = 'INSURANCE'), 0) AS revenueInsurance,
       coalesce(sum(revenue_czk) FILTER (WHERE payer_type = 'SELF'), 0)      AS revenueSelf,
       sum(coalesce(c.reagents, 0)) AS reagents,
       sum(coalesce(c.qc_cal, 0))   AS qcCal,
       sum(coalesce(c.expiry, 0))   AS expiry,
       sum(coalesce(c.staff, 0))    AS staff,
       sum(coalesce(c.service, 0))  AS service,
       sum(coalesce(c.other, 0))    AS other,
       count(DISTINCT r.month_key)  AS months
FROM r LEFT JOIN comp c USING (month_key, test_id)
GROUP BY r.test_group
ORDER BY revenueInsurance + revenueSelf DESC`;

  const q = useQuery<PnlRow>(sql);
  const total = useMemo<(Pnl & { months: number }) | null>(() => {
    const rows = q.data;
    if (!rows?.length) return null;
    const keys = [
      'revenueInsurance',
      'revenueSelf',
      'reagents',
      'qcCal',
      'expiry',
      'staff',
      'service',
      'other',
    ] as const;
    const t = Object.fromEntries(keys.map((k) => [k, rows.reduce((s, r) => s + r[k], 0)])) as Pnl;
    return { ...t, months: Math.max(...rows.map((r) => r.months)) };
  }, [q.data]);
  return { sql, total, ...q };
}
