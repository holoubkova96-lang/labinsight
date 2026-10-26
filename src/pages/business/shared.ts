/**
 * Společné SQL pro business mód.
 *
 * Náklady se přiřazují metodou „absorpční kalkulace“: náklad vydaných výsledků =
 * počet výsledků × skutečný náklad na výsledek dané metody v daném měsíci.
 * Díky tomu dávají marže smysl i při filtru na oddělení nebo pojišťovnu,
 * na které se samotné náklady laboratoře přímo nevztahují.
 */
export function costPerResultCte(costWhere: string): string {
  return `cpr AS (  -- náklad na vydaný výsledek podle metody a měsíce / cost per reportable result
  SELECT month_key, test_id,
         sum(total_cost_czk) / nullif(sum(reportable_results), 0) AS cost_per_result
  FROM costs_wide
  WHERE ${costWhere}
  GROUP BY month_key, test_id
)`;
}

/** Procentní změna, null když není s čím srovnat. */
export function change(current: number | undefined, previous: number | undefined): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}
