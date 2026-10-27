# LabInsight

**Interactive analytics dashboard for a clinical biochemistry & haematology laboratory.**
It answers one business question: *does a laboratory method pay off given its volume and its cost?*

🔗 **Live demo:** https://holoubkova96-lang.github.io/labinsight/
🇨🇿 Česká verze: [README.cs.md](README.cs.md) · 📘 Guide (Czech): [PRUVODCE_DATOVEHO_ANALYTIKA.md](PRUVODCE_DATOVEHO_ANALYTIKA.md)

> ⚠️ All patients, volumes and costs are **fictional**. Only the public tariff data (procedure points from the VZP code list, point value from Decree No. 432/2025 Coll.) are real.

---

## Why this project

Laboratories regularly introduce new methods that later have to be discontinued because they lose money:
low volume does not cover fixed costs such as daily quality control, calibration, external quality assessment
and reagents that expire once opened. LabInsight shows **how cost per result grows as volume falls** and which
methods are worth keeping, so such decisions can be made *before* a method is introduced.

## Features

The dashboard has two switchable modes with their own accent colour:

| Mode | Page | What it shows |
|---|---|---|
| **Clinical** | Overview | KPIs (samples, % abnormal results, critical values, median turnaround time) and monthly volume |
| | Results & distributions | Histogram with reference limits, box plots by department / sex / age, tests most often out of range |
| | TAT & operations | Workload heatmap (weekday × hour), cumulative turnaround time, TAT phases, Sankey of sample paths |
| **Business** | Overview | Procedures, points, revenue, costs, margin and revenue per order with month-on-month and year-on-year change |
| | Volume vs. cost | Bubble chart with four quadrants, cost-per-result curve with break-even, Pareto of revenue and losses |
| | Method lifecycle | Gantt of introduced/discontinued methods, plan vs. actual volume, cumulative result, lessons learned |

Across all pages:

- **Global filters (slicers):** period with quick ranges, department, test group, test, age group, sex and payer (health insurer vs. self-payer).
- **Cross-filtering:** clicking a bar, cell or bubble filters the whole dashboard; active filters appear as removable chips.
- **Shareable views:** filters and language are stored in the URL.
- **“Show SQL”** on every chart reveals the exact query behind it; **CSV and PNG export** of every chart and
  **“Download dashboard”** saves the whole page (filters, KPIs and charts) as one PNG.
- **Czech / English** interface with locale-aware number, currency and date formats; light and dark theme; responsive layout.

## How it works

```
Python generator (fixed seed) ──► Parquet files ──► DuckDB-WASM in the browser ──► SQL ──► ECharts
```

- **No server.** The whole analytics database ([DuckDB-WASM](https://duckdb.org/docs/api/wasm/overview)) runs inside the browser.
  Every KPI and chart is a real SQL query over ~363,000 results.
- **Star schema.** Fact tables (`fact_orders`, `fact_results`, `fact_monthly_costs`) link to dimensions
  (`dim_patients`, `dim_tests`, `dim_departments`, `dim_reference_ranges`, `dim_method_registry`).
  After loading, the app builds denormalised `results_wide` / `costs_wide` tables so every chart shares one `WHERE` clause.
- **Cost model.** Monthly cost per method = reagents + consumables + QC + calibration + **reagent expiry** + EQA + staff + analyser lease
  + validation write-off + overhead. Divided by reported results it gives the *actual cost per result*.
  Costs are assigned to filtered results by absorption costing (results × the method's cost per result in that month).

## Tech stack

React 19 · TypeScript · Vite · Tailwind CSS · Apache ECharts · DuckDB-WASM · Zustand · react-i18next · Vitest ·
Python (numpy, pandas, Faker) · GitHub Actions · GitHub Pages

## Run locally

Requirements: [Node.js](https://nodejs.org/) 20+ (built with 24) and, for regenerating data, Python 3.11+.

```bash
npm install
npm run dev          # http://localhost:5173
```

Other scripts:

```bash
npm test             # unit tests (cost model, SQL builder, formatting)
npm run lint         # ESLint
npm run build        # type-check + production build into dist/
```

### Regenerate the data

The Parquet files in `public/data` are committed, so this step is optional.

```bash
pip install -r data_gen/requirements.txt
python data_gen/generate.py      # or: npm run data
```

The generator is deterministic (seed 42) and produces 36 months of data (10/2023 – 9/2026):
5,000 patients, 50,000 orders, ~363,000 results and monthly costs per method.
Self-payer prices are taken from `data/source/ceny_samoplatci.csv` when filled in, otherwise estimated from points.

## Data sources

| Source | Used for | Retrieved |
|---|---|---|
| [VZP – health procedures code list, version 1482](https://vzp.cz/poskytovatele/ciselniky/zdravotni-vykony) | Procedure codes and points for 45 tests | Oct 26, 2026 |
| [Decree No. 432/2025 Coll.](https://www.zakonyprolidi.cz/cs/2025-432) (2026 reimbursement decree) | Point value: CZK 0.80 (specialties 801, 813), 0.90 (818), 1.05 (999) for an accredited lab | Oct 26, 2026 |
| [Public self-payer price list](https://webkalkulacka.agellab.cz/) | Self-payer prices (entered manually, not scraped) | – |
| [Inker et al., NEJM 2021](https://doi.org/10.1056/NEJMoa2102953) | eGFR (CKD-EPI 2021 equation) | – |

**Simplifications:** the BONlab laboratory coefficient and regulatory caps of the decree are not modelled
(revenue = points × point value); insurer contract coefficients (±3 %), reagent prices, QC, lease and overhead are fictional
but realistic.

## Project structure

```
data_gen/            Python data generator (catalog, orders, results, cost model, method registry)
data/source/         real source data (VZP points) and the self-payer price template
public/data/         generated Parquet files loaded by the app
src/db/              DuckDB-WASM setup, query hook, SQL WHERE builder
src/domain/          cost model and break-even (pure functions with tests)
src/pages/           clinical and business pages
src/components/      charts, slicers, layout and UI components
src/locales/         Czech and English translations
.github/workflows/   build, test and deploy to GitHub Pages
```

## Deployment

Every push to `main` runs lint, type-check, tests and the production build in GitHub Actions and publishes `dist/`
to GitHub Pages. Assets of the previous deployment are kept so pages cached by browsers keep working.

## Author

**Mgr. Barbora Fišerová** – [GitHub](https://github.com/holoubkova96-lang)

## License

[MIT](LICENSE)
