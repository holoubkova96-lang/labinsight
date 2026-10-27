# LabInsight – plán projektu

> **Původní plán z úvodu projektu.** Aplikace byla později zjednodušena na 6 stránek – aktuální rozsah popisuje [README.cs.md](../README.cs.md).

## Architektura

```
Python generátor (seed 42)  →  public/data/*.parquet  →  DuckDB-WASM (Web Worker v prohlížeči)
                                                              ↑ SQL dotazy
React + TS  ←  Zustand (filtry, mód, jazyk ⇄ URL)  →  SQL builder (WHERE z filtrů)  →  ECharts
```

- **Statická aplikace** – GitHub Pages hostuje jen statické soubory; nulové náklady a údržba.
- **DuckDB-WASM** – analytická databáze v prohlížeči; každý KPI a graf je skutečný SQL dotaz. Běží ve Web Workeru.
- **Parquet** – sloupcový komprimovaný formát, výsledky v jednotkách MB.
- **HashRouter** (`/#/clinical/qc?...`) – sdílené odkazy fungují i na GitHub Pages bez 404.
- **Doménová logika v čistých TS funkcích** (nákladový model, break-even, Westgard, prognóza) pokrytá testy (Vitest).

## Datový model – hvězdicové schéma

Období: 10/2023 – 9/2026 (36 uzavřených měsíců).

### Fakta

| Tabulka | Řádků | Klíčové sloupce |
|---|---|---|
| `fact_orders` | ~50 000 | order_id, patient_id, dept_id, date_key, collected_at, received_at, priority (STAT/ROUTINE), payer_type (INSURANCE/SELF), insurer_code |
| `fact_results` | ~350 000 | result_id, order_id, test_id, analyzer_id, value, flag (L/N/H/LL/HH), is_critical, critical_reported_at, analyzed_at, validated_at, sample_issue, is_repeat, points, revenue_czk |
| `fact_qc_runs` | ~60 000 | run_id, test_id, analyzer_id, run_at, level (1/2), value, target_mean, target_sd |
| `fact_monthly_costs` | ~1 600 | month_key, test_id, reagent, consumables, qc, calibration, expiry_waste, ehk, staff, lease_service, validation_amort |

### Dimenze

| Tabulka | Obsah |
|---|---|
| `dim_patients` | pseudo ID, pohlaví, rok narození, věková skupina, pojišťovna, okres (žádná jména ani RČ) |
| `dim_tests` | ~45 vyšetření: kód výkonu, body, jednotky, ref. meze (pohlaví/věk), kritické meze, skupina, analyzátor, cena pro samoplátce, parametry nákladů |
| `dim_method_registry` | zavedení/zrušení, plánovaná vs. skutečná frekvence, důvod zrušení, lessons learned |
| `dim_departments` | interna, chirurgie, JIP, ARO, pediatrie, onkologie, urgent, externí ambulance |
| `dim_insurers` | 111–213, fiktivní smluvní hodnota bodu (jasně označeno) |
| `dim_analyzers` | biochemie, imunochemie, hematologie, koagulace; leasing/měsíc |
| `dim_date` | den, týden, měsíc, kvartál, rok, den v týdnu, svátek, sezóna |

### Nákladový model

```
náklad/výsledek = variabilní (reagencie + spotřební materiál) × (1 + podíl opakování)
                + [QC + kalibrace + expirace + EHK/12 + leasing a servis + amortizace validace a školení] / počet výsledků
                + osobní náklad (min. laboranta a VŠ × hodinová sazba)
expirace = (otevřená balení × velikost balení − spotřebované testy) × cena testu
```

Break-even = fixní náklady / (výnos na test − variabilní náklad na test); kvůli schodovité expiraci se dopočítá numericky.

## Stránky

- **Společné:** Landing, O datech, ER diagram
- **Klinický mód:** Přehled · Výsledky a distribuce · Kritické hodnoty · Kontrola kvality · TAT a provoz · Pacient · Korelace · Indikační chování
- **Business mód:** Přehled · Frekvence vs. náklad · Simulátor zavedení metody · Make-or-buy · Životní cyklus · Pojišťovny a samoplátci · Žadatelé · P&L waterfall · What-if · Prognóza

## Fáze

1. Plán ✅
2. Repozitář na GitHubu
3. Bodové hodnoty, šablona ceníku, generátor dat
4. Kostra, i18n, slicery, DuckDB → klinický mód → business mód
5. Design, testování
6. Nasazení, README, průvodce

## Známá zjednodušení

- Laboratorní regulační limity úhradové vyhlášky nejsou modelovány (výnos = body × hodnota bodu).
- Ceny reagencií a externí laboratoře jsou fiktivní, ale realistické.
