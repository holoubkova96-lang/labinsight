import { useQuery } from '../../db/useQuery';
import { buildWhere } from '../../db/where';
import { useFilterValues } from '../../store/filters';

export type MethodVolume = {
  test_id: string;
  category: string;
  method_status: string;
  freq: number;
  outsource_handling_czk: number;
  outsource_tat_hours: number;
};

/** Skutečná průměrná měsíční frekvence metod v období (jen měsíce, kdy metoda běžela). */
export function useMethodVolumes() {
  const where = buildWhere(useFilterValues(), 'results', 'r').sql;
  const sql = `-- Skutečná měsíční frekvence metod a parametry odeslání do referenční laboratoře
-- Actual monthly volume of methods and send-out parameters
SELECT r.test_id, m.category, m.method_status,
       count(*) / count(DISTINCT r.month_key) AS freq,
       m.outsource_handling_czk, m.outsource_tat_hours
FROM results_wide r JOIN dim_method_registry m USING (test_id)
WHERE r.value IS NOT NULL AND ${where}
GROUP BY ALL`;
  return { sql, ...useQuery<MethodVolume>(sql) };
}
