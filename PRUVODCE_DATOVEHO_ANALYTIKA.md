# Průvodce projektem LabInsight – očima datového analytika

Tento text tě provede celým projektem tak, jako by ti ho vysvětloval kolega, který ho postavil. Nejdřív *proč*
projekt vznikl a jakou otázku řeší, pak *jak* je postavený, odkud jsou data, co ukazuje každá stránka a proč
zrovna takovým grafem. Na konci najdeš, jak projekt odprezentovat na pohovoru a na co se tě nejspíš zeptají.

> Živé demo: https://holoubkova96-lang.github.io/labinsight/
> Všechna data o pacientech, objemech a nákladech jsou fiktivní.

---

## Obsah

1. [Jakou otázku projekt řeší](#1-jakou-otázku-projekt-řeší)
2. [Architektura a proč byla zvolena](#2-architektura-a-proč-byla-zvolena)
3. [Odkud jsou data](#3-odkud-jsou-data)
4. [Datový model: hvězdicové schéma](#4-datový-model-hvězdicové-schéma)
5. [Nákladový model a bod zvratu](#5-nákladový-model-a-bod-zvratu)
6. [Stránky dashboardu – co, proč a pro koho](#6-stránky-dashboardu--co-proč-a-pro-koho)
7. [Metody srozumitelně](#7-metody-srozumitelně)
8. [Klíčové SQL dotazy krok za krokem](#8-klíčové-sql-dotazy-krok-za-krokem)
9. [Principy dobrého dashboardu a kde jsou v projektu](#9-principy-dobrého-dashboardu-a-kde-jsou-v-projektu)
10. [Jak projekt odprezentovat na pohovoru](#10-jak-projekt-odprezentovat-na-pohovoru)
11. [Možná rozšíření](#11-možná-rozšíření)
12. [Slovníček](#12-slovníček)

---

## 1. Jakou otázku projekt řeší

**Hlavní otázka:** *Vyplatí se nám tato laboratorní metoda vzhledem k její frekvenci a nákladům na provedení?*

V laboratořích se často stává, že se zavede nová metoda (např. nový marker zánětu), protože o ni kliničtí lékaři
projevili zájem. Po roce se ukáže, že vzorků je málo a metoda prodělává – a zruší se. Peníze za validaci, zaškolení
a vyhozené reagencie jsou pryč.

Proč malá frekvence prodělává? Protože velká část nákladů **nezávisí na počtu vzorků**:

- kontrola kvality (QC) se měří každý den, i když přijdou dva vzorky,
- analyzátor je potřeba kalibrovat a platit jeho leasing,
- laboratoř platí externí hodnocení kvality (EHK),
- otevřená reagencie vydrží jen několik dní – co se nespotřebuje, vyhodí se.

Tyto **fixní náklady** se rozpočítají na málo výsledků, a náklad na jeden výsledek pak „exploduje“.
Dashboard tohle ukazuje přehledně a s daty, takže by se takové rozhodnutí dalo udělat dřív, než se metoda zavede.

Dashboard má proto **dva módy pro dvě publika**:

| Mód | Pro koho | Otázky |
|---|---|---|
| **Klinický** | lékaři, vedoucí laboratoře | Kolik vzorků zpracujeme? Jak často jsou výsledky patologické? Jak rychle vydáváme výsledky? |
| **Business** | management, ekonomové, obchodníci | Kolik vyděláváme a na čem? Které metody prodělávají? Co nás stály zrušené metody? |

---

## 2. Architektura a proč byla zvolena

```
Python generátor (seed 42) → soubory Parquet → DuckDB-WASM v prohlížeči → SQL dotaz → graf ECharts
```

### Statická webová aplikace (bez serveru)
Aplikace je jen sada souborů (HTML, JavaScript, data), které hostuje zdarma **GitHub Pages**. Nepotřebuje server,
databázi v cloudu ani přihlašování. Pro portfolio ideální: odkaz funguje pořád a nic nestojí.

### DuckDB-WASM – SQL databáze přímo v prohlížeči
**DuckDB** je analytická databáze (podobně jako v BI nástrojích). Verze **WASM** běží přímo v prohlížeči návštěvníka.
Při otevření dashboardu se do ní nahrají data a **každé číslo i každý graf vzniká skutečným SQL dotazem** –
u každého grafu je tlačítko „Zobrazit SQL“. Dotaz nad 360 tisíci řádky trvá desítky milisekund.

Proč ne jen předpočítaná čísla v JSON? Protože by nefungovaly filtry: každá kombinace filtrů by potřebovala
vlastní předpočítaná data. S databází se dotaz prostě spustí znovu s jinou podmínkou `WHERE`.

### Parquet – sloupcový formát dat
Data jsou uložená v souborech **Parquet**. Je to sloupcový komprimovaný formát (data stejného sloupce jsou u sebe
a dobře se komprimují). 363 tisíc výsledků zabere asi 6 MB – v CSV by to bylo několikanásobně víc.

### Další stavební kameny
| Technologie | K čemu |
|---|---|
| React + TypeScript | Aplikace složená z komponent (karta grafu, KPI dlaždice, filtr). TypeScript hlídá datové typy. |
| Apache ECharts | Knihovna grafů – histogramy, boxploty, heatmapy, Sankey, bublinové grafy. |
| Zustand | Drží stav filtrů a propisuje ho do adresy URL (pohled jde sdílet odkazem). |
| react-i18next | Přepínání čeština / angličtina, formát čísel a dat podle jazyka. |
| Tailwind CSS | Vzhled, světlý a tmavý režim. |
| Vitest | Automatické testy výpočtů (nákladový model, bod zvratu, sestavování SQL). |
| GitHub Actions | Po každé změně kód otestuje, sestaví a nasadí na web. |

---

## 3. Odkud jsou data

### Co je skutečné
- **Body výkonů:** kódy a bodové hodnoty 45 vyšetření z číselníku VZP „Zdravotní výkony“ (verze 1482, platná od 1. 10. 2026).
  Např. sodík 25 bodů, CRP 160 bodů, troponin 997 bodů.
- **Hodnota bodu:** úhradová vyhláška č. 432/2025 Sb. pro rok 2026 – pro akreditovanou laboratoř **0,80 Kč**
  (klinická biochemie 801, odbornost 813), **0,90 Kč** (hematologie 818) a **1,05 Kč** (výkony kapitoly 999).
- **Výnos výsledku** pro pojišťovnu = body × hodnota bodu. Např. CRP: 160 b. × 0,80 Kč = 128 Kč.
- **Odborné principy:** referenční a kritické meze, rovnice eGFR (CKD-EPI 2021), struktura žádanky a výsledku.

### Co je fiktivní (a proč tak vypadá)
Data vytvořil skript v Pythonu (`data_gen/generate.py`). Má pevný **seed 42**, takže při každém spuštění vznikne
přesně stejná sada dat – výsledky jdou zopakovat (tzv. reprodukovatelnost).

| Data | Objem | Jak vznikla |
|---|---|---|
| Pacienti | 5 000 | Jen pseudonymizované ID, pohlaví, rok narození, věková skupina, pojišťovna, okres – žádná jména ani rodná čísla (ukázka přístupu podle GDPR). |
| Žádanky | 50 000 | Po **epizodách péče**: hospitalizovaný pacient má odběry několik dní po sobě, urgentní příjem jednu žádanku, ambulance jednotlivé návštěvy. |
| Výsledky | ~363 000 | Hodnoty podle realistických rozdělení – viz níže. |
| Náklady | měsíčně za metodu | Nákladový model (kapitola 5). |

**Proč mají data takové rozdělení a vztahy:**
- **Log-normální rozdělení** u enzymů (ALT, AST) a CRP: většina hodnot je nízko, ale pár pacientů má hodnoty
  mnohonásobně vyšší → histogram je zešikmený doprava. Tak to v laboratoři opravdu vypadá.
- **Sezónnost:** CRP (zánět) je vyšší v zimě (respirační infekce), vitamin D je nejvyšší koncem léta (slunce).
- **Korelace:** kreatinin, urea a eGFR spolu souvisí (ledviny), troponin a NT-proBNP taky (srdce). V generátoru
  to zajišťuje sdílený „klinický faktor“ pacienta.
- **Denní a týdenní rytmus:** ranní odběry na odděleních, méně vzorků o víkendu.
- **Chyby vzorků:** malé procento hemolytických vzorků (falešně vysoký draslík) a sražených vzorků (výsledek se nevydá).

**Ceny pro samoplátce** mají pocházet z veřejného ceníku. Web nepovoluje automatické stahování, proto se
opisují ručně do `data/source/ceny_samoplatci.csv`. Dokud tam nejsou, generátor je odhadne (body × hodnota bodu × 1,35).

---

## 4. Datový model: hvězdicové schéma

Data jsou uspořádaná do **hvězdicového schématu** (star schema), standardu v datových skladech a BI:

- **Faktové tabulky** zaznamenávají *události* a obsahují čísla, která sčítáme:
  - `fact_orders` – žádanka (jeden odběr vzorku): kdo, kdy, pro koho, priorita, plátce,
  - `fact_results` – výsledek jednoho vyšetření: hodnota, příznak (L/H/LL/HH), časová razítka, body, výnos,
  - `fact_monthly_costs` – měsíční náklady metody rozpadlé na složky.
- **Dimenze** popisují *kdo / co / kde*:
  - `dim_patients`, `dim_tests` (katalog vyšetření s body), `dim_departments`, `dim_reference_ranges`,
    `dim_method_registry` (životní cyklus metod).

```
                 dim_patients
                      │
dim_departments ── fact_orders ── fact_results ── dim_tests ── dim_reference_ranges
                                                     │
                                  fact_monthly_costs ┘── dim_method_registry
```

**Proč hvězda?** Faktové tabulky jsou dlouhé (statisíce řádků), dimenze krátké. Dotaz „výsledky podle oddělení“ je
jeden JOIN faktu s dimenzí. Navíc se názvy (např. oddělení) neopakují v každém řádku faktu.

**Široké tabulky v aplikaci:** po načtení si aplikace jednou spojí fakty s dimenzemi do `results_wide` a
`costs_wide`. Každý filtr pak odpovídá jednomu sloupci jedné tabulky a všechny grafy můžou používat **stejnou
podmínku WHERE**. To je princip, na kterém stojí cross-filtering.

---

## 5. Nákladový model a bod zvratu

Tohle je srdce business módu. **Pozor na rozdíl:** prodejní cena (body × hodnota bodu, ceník) **není** náklad.
Náklad je, kolik laboratoř za provedení vyšetření skutečně zaplatí.

### Složky nákladu metody za měsíc
| Složka | Typ | Proč |
|---|---|---|
| Reagencie a spotřební materiál | variabilní | roste s každým testem |
| Personál (minuty laboranta a VŠ) | variabilní | čas na zpracování a validaci |
| Kontrola kvality (QC) | **fixní** | měří se denně bez ohledu na počet vzorků |
| Kalibrace | **fixní** | pravidelně a při změně šarže reagencie |
| **Expirace reagencií** | „skrytá“ | otevřené balení vydrží jen pár dní; při malé frekvenci se většina vyhodí |
| EHK (externí hodnocení kvality) | **fixní** | roční poplatek za metodu |
| Leasing a servis analyzátoru | **fixní** | podíl metody na nákladech přístroje |
| Odpis validace a zaškolení | **fixní** | jednorázové náklady zavedení rozložené do 36 měsíců |
| Režie laboratoře | podle objemu | informační systém, budova, vedení |

### Skutečný náklad na jeden výsledek
```
náklad na výsledek = všechny náklady metody za měsíc / počet vydaných výsledků
```
Když se fixní náklady (třeba 15 000 Kč měsíčně) rozpočítají na 600 výsledků, je to 25 Kč na výsledek.
Na 10 výsledků je to 1 500 Kč. Proto **křivka nákladu na výsledek prudce stoupá doleva** (k nízké frekvenci).

### Expirace reagencií – proč je tak zrádná
Generátor ji simuluje den po dni: balení na 50 testů má po otevření stabilitu 4 dny. Při 3 testech denně
(+ QC) se za 4 dny spotřebuje asi 20 testů a zbylých 30 se vyhodí. Při 50 testech denně se balení spotřebuje
za den a nic se nevyhodí. Expirace tak dramaticky trestá málo časté metody.

### Bod zvratu (break-even)
Nejnižší měsíční frekvence, při které výnos pokryje všechny náklady:
```
bod zvratu = fixní náklady / (výnos na test − variabilní náklad na test)
```
Příklad: fixní náklady 8 000 Kč měsíčně, výnos 100 Kč a variabilní náklad 20 Kč na test →
8 000 / 80 = **100 testů měsíčně**. Pod touto hranicí metoda prodělává.
Kvůli schodovitému chování expirace aplikace počítá bod zvratu numericky (zkouší frekvence od 1 nahoru);
tato funkce má automatické testy (`src/domain/costModel.test.ts`).

**Pokud je výnos na test nižší než variabilní náklad, bod zvratu neexistuje** – metoda prodělává při jakékoli
frekvenci (v datech kryoglobuliny).

### Absorpční kalkulace (jak se náklady přiřazují k filtrům)
Náklady laboratoře neznají oddělení ani plátce – reagencie se nekupují „pro chirurgii“. Když v dashboardu
vyfiltruješ chirurgii, aplikace spočítá náklad jejích výsledků takto:
```
náklad = počet výsledků chirurgie × náklad na výsledek dané metody v daném měsíci
```
Díky tomu dává marže smysl i s filtrem. Na pohovoru je to silné téma – ukazuje, že rozumíš rozdílu mezi
náklady laboratoře a náklady konkrétního zákazníka.

### Proč se metody zavádějí a ruší – a jak tomu dashboard předejde
Generátor obsahuje 8 nově zavedených metod: **5 zrušených** (IL-6, anti-Xa, ACE, kryoglobuliny, foláty) a
**3 osvědčené** (prokalcitonin, troponin, NT-proBNP). Typické chyby, které stránka *Životní cyklus metod* odhalí:

- **Optimistický plán:** u folátů plánovali 120 testů měsíčně, skutečnost byla 44.
- **Plán pod bodem zvratu:** u ACE ležel už samotný plán (45 testů) hluboko pod bodem zvratu (~650) –
  metoda nemohla být zisková nikdy.
- **Skryté náklady:** u kryoglobulinů nikdo nezapočítal 25 minut práce laboranta na vzorek.

Jak by dashboard chybě předešel: před zavedením stačí nakreslit křivku nákladu na výsledek (stránka
*Frekvence vs. náklad*) a porovnat realistickou frekvenci s bodem zvratu.

---

## 6. Stránky dashboardu – co, proč a pro koho

U každého grafu je ikona ⓘ s vysvětlením pojmu, tlačítko **Zobrazit SQL** a export **CSV / PNG**.
Tlačítkem **Stáhnout dashboard** (vpravo v liště záložek) se uloží celá stránka – filtry, KPI i grafy – jako jeden obrázek PNG,
třeba do prezentace nebo e-mailu.

### Klinický mód

#### 1) Přehled
- **Co ukazuje:** 5 KPI – počet vzorků (49 956), podíl patologických výsledků (28,3 %), počet kritických hodnot
  (1 769), medián TAT pro STAT (63 min) a rutinu (252 min). Pod nimi sloupcový graf žádanek po měsících
  rozdělený na STAT a rutinu.
- **Proč KPI dlaždice:** jedno číslo s popiskem se přečte za sekundu – nejdůležitější informace patří nahoru.
- **Proč skládaný sloupcový graf:** porovnává objem v čase (výška) a zároveň složení (STAT vs. rutina).
  Spojnicový graf by složení neukázal, koláč by neukázal čas.
- **Interakce:** klik na měsíc nastaví filtr období na tento měsíc.
- **Otázka:** Kolik toho děláme a jak rychle? **Pro koho:** vedoucí laboratoře.

#### 2) Výsledky a distribuce
- **Histogram** hodnot vybraného vyšetření s čárkovanými **referenčními mezemi** (zvlášť pro muže a ženy).
  *Proč histogram:* ukáže tvar rozdělení – u kreatininu je vidět zešikmení doprava. Průměr by tohle zakryl.
- **Boxploty** podle oddělení, pohlaví nebo věku. *Proč boxplot:* porovná rozložení hodnot mezi mnoha
  skupinami na jednom místě (medián, kvartily, rozptyl). Histogramů pro 24 oddělení by bylo nepřehledně moc.
- **Vyšetření nejčastěji mimo meze** – vodorovné skládané sloupce (pod mezí / nad mezí). *Proč vodorovné:*
  dlouhé názvy vyšetření se vejdou na osu. Klik na sloupec přepne celou stránku na dané vyšetření.
- **Otázka:** Jak vypadají výsledky a liší se mezi skupinami pacientů? **Pro koho:** lékaři, odborní pracovníci.

#### 3) TAT a provoz
- **Heatmapa zatížení** (den v týdnu × hodina příjmu). *Proč heatmapa:* dvě kategorie a jedno číslo – barva
  okamžitě ukáže ranní špičku ve všední dny. Užitečné pro plánování směn.
- **Kumulativní rozdělení TAT** (ECDF). *Proč:* odpovídá přímo na otázku „kolik procent vzorků stihneme do
  hodiny?“. Průměr by zkreslily pomalé vzorky.
- **Fáze TAT** (transport → laboratoř → validace). Ukazuje, kde vzorek tráví nejvíc času.
- **Sankeyův diagram** priorita → stav vzorku → výsledek. *Proč Sankey:* ukazuje toky mezi stavy; šířka pásu
  je počet výsledků (např. kolik vzorků bylo hemolytických a kolik výsledků se nevydalo).
- **Otázka:** Jak rychle a plynule laboratoř pracuje? **Pro koho:** vedoucí laboratoře, management provozu.

### Business mód

#### 4) Přehled
- **KPI:** výkony, objem bodů, výnos (19,5 mil. Kč), náklady, **marže (11,7 %)**, výnos na žádanku. U každého
  změna **m/m** (proti minulému měsíci) a **r/r** (proti stejnému měsíci loni).
- **Měsíční výnosy, náklady a marže** – sloupce pro výnos a náklad, čára pro marži. Všechno v Kč → jedna osa.
- **Výnosy, náklady a marže podle skupiny vyšetření** – klik filtruje skupinu.
- **Zajímavost v datech:** propady marže v lednu a březnu 2025 jsou jednorázové odpisy validace zrušených metod.

#### 5) Frekvence vs. náklad (hlavní stránka)
- **Bublinový graf:** osa X = měsíční frekvence (logaritmická), osa Y = marže na výsledek, velikost bubliny =
  celkový výnos, barva = ziskovost. Čtyři **kvadranty** (hranice: medián frekvence a nulová marže):
  - **Hvězdy** – vysoká frekvence, zisk (pilíře laboratoře),
  - **Objemové** – vysoká frekvence, ztráta (optimalizovat náklady),
  - **Niche, ale ziskové** – nízká frekvence, zisk (udržet),
  - **Kandidáti na zrušení** – nízká frekvence, ztráta.
  *Proč logaritmická osa X:* frekvence sahají od 3 do 700 měsíčně; na lineární ose by se málo časté metody
  slepily u nuly. *Proč bubliny:* jeden graf ukáže tři čísla najednou. Extrémně ztrátové metody jsou mimo osu
  a vypsané pod grafem (aby nezmáčkly ostatní).
- **Křivka nákladu na výsledek** pro vybranou metodu (klik na bublinu): ukazuje, jak náklad klesá s frekvencí,
  vodorovnou čáru výnosu na výsledek a **bod zvratu** v jejich průsečíku. Kosočtverec = skutečnost.
- **Paretova analýza** výnosů a ztrát (sloupce = podíl, čára = kumulativně, čárkovaně 80 %).
- **Otázka:** Které metody se vyplatí a které ne? **Pro koho:** management, ekonomové.

#### 6) Životní cyklus metod
- **Časová osa (Gantt)** zavedených a zrušených metod – modře osvědčené, červeně zrušené.
- **Plán vs. skutečnost** – šedě plánovaná frekvence, barevně skutečná.
- **Kumulovaný výsledek** každé nové metody v čase: osvědčené rostou (+2,49 mil. Kč), zrušené klesají
  (−1,97 mil. Kč). Zrušené jsou čárkovaně (barva není jediné rozlišení).
- **Karty „lessons learned“**: plán, skutečnost, bod zvratu z modelu, výsledek, důvod zrušení, poučení.
- **Otázka:** Co nás stály špatná rozhodnutí a co mělo varovat předem? **Pro koho:** vedení, které rozhoduje o nových metodách.

### Filtry (slicery)
Období (s rychlými volbami 3/6/12 měsíců, letos, vše), oddělení, skupina vyšetření, vyšetření, věková skupina,
pohlaví a plátce (zdravotní pojišťovna vs. samoplátce). Aktivní filtry se zobrazí jako „chips“ nad grafy
a zruší se jedním klikem. Filtry se ukládají do adresy – odkaz otevře stejný pohled.
Na nákladová data se filtry oddělení, věk, pohlaví a plátce přímo nevztahují – proto absorpční kalkulace (kap. 5).

---

## 7. Metody srozumitelně

| Metoda | Jednoduše | Kde v projektu |
|---|---|---|
| **Medián** | prostřední hodnota po seřazení; na rozdíl od průměru ho nerozhodí pár extrémů | TAT, boxploty |
| **Percentil** | 90. percentil = 90 % hodnot je pod ním; ukazuje „dlouhý ocas“ pomalých vzorků | TAT |
| **Histogram** | rozdělí hodnoty do intervalů a spočítá, kolik jich padne do každého | Výsledky |
| **Boxplot** | krabice = prostředních 50 % hodnot, čára = medián, vousy = 5. a 95. percentil | Výsledky |
| **ECDF** (kumulativní rozdělení) | pro každý čas říká, jaký podíl vzorků už má výsledek | TAT |
| **Heatmapa** | tabulka, kde číslo vyjadřuje barva | TAT |
| **Sankey** | toky mezi stavy, šířka pásu = množství | TAT |
| **Pareto (80/20)** | často malá část položek tvoří většinu efektu; seřadíme od největší a sčítáme | Frekvence vs. náklad |
| **Bod zvratu** | frekvence, od které výnos pokryje náklady | Frekvence vs. náklad, Životní cyklus |
| **Absorpční kalkulace** | náklady se přiřadí výsledkům podle nákladu na výsledek | celý business mód |
| **m/m, r/r** | změna proti minulému měsíci / proti stejnému měsíci loni (r/r odstraní vliv sezónnosti) | Business přehled |
| **Logaritmická osa** | každý dílek je násobek (1, 10, 100…); vhodná pro hodnoty v řádově různé velikosti | Frekvence vs. náklad |

---

## 8. Klíčové SQL dotazy krok za krokem

Všechny dotazy najdeš v aplikaci přes „Zobrazit SQL“. Tady jsou tři nejdůležitější, zjednodušeně.
Podmínka `WHERE …` vzniká z filtrů (např. `collected_date >= DATE '2025-01-01' AND dept_id IN ('INT')`).

### A) KPI klinického přehledu – CTE a agregace s filtrem
```sql
WITH f AS (                       -- 1) jen výsledky odpovídající filtrům
  SELECT * FROM results_wide
  WHERE …
),
tat AS (                          -- 2) TAT se počítá na úrovni žádanky (jeden vzorek)
  SELECT order_id, priority,
         date_diff('minute', min(collected_at), max(validated_at)) AS tat_min
  FROM f
  WHERE validated_at IS NOT NULL
  GROUP BY order_id, priority
)
SELECT count(DISTINCT order_id)                               AS samples,       -- vzorky
       count(*) FILTER (WHERE flag IN ('L','H','LL','HH'))    AS pathological,  -- patologické
       count(*) FILTER (WHERE is_critical)                    AS critical,      -- kritické
       (SELECT median(tat_min) FROM tat WHERE priority = 'STAT') AS tat_stat    -- medián TAT
FROM f;
```
**Co si odnést:** `WITH` (CTE) rozdělí dotaz na čitelné kroky. `count(*) FILTER (WHERE …)` spočítá jen řádky
splňující podmínku – bez nutnosti psát více dotazů. TAT se počítá **na žádanku**, ne na výsledek
(vzorek je hotový, až když je hotový poslední výsledek – proto `max(validated_at)`).

### B) Náklad na výsledek a absorpční kalkulace
```sql
WITH cpr AS (                     -- náklad na vydaný výsledek podle metody a měsíce
  SELECT month_key, test_id,
         sum(total_cost_czk) / nullif(sum(reportable_results), 0) AS cost_per_result
  FROM costs_wide
  GROUP BY month_key, test_id
)
SELECT r.month_key,
       sum(r.revenue_czk)          AS revenue,
       sum(cpr.cost_per_result)    AS cost       -- každý výsledek nese náklad své metody
FROM results_wide r
LEFT JOIN cpr USING (month_key, test_id)
WHERE r.value IS NOT NULL AND …
GROUP BY r.month_key;
```
**Co si odnést:** `nullif(…, 0)` brání dělení nulou. JOIN přes dvojici klíčů (`month_key`, `test_id`)
přiřadí každému výsledku náklad jeho metody v daném měsíci – to je absorpční kalkulace.

### C) Histogram v SQL
```sql
WITH f AS (SELECT value FROM results_wide WHERE test_id = 'CREA' AND value IS NOT NULL AND …),
r AS (SELECT quantile_cont(value, 0.005) AS lo, quantile_cont(value, 0.995) AS hi FROM f)
SELECT least(greatest(floor((value - lo) / ((hi - lo) / 40)), 0), 39) AS bin,   -- číslo koše 0–39
       count(*) AS n
FROM f, r
GROUP BY bin ORDER BY bin;
```
**Co si odnést:** rozsah se bere mezi 0,5. a 99,5. percentilem, aby pár extrémních hodnot neroztáhlo osu;
extrémy spadnou do krajních košů (`least` / `greatest`).

---

## 9. Principy dobrého dashboardu a kde jsou v projektu

| Princip | Jak je uplatněný |
|---|---|
| **Hierarchie informací – KPI nahoře** | Každá přehledová stránka začíná dlaždicemi s nejdůležitějšími čísly, detaily jsou níž. |
| **Jedna stránka = jedna otázka** | Klinický přehled: „kolik a jak rychle“, Frekvence vs. náklad: „co se vyplatí“. |
| **Správný typ grafu pro data** | Čas → sloupce/čára, rozdělení → histogram/boxplot, dvě kategorie → heatmapa, tři čísla → bubliny. Žádné koláče. |
| **Jedna osa Y** | Graf nikdy nemá dvě osy s různými jednotkami (snadno zavádějí). |
| **Barvy s významem** | Každý mód má svou akcentovou barvu. Zisk modře, ztráta červeně. Kritické hodnoty ve stavové barvě. Paleta je ověřená pro barvoslepé. |
| **Barva není jediný nosič informace** | Zrušené metody čárkovaně, popisky „▲ / ▼“ u změn, legenda u každého grafu s více řadami. |
| **Cross-filtering** | Klik do grafu filtruje celý dashboard; filtry jsou vidět jako „chips“ a jdou zrušit. |
| **Kontext a vysvětlení** | Ikona ⓘ u odborných pojmů, podtitulky grafů říkají, jak graf číst. |
| **Důvěryhodnost** | „Zobrazit SQL“ u každého grafu, uvedené zdroje, viditelný disclaimer o fiktivních datech. |
| **Storytelling s daty** | Klinický pohled → co děláme; business přehled → kolik vyděláváme; frekvence vs. náklad → co prodělává; životní cyklus → co nás stály chyby. |

---

## 10. Jak projekt odprezentovat na pohovoru

### Pětiminutový scénář
1. **Problém (30 s):** „Laboratoře zavádějí metody, které pak ruší, protože prodělávají. Chtěla jsem ukázat, jak tomu předejít daty.“
2. **Data (45 s):** „Data jsou fiktivní, ale body výkonů a hodnota bodu jsou skutečné z číselníku VZP a úhradové vyhlášky.
   Generátor v Pythonu vytváří realistická rozdělení, sezónnost a korelace.“
3. **Klinický přehled (45 s):** ukaž KPI a klikni na měsíc v grafu – „všechny čísla se přepočítají, filtr vidím nahoře“.
4. **Frekvence vs. náklad (1,5 min):** ukaž kvadranty, klikni na bublinu IL-6, ukaž křivku a bod zvratu –
   „metoda by potřebovala stovky testů měsíčně, měla jich dvacet“.
5. **Životní cyklus (45 s):** „Zrušené metody stály skoro 2 miliony; u ACE byl už plán pod bodem zvratu.“
6. **Technika (45 s):** otevři „Zobrazit SQL“ – „každé číslo je SQL dotaz v databázi DuckDB, která běží v prohlížeči“.

### Na co upozornit
- Rozumíš **doméně** (laboratoř, úhrady, QC) i **datům** – to je kombinace, kterou junior analytik často nemá.
- **Rozdíl prodejní cena vs. náklad** a absorpční kalkulace.
- **Reprodukovatelnost:** generátor s pevným seedem, data jdou vytvořit znovu jedním příkazem.
- **Kontrola kvality práce:** automatické testy výpočtů, nasazení přes GitHub Actions.

### Otázky, které můžeš čekat (a jak odpovědět)
- **„Proč jsou data fiktivní?“** – Skutečná pacientská data nesmím zveřejnit (GDPR). Proto fiktivní, ale realistická,
  a kde to šlo, napojená na skutečné veřejné zdroje.
- **„Jak jste ověřila, že čísla sedí?“** – Generátor vypisuje kontrolní statistiky (podíly, korelace, sezónnost) a
  výpočty nákladového modelu mají automatické testy. V dashboardu jdou čísla dohledat přes SQL.
- **„Proč medián, a ne průměr TAT?“** – Pár velmi pomalých vzorků by průměr zkreslil; medián popisuje typický vzorek.
- **„Co je bod zvratu a proč u nízké frekvence roste náklad?“** – Fixní náklady (QC, kalibrace, leasing, expirace) se dělí menším počtem výsledků.
- **„Jak byste dashboard rozšířila?“** – Viz kapitola 11 (přihlášení a role pro více laboratoří, napojení na LIS, upozornění).
- **„Jak byste řešila přístup k datům, kdyby šlo o skutečné laboratoře?“** – Přihlášení a role přes Supabase,
  data v úložišti s pravidly Row Level Security, každá laboratoř vidí jen svá data. Bezpečnost musí hlídat server,
  ne jen skryté tlačítko v aplikaci (kapitola 11.1).
- **„Co bylo nejtěžší?“** – Např. přiřadit náklady k filtrům (absorpční kalkulace) nebo nasimulovat expiraci reagencií.
- **„Proč DuckDB, a ne Power BI?“** – Chtěla jsem projekt, který si kdokoli otevře odkazem bez licence, a ukázat SQL.
  Principy (hvězdicové schéma, míry, cross-filtering) jsou stejné jako v Power BI.

---

## 11. Možná rozšíření

### 11.1 Přihlášení, role a více laboratoří

Dnes je dashboard veřejná ukázka s fiktivními daty. Kdyby měl sloužit skutečným laboratořím, potřeboval by
přihlášení a řízení přístupu. Tady je promyšlený návrh – na pohovoru ukazuje, že vidíš i bezpečnost a provoz,
ne jen grafy.

#### Proč to nejde „jen přidat“ do současné aplikace
Aplikace je **statická stránka** (GitHub Pages) a data jsou soubory Parquet ve **veřejném repozitáři**.
Přihlašovací okno přidané jen do prohlížeče by bylo **na oko**: kdokoli by si data stáhl přímo z adresy souboru.
Skutečné role potřebují **server**, který data drží a u každého požadavku ověří, kdo se ptá a co smí.

> **Klíčová věta na pohovor:** „Bezpečnost se nedá vyřešit v prohlížeči. Prohlížeč může tlačítko schovat,
> ale data musí chránit server – kontrolou oprávnění u každého požadavku.“

#### Navržené řešení: Supabase (free tier)
[Supabase](https://supabase.com) je služba, která v jednom balíku nabízí:

| Služba | K čemu v LabInsight |
|---|---|
| **Auth** (přihlášení) | e-mail + heslo nebo „magic link“, případně přihlášení přes Google / Microsoft účet nemocnice |
| **Postgres databáze** | tabulky laboratoří, uživatelů a jejich rolí |
| **Storage** (úložiště souborů) | soubory Parquet s daty, zvlášť pro každou laboratoř |
| **Row Level Security (RLS)** | pravidla přímo v databázi: uživatel vidí jen řádky a soubory své laboratoře |

Free tier stačí na ukázku i malý provoz (stovky MB dat, desítky tisíc přihlášených uživatelů měsíčně).
Omezení: neaktivní projekt se po týdnu „uspí“ a probudí se až při další návštěvě.

#### Role
| Role | Prohlížet dashboard | Stáhnout data (CSV, Parquet) | Nahrát nová data | Spravovat uživatele |
|---|:-:|:-:|:-:|:-:|
| **Čtenář** (např. lékař) | ✓ | – | – | – |
| **Analytik** | ✓ | ✓ | – | – |
| **Správce laboratoře** | ✓ | ✓ | ✓ | ✓ (jen své laboratoře) |

Role se přiděluje **pro konkrétní laboratoř** – jeden člověk může být analytikem v jedné laboratoři a čtenářem v jiné.

#### Datový model navíc
```
laboratories (lab_id, name)
memberships  (user_id, lab_id, role)      -- kdo je v které laboratoři a s jakou rolí
datasets     (dataset_id, lab_id, period, file_path, uploaded_by, uploaded_at)
```
Ke stávajícímu hvězdicovému schématu by přibyl sloupec **`lab_id`** ve faktových tabulkách. Díky němu jde
porovnávat laboratoře mezi sebou (benchmarking) – a zároveň hlídat, kdo smí vidět čí data.

#### Jak by to fungovalo
1. Uživatel se přihlásí → Supabase vrátí **token** (podepsaný „průkaz“, kdo je).
2. Aplikace si s tokenem vyžádá data své laboratoře. **RLS pravidlo** v databázi pustí jen soubory,
   ke kterým má uživatel členství; ostatní server vůbec nevydá.
3. Soubory se stahují přes **podepsané odkazy s krátkou platností** (např. 10 minut), ne přes veřejnou adresu.
4. DuckDB-WASM v prohlížeči pak pracuje stejně jako dnes – dashboard se téměř nemění.
5. **Nahrání dat** (správce laboratoře): formulář pro soubor CSV/Parquet → kontrola formátu a povinných
   sloupců → uložení do Storage → záznam do tabulky `datasets`.
6. **Stahování dat** a export CSV vidí jen role Analytik a Správce. Tlačítko se ostatním skryje,
   ale hlavně ho **server odmítne** – skrytí v aplikaci je jen pohodlí, ne ochrana.

#### Na co myslet (otázky, které můžeš dostat)
- **Osobní údaje (GDPR):** do cloudu jen pseudonymizovaná data (bez jmen a rodných čísel), smlouva o zpracování
  osobních údajů s poskytovatelem, datacentrum v EU.
- **Audit:** kdo a kdy data nahrál nebo stáhl (tabulka logů).
- **Kvalita nahraných dat:** validace před uložením (správné sloupce, jednotky, rozsahy hodnot), jinak
  by jedna chybná dávka zkreslila celý dashboard.
- **Veřejná ukázka zůstane:** recruiter musí vidět demo bez účtu → fiktivní data dál na GitHub Pages,
  přihlášená verze zvlášť.
- **Alternativy:** Firebase (Google), Clerk nebo Auth0 jen na přihlášení, případně firemní přihlášení přes
  Microsoft Entra ID v nemocnici. Supabase vychází nejlépe, protože přihlášení, databáze, úložiště i pravidla
  přístupu jsou na jednom místě.

### 11.2 Další rozšíření

- **Napojení na skutečný laboratorní informační systém (LIS)** a pravidelná aktualizace dat (např. noční export do Parquetu).
- **Simulátor zavedení nové metody:** formulář s parametry (body, cena reagencie, stabilita, očekávaná frekvence) → bod zvratu dřív, než se metoda zavede.
- **Make-or-buy:** porovnání vlastního provádění s odesláním vzorků do referenční laboratoře.
- **Prognóza objemů** (trend + sezónnost) pro objednávky reagencií a plánování kapacit.
- **Kontrola kvality** (Levey-Jenningsovy grafy, Westgardova pravidla) pro odborné publikum.
- **Upozornění:** e-mail, když metoda tři měsíce za sebou klesne pod bod zvratu.

---

## 12. Slovníček

| Pojem | Vysvětlení |
|---|---|
| **TAT** (turnaround time) | doba od odběru vzorku do validace výsledku |
| **STAT** | statimové (urgentní) vyšetření |
| **Referenční meze** | rozmezí hodnot zdravé populace pro dané pohlaví a věk |
| **Kritická hodnota** | výsledek ohrožující pacienta; laboratoř ho musí neprodleně nahlásit lékaři |
| **Hemolýza** | rozpad červených krvinek ve vzorku; zkresluje např. draslík |
| **QC** (kontrola kvality) | měření kontrolního materiálu se známou hodnotou, ověřuje správnost metody |
| **EHK** | externí hodnocení kvality – mezilaboratorní porovnání |
| **Kalibrace** | nastavení analyzátoru pomocí standardů o známé koncentraci |
| **Body výkonu** | bodové ohodnocení výkonu v Seznamu zdravotních výkonů |
| **Hodnota bodu** | kolik Kč pojišťovna zaplatí za jeden bod (stanovuje úhradová vyhláška) |
| **Samoplátce** | pacient, který si vyšetření platí sám |
| **Marže** | výnos − náklady (v Kč nebo v % z výnosu) |
| **Bod zvratu** | frekvence, při které výnos přesně pokryje náklady |
| **Absorpční kalkulace** | přiřazení nákladů výsledkům podle nákladu na výsledek |
| **Hvězdicové schéma** | uspořádání dat do faktových tabulek a dimenzí |
| **Cross-filtering** | klik do jednoho grafu přefiltruje všechny ostatní |
| **Slicer** | ovládací prvek filtru (výběr období, oddělení…) |
| **KPI** | klíčový ukazatel výkonnosti – jedno důležité číslo |
| **Parquet** | sloupcový komprimovaný formát datových souborů |
| **DuckDB** | analytická SQL databáze; verze WASM běží v prohlížeči |
