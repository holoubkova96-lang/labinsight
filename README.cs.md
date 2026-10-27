# LabInsight

**Interaktivní analytický dashboard klinické biochemicko-hematologické laboratoře.**
Odpovídá na jednu byznysovou otázku: *vyplatí se nám tato metoda vzhledem k její frekvenci a nákladům?*

🔗 **Živé demo:** https://holoubkova96-lang.github.io/labinsight/
🇬🇧 English version: [README.md](README.md) · 📘 Průvodce projektem: [PRUVODCE_DATOVEHO_ANALYTIKA.md](PRUVODCE_DATOVEHO_ANALYTIKA.md)

> ⚠️ Všichni pacienti, objemy a náklady jsou **fiktivní**. Skutečné jsou jen veřejné úhradové údaje (body výkonů z číselníku VZP, hodnota bodu z vyhlášky č. 432/2025 Sb.).

---

## Proč tento projekt

Laboratoře pravidelně zavádějí nové metody, které pak kvůli nevýhodnosti ruší: nízká frekvence nepokryje fixní
náklady, jako je denní kontrola kvality, kalibrace, externí hodnocení kvality a reagencie, které po otevření expirují.
LabInsight ukazuje, **jak náklad na jeden výsledek roste s klesající frekvencí** a které metody se vyplatí udržet –
aby se takové rozhodnutí dalo udělat *dřív*, než se metoda zavede.

## Co dashboard umí

Dashboard má dva přepínatelné módy, každý s vlastní akcentovou barvou:

| Mód | Stránka | Co ukazuje |
|---|---|---|
| **Klinický** | Přehled | KPI (vzorky, % patologických výsledků, kritické hodnoty, medián doby odezvy) a objem po měsících |
| | Výsledky a distribuce | Histogram s referenčními mezemi, boxploty podle oddělení / pohlaví / věku, vyšetření nejčastěji mimo meze |
| | TAT a provoz | Heatmapa zatížení (den × hodina), kumulativní rozdělení TAT, fáze TAT, Sankeyův diagram cesty vzorku |
| **Business** | Přehled | Výkony, body, výnos, náklady, marže a výnos na žádanku včetně změny m/m a r/r |
| | Frekvence vs. náklad | Bublinový graf se čtyřmi kvadranty, křivka nákladu na výsledek s bodem zvratu, Paretova analýza |
| | Životní cyklus metod | Časová osa zavedených a zrušených metod, plán vs. skutečnost, kumulovaný výsledek, lessons learned |

Na všech stránkách:

- **Globální filtry (slicery):** období s rychlými volbami, oddělení, skupina vyšetření, vyšetření, věková skupina, pohlaví a plátce (pojišťovna vs. samoplátce).
- **Cross-filtering:** klik na sloupec, buňku nebo bublinu přefiltruje celý dashboard; aktivní filtry se zobrazují jako „chips“.
- **Sdílení pohledu:** filtry i jazyk se ukládají do URL.
- **„Zobrazit SQL“** u každého grafu ukáže přesný dotaz, ze kterého graf vznikl; **export CSV a PNG** každého grafu a
  **„Stáhnout dashboard“** uloží celou stránku (filtry, KPI a grafy) jako jeden obrázek PNG.
- **Čeština / angličtina** včetně formátu čísel, měn a dat; světlý i tmavý režim; responzivní rozložení.

## Jak to funguje

```
Python generátor (pevný seed) ──► Parquet soubory ──► DuckDB-WASM v prohlížeči ──► SQL ──► ECharts
```

- **Bez serveru.** Celá analytická databáze ([DuckDB-WASM](https://duckdb.org/docs/api/wasm/overview)) běží přímo v prohlížeči.
  Každý KPI a graf je skutečný SQL dotaz nad ~363 000 výsledky.
- **Hvězdicové schéma.** Faktové tabulky (`fact_orders`, `fact_results`, `fact_monthly_costs`) jsou propojené s dimenzemi
  (`dim_patients`, `dim_tests`, `dim_departments`, `dim_reference_ranges`, `dim_method_registry`).
  Po načtení si aplikace vytvoří denormalizované tabulky `results_wide` / `costs_wide`, aby všechny grafy sdílely jednu podmínku `WHERE`.
- **Nákladový model.** Měsíční náklad metody = reagencie + spotřební materiál + QC + kalibrace + **expirace reagencií** + EHK + personál
  + leasing analyzátoru + odpis validace + režie. Po vydělení počtem vydaných výsledků vznikne *skutečný náklad na výsledek*.
  K filtrovaným výsledkům se náklady přiřazují absorpční kalkulací (výsledky × náklad na výsledek metody v daném měsíci).

## Technologie

React 19 · TypeScript · Vite · Tailwind CSS · Apache ECharts · DuckDB-WASM · Zustand · react-i18next · Vitest ·
Python (numpy, pandas, Faker) · GitHub Actions · GitHub Pages

## Spuštění na vlastním počítači

Potřebuješ [Node.js](https://nodejs.org/) 20+ (projekt je sestavený na verzi 24) a pro přegenerování dat Python 3.11+.

```bash
npm install
npm run dev          # http://localhost:5173
```

Další příkazy:

```bash
npm test             # testy (nákladový model, SQL builder, formátování)
npm run lint         # kontrola kódu ESLintem
npm run build        # typová kontrola + produkční build do složky dist/
```

### Přegenerování dat

Parquet soubory v `public/data` jsou součástí repozitáře, takže tento krok je volitelný.

```bash
pip install -r data_gen/requirements.txt
python data_gen/generate.py      # nebo: npm run data
```

Generátor je deterministický (seed 42) a vytvoří 36 měsíců dat (10/2023 – 9/2026):
5 000 pacientů, 50 000 žádanek, ~363 000 výsledků a měsíční náklady metod.
Ceny pro samoplátce se berou z `data/source/ceny_samoplatci.csv`; dokud není vyplněný, odhadnou se z bodů.

## Zdroje dat

| Zdroj | Použití | Staženo |
|---|---|---|
| [VZP – číselník Zdravotní výkony, verze 1482](https://vzp.cz/poskytovatele/ciselniky/zdravotni-vykony) | Kódy výkonů a body 45 vyšetření | 26. 10. 2026 |
| [Vyhláška č. 432/2025 Sb.](https://www.zakonyprolidi.cz/cs/2025-432) (úhradová vyhláška 2026) | Hodnota bodu: 0,80 Kč (odbornosti 801, 813), 0,90 Kč (818), 1,05 Kč (999) pro akreditovanou laboratoř | 26. 10. 2026 |
| [Veřejný ceník pro samoplátce](https://webkalkulacka.agellab.cz/) | Ceny pro samoplátce (opisují se ručně, web se nescrapuje) | – |
| [Inker et al., NEJM 2021](https://doi.org/10.1056/NEJMoa2102953) | eGFR (rovnice CKD-EPI 2021) | – |

**Zjednodušení:** laboratorní koeficient BONlab a regulační omezení vyhlášky nejsou modelovány (výnos = body × hodnota bodu);
smluvní koeficienty pojišťoven (±3 %), ceny reagencií, QC, leasing a režie jsou fiktivní, ale realistické.

## Struktura projektu

```
data_gen/            Python generátor dat (katalog, žádanky, výsledky, nákladový model, registr metod)
data/source/         skutečná zdrojová data (body VZP) a šablona ceníku pro samoplátce
public/data/         vygenerované Parquet soubory, které aplikace načítá
src/db/              DuckDB-WASM, hook pro dotazy, sestavování podmínky WHERE z filtrů
src/domain/          nákladový model a bod zvratu (čisté funkce s testy)
src/pages/           stránky klinického a business módu
src/components/      grafy, slicery, rozložení a UI komponenty
src/locales/         české a anglické překlady
.github/workflows/   sestavení, testy a nasazení na GitHub Pages
```

## Nasazení

Každý push do větve `main` spustí v GitHub Actions lint, typovou kontrolu, testy a produkční build a výsledek
publikuje na GitHub Pages. Soubory předchozího nasazení se ponechávají, aby stránky uložené v cache prohlížeče dál fungovaly.

## Autorka

**Mgr. Barbora Fišerová** – [GitHub](https://github.com/holoubkova96-lang)

## Licence

[MIT](LICENSE)
