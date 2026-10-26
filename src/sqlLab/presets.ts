import type { Lang } from '../i18n';

/**
 * Ukázkové dotazy SQL laboratoře. Komentáře jsou ve dvou jazycích:
 * c('česky', 'anglicky') vrátí řádek komentáře podle zvoleného jazyka.
 * Názvy a popisy dotazů jsou v locales (sqlLab.presets.<id>).
 */
export type Preset = { id: string; tags: string[]; sql: (lang: Lang) => string };

const comment = (lang: Lang) => (cs: string, en: string) => `-- ${lang === 'cs' ? cs : en}`;

export const PRESETS: Preset[] = [
  {
    id: 'join',
    tags: ['JOIN', 'GROUP BY'],
    sql: (l) => {
      const c = comment(l);
      return `${c('Kolik výsledků a jaký podíl patologických má každé oddělení?', 'How many results and what share of abnormal ones does each department have?')}
${c('Spojení faktové tabulky s dimenzemi přes cizí klíče (hvězdicové schéma).', 'Joining the fact table to dimensions via foreign keys (star schema).')}
SELECT d.name_${l}                                         AS department,
       d.kind,
       count(*)                                           AS results,
       round(100.0 * count(*) FILTER (WHERE r.flag <> 'N') / count(*), 1) AS pct_abnormal
FROM fact_results r
JOIN fact_orders o      ON o.order_id = r.order_id
JOIN dim_departments d  ON d.dept_id  = o.dept_id
WHERE r.value IS NOT NULL
GROUP BY ALL
ORDER BY results DESC;`;
    },
  },
  {
    id: 'monthly',
    tags: ['GROUP BY', 'DATE'],
    sql: (l) => {
      const c = comment(l);
      return `${c('Měsíční objem výsledků a výnos v Kč.', 'Monthly result volume and revenue in CZK.')}
SELECT strftime(o.collected_at, '%Y-%m')  AS month,
       count(*)                           AS results,
       round(sum(r.revenue_czk))          AS revenue_czk
FROM fact_results r
JOIN fact_orders o USING (order_id)
WHERE r.value IS NOT NULL
GROUP BY month
ORDER BY month;`;
    },
  },
  {
    id: 'moving_avg',
    tags: ['WINDOW', 'CTE'],
    sql: (l) => {
      const c = comment(l);
      return `${c('Klouzavý průměr za 3 měsíce vyhladí náhodné výkyvy a ukáže trend.', 'A 3-month moving average smooths random swings and shows the trend.')}
WITH m AS (
  SELECT strftime(o.collected_at, '%Y-%m') AS month, count(*) AS results
  FROM fact_results r JOIN fact_orders o USING (order_id)
  GROUP BY month
)
SELECT month, results,
       ${c('okno = aktuální a 2 předchozí řádky', 'window = current and 2 preceding rows')}
       round(avg(results) OVER (ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)) AS moving_avg_3m
FROM m
ORDER BY month;`;
    },
  },
  {
    id: 'rank',
    tags: ['WINDOW', 'RANK', 'QUALIFY'],
    sql: (l) => {
      const c = comment(l);
      return `${c('Tři vyšetření s nejvyšším výnosem v každé skupině.', 'Top three tests by revenue within each test group.')}
SELECT t.group_name_${l} AS test_group,
       t.name_${l}       AS test,
       round(sum(r.revenue_czk)) AS revenue_czk,
       rank() OVER (PARTITION BY t.test_group ORDER BY sum(r.revenue_czk) DESC) AS rnk
FROM fact_results r
JOIN dim_tests t USING (test_id)
GROUP BY ALL
${c('QUALIFY filtruje podle výsledku okenní funkce (DuckDB)', 'QUALIFY filters on a window-function result (DuckDB)')}
QUALIFY rnk <= 3
ORDER BY test_group, rnk;`;
    },
  },
  {
    id: 'tat_percentiles',
    tags: ['CTE', 'PERCENTILE'],
    sql: (l) => {
      const c = comment(l);
      return `${c('Percentily TAT (odběr → validace) podle priority. Medián a 90. percentil jsou odolnější než průměr.', 'TAT percentiles (collection → validation) by priority. Median and P90 are more robust than the mean.')}
WITH tat AS (
  SELECT o.order_id, o.priority,
         date_diff('minute', o.collected_at, max(r.validated_at)) AS minutes
  FROM fact_orders o
  JOIN fact_results r USING (order_id)
  WHERE r.validated_at IS NOT NULL
  GROUP BY o.order_id, o.priority, o.collected_at
)
SELECT priority,
       count(*)                             AS orders,
       round(avg(minutes))                  AS mean_min,
       quantile_cont(minutes, 0.5)          AS p50_min,
       quantile_cont(minutes, 0.9)          AS p90_min,
       quantile_cont(minutes, 0.95)         AS p95_min
FROM tat
GROUP BY priority;`;
    },
  },
  {
    id: 'cohort',
    tags: ['CTE', 'COHORT', 'PIVOT'],
    sql: (l) => {
      const c = comment(l);
      return `${c('Kohortová analýza: pacienti podle kvartálu první žádanky a kolik z nich se vrátilo v dalších kvartálech.', 'Cohort analysis: patients by the quarter of their first order and how many returned in later quarters.')}
WITH first AS (
  SELECT patient_id, min(date_trunc('quarter', collected_at)) AS cohort
  FROM fact_orders GROUP BY patient_id
),
activity AS (
  SELECT DISTINCT o.patient_id, f.cohort,
         date_diff('quarter', f.cohort, date_trunc('quarter', o.collected_at)) AS q
  FROM fact_orders o JOIN first f USING (patient_id)
)
${c('PIVOT převede kvartály od první návštěvy do sloupců Q0, Q1, ...', 'PIVOT turns quarters since the first visit into columns Q0, Q1, ...')}
PIVOT (SELECT strftime(cohort, '%Y-%m') AS cohort, 'Q' || q AS quarter, patient_id FROM activity WHERE q <= 4)
ON quarter IN ('Q0', 'Q1', 'Q2', 'Q3', 'Q4')
USING count(patient_id)
ORDER BY cohort;`;
    },
  },
  {
    id: 'outliers',
    tags: ['CTE', 'IQR', 'OUTLIERS'],
    sql: (l) => {
      const c = comment(l);
      return `${c('Odlehlé hodnoty kreatininu Tukeyho metodou: mimo Q1 − 3·IQR a Q3 + 3·IQR (extrémní outliery).', 'Creatinine outliers by Tukey’s method: outside Q1 − 3·IQR and Q3 + 3·IQR (extreme outliers).')}
WITH q AS (
  SELECT quantile_cont(value, 0.25) AS q1, quantile_cont(value, 0.75) AS q3
  FROM fact_results WHERE test_id = 'CREA' AND value IS NOT NULL
)
SELECT r.result_id, o.patient_id, o.dept_id, r.value, r.flag,
       round(q.q3 + 3 * (q.q3 - q.q1), 1) AS upper_fence
FROM fact_results r
JOIN fact_orders o USING (order_id), q
WHERE r.test_id = 'CREA'
  AND (r.value > q.q3 + 3 * (q.q3 - q.q1) OR r.value < q.q1 - 3 * (q.q3 - q.q1))
ORDER BY r.value DESC
LIMIT 50;`;
    },
  },
  {
    id: 'cost_per_result',
    tags: ['JOIN', 'COST'],
    sql: (l) => {
      const c = comment(l);
      return `${c('Skutečný náklad na vydaný výsledek vs. výnos na výsledek – které metody prodělávají?', 'Actual cost per reportable result vs. revenue per result – which methods lose money?')}
WITH cost AS (
  SELECT test_id, sum(total_cost_czk) AS cost, sum(reportable_results) AS n,
         sum(expiry_czk) / sum(total_cost_czk) AS expiry_share
  FROM fact_monthly_costs GROUP BY test_id
),
rev AS (
  SELECT test_id, sum(revenue_czk) / count(*) AS revenue_per_result
  FROM fact_results WHERE value IS NOT NULL GROUP BY test_id
)
SELECT t.name_${l}                                    AS test,
       t.method_status,
       round(cost.cost / cost.n, 1)                   AS cost_per_result,
       round(rev.revenue_per_result, 1)               AS revenue_per_result,
       round(rev.revenue_per_result - cost.cost / cost.n, 1) AS margin_per_result,
       round(100 * cost.expiry_share, 1)              AS expiry_pct
FROM cost JOIN rev USING (test_id) JOIN dim_tests t USING (test_id)
ORDER BY margin_per_result;`;
    },
  },
  {
    id: 'break_even',
    tags: ['CTE', 'BREAK-EVEN'],
    sql: (l) => {
      const c = comment(l);
      return `${c('Bod zvratu = fixní náklady / (výnos na test − variabilní náklad na test).', 'Break-even = fixed costs / (revenue per test − variable cost per test).')}
${c('Fixní: QC, kalibrace, EHK, leasing, validace (vzniknou i bez vzorků). Variabilní: reagencie, materiál, personál.', 'Fixed: QC, calibration, EQA, lease, validation (incurred even with no samples). Variable: reagents, consumables, staff.')}
WITH c AS (
  SELECT test_id,
         count(DISTINCT month_key)                                              AS months,
         sum(qc_czk + calibration_czk + ehk_czk + lease_service_czk + validation_czk)
           / count(DISTINCT month_key)                                          AS fixed_per_month,
         sum(reagent_czk + consumables_czk + staff_czk) / sum(tests_performed)  AS variable_per_test,
         sum(reportable_results) / count(DISTINCT month_key)                    AS actual_per_month
  FROM fact_monthly_costs GROUP BY test_id
),
r AS (
  SELECT test_id, sum(revenue_czk) / count(*) AS revenue_per_test
  FROM fact_results WHERE value IS NOT NULL GROUP BY test_id
)
SELECT t.name_${l} AS test,
       round(c.actual_per_month)                                         AS actual_per_month,
       ceil(c.fixed_per_month / nullif(r.revenue_per_test - c.variable_per_test, 0)) AS break_even_per_month,
       CASE WHEN r.revenue_per_test <= c.variable_per_test THEN 'never'
            WHEN c.actual_per_month >= c.fixed_per_month / (r.revenue_per_test - c.variable_per_test) THEN 'OK'
            ELSE 'below' END                                             AS status
FROM c JOIN r USING (test_id) JOIN dim_tests t USING (test_id)
ORDER BY status DESC, break_even_per_month DESC;`;
    },
  },
  {
    id: 'pareto',
    tags: ['WINDOW', 'PARETO'],
    sql: (l) => {
      const c = comment(l);
      return `${c('Pareto 80/20: kumulativní podíl výnosu – kolik metod tvoří 80 % výnosu?', 'Pareto 80/20: cumulative revenue share – how many methods make up 80 % of revenue?')}
WITH rev AS (
  SELECT test_id, sum(revenue_czk) AS revenue FROM fact_results GROUP BY test_id
)
SELECT t.name_${l} AS test,
       round(revenue)                                                       AS revenue_czk,
       round(100 * revenue / sum(revenue) OVER (), 1)                       AS pct,
       ${c('běžící součet seřazený od největšího', 'running total ordered from the largest')}
       round(100 * sum(revenue) OVER (ORDER BY revenue DESC) / sum(revenue) OVER (), 1) AS cumulative_pct
FROM rev JOIN dim_tests t USING (test_id)
ORDER BY revenue DESC;`;
    },
  },
  {
    id: 'delta_check',
    tags: ['WINDOW', 'LAG'],
    sql: (l) => {
      const c = comment(l);
      return `${c('Delta check: největší změny draslíku proti předchozímu výsledku téhož pacienta do 48 hodin.', 'Delta check: largest potassium changes versus the same patient’s previous result within 48 hours.')}
WITH k AS (
  SELECT o.patient_id, o.collected_at, r.value, r.sample_issue,
         lag(r.value)        OVER w AS prev_value,
         lag(o.collected_at) OVER w AS prev_at
  FROM fact_results r JOIN fact_orders o USING (order_id)
  WHERE r.test_id = 'K' AND r.value IS NOT NULL
  WINDOW w AS (PARTITION BY o.patient_id ORDER BY o.collected_at)
)
SELECT patient_id, collected_at, prev_value, value,
       round(value - prev_value, 2) AS delta,
       sample_issue                 ${c('hemolýza často vysvětlí falešně vysoký K', 'haemolysis often explains a falsely high K')}
FROM k
WHERE prev_at IS NOT NULL AND collected_at - prev_at <= INTERVAL 48 HOUR
ORDER BY abs(value - prev_value) DESC
LIMIT 30;`;
    },
  },
  {
    id: 'westgard',
    tags: ['QC', 'GROUP BY'],
    sql: (l) => {
      const c = comment(l);
      return `${c('Kontrola kvality: CV %, bias % a počet měření mimo ±3 SD (pravidlo 1-3s) podle metody a analyzátoru.', 'Quality control: CV %, bias % and runs outside ±3 SD (1-3s rule) by method and analyser.')}
SELECT q.test_id, q.analyzer_id, q.level,
       count(*)                                                    AS runs,
       round(100 * stddev_samp(q.value) / avg(q.value), 2)         AS cv_pct,
       round(100 * (avg(q.value) - avg(q.target_mean)) / avg(q.target_mean), 2) AS bias_pct,
       count(*) FILTER (WHERE abs(q.value - q.target_mean) > 3 * q.target_sd) AS rule_1_3s
FROM fact_qc_runs q
GROUP BY ALL
ORDER BY rule_1_3s DESC
LIMIT 25;`;
    },
  },
  {
    id: 'yoy',
    tags: ['WINDOW', 'LAG', 'YOY'],
    sql: (l) => {
      const c = comment(l);
      return `${c('Meziroční změna (r/r) objemu po měsících pomocí LAG o 12 řádků.', 'Year-over-year volume change by month using LAG over 12 rows.')}
WITH m AS (
  SELECT date_trunc('month', o.collected_at) AS month, count(*) AS results
  FROM fact_results r JOIN fact_orders o USING (order_id)
  GROUP BY month
)
SELECT strftime(month, '%Y-%m') AS month, results,
       lag(results, 12) OVER (ORDER BY month)                         AS results_last_year,
       round(100.0 * (results / lag(results, 12) OVER (ORDER BY month) - 1), 1) AS yoy_pct
FROM m
ORDER BY month;`;
    },
  },
  {
    id: 'lifecycle',
    tags: ['JOIN', 'LIFECYCLE'],
    sql: (l) => {
      const c = comment(l);
      return `${c('Zrušené metody: plán vs. skutečnost a celková ztráta včetně validace a expirace.', 'Discontinued methods: plan vs. actual and total loss including validation and expiry.')}
SELECT t.name_${l}                         AS test,
       m.introduced_on, m.cancelled_on,
       m.planned_monthly_volume           AS planned,
       m.actual_avg_monthly_volume        AS actual,
       round(sum(r.revenue_czk) - any_value(c.cost)) AS total_result_czk,
       m.cancellation_reason_${l}          AS reason
FROM dim_method_registry m
JOIN dim_tests t USING (test_id)
JOIN fact_results r USING (test_id)
JOIN (SELECT test_id, sum(total_cost_czk) AS cost FROM fact_monthly_costs GROUP BY test_id) c USING (test_id)
WHERE m.category = 'NEW_CANCELLED'
GROUP BY ALL
ORDER BY total_result_czk;`;
    },
  },
];
