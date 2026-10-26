# Zdrojová data

| Soubor | Obsah | Zdroj |
|---|---|---|
| `szv_body.csv` | kódy výkonů a bodové hodnoty | [VZP – Zdravotní výkony](https://vzp.cz/poskytovatele/ciselniky/zdravotni-vykony), číselník v. 1482 (platnost od 1. 10. 2026), staženo 26. 10. 2026 |
| `ceny_samoplatci.csv` | ceny pro samoplátce (vyplňuje se ručně) | veřejný ceník https://webkalkulacka.agellab.cz/ |

Hodnota bodu 0,86 Kč je **přibližná** (vyhláška č. 432/2025 Sb., příloha č. 5) a je nastavitelná v konfiguraci generátoru.

## Jak vyplnit `ceny_samoplatci.csv`

Web ceníku nepovoluje automatické stahování, proto se ceny opisují ručně.

1. Otevři https://webkalkulacka.agellab.cz/.
2. Pro každý řádek CSV vyhledej vyšetření podle názvu (sloupec `nazev`).
3. Do `cena_kc` napiš cenu v Kč **bez mezer a měny, desetinnou tečkou** (např. `120` nebo `89.50`).
4. Do `datum_overeni` napiš datum ve formátu `RRRR-MM-DD` (např. `2026-10-27`).
5. Když vyšetření v ceníku není, nech `cena_kc` prázdné a do `poznamka` napiš `nenalezeno` – generátor pak cenu odhadne z bodů a označí ji jako odhad.
6. Soubor ulož jako **CSV UTF-8** (v Excelu: *Uložit jako → CSV UTF-8 (oddělený čárkami)*). Neměň pořadí ani názvy sloupců.

Tip: Excel v české lokalizaci může používat středník a desetinnou čárku. Bezpečnější je soubor upravit ve VS Code nebo Poznámkovém bloku.
