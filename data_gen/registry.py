"""Registr metod (dim_method_registry): životní cyklus, plán vs. skutečnost, lessons learned.

Make-or-buy: při odeslání vzorku do referenční laboratoře vykazuje výkon
pojišťovně ta laboratoř. Nám zůstává jen náklad na preanalytiku a dopravu
(outsource_handling_czk) a delší doba odezvy (outsource_tat_hours).
"""
import numpy as np
import pandas as pd

import config
from catalog import CATALOG, LIFECYCLE

# Jednorázové náklady zavedení metody (validace/verifikace, zaškolení) – fiktivní
NEW_METHODS = {
    "ANTIXA": dict(validation=90_000, training=20_000, handling=45, tat=24,
                   reason_cs="Nízká frekvence, reagencie po otevření stabilní jen 4 dny – zhruba polovina každého balení expirovala.",
                   reason_en="Low volume; reagent stable only 4 days once opened – about half of every pack expired.",
                   lessons_cs="Plán počítal s plošným monitorováním LMWH, které klinici nezavedli. Varovat měla stabilita reagencie (4 dny) v poměru k očekávaným ~3 vzorkům denně: bod zvratu vyžadoval zhruba 130 testů měsíčně, víc než optimistický plán.",
                   lessons_en="The plan assumed routine LMWH monitoring that clinicians never adopted. The 4-day reagent stability versus ~3 samples a day should have been a red flag: break-even required about 130 tests per month – more than even the optimistic plan."),
    "IL6": dict(validation=120_000, training=25_000, handling=55, tat=48,
                reason_cs="Denní QC a kalibrace převýšily výnos – vzorků bylo zlomek plánu.",
                reason_en="Daily QC and calibration exceeded revenue – sample volume was a fraction of plan.",
                lessons_cs="Metoda byla zavedena během covidové poptávky, ta ale opadla. Fixní náklady (QC, kalibrace, EHK) tvořily většinu nákladů a bod zvratu ležel kolem 360 testů měsíčně – pětkrát nad plánem. Model nákladů by to ukázal ještě před nákupem reagencií.",
                lessons_en="Introduced on the back of COVID-era demand, which faded. Fixed costs (QC, calibration, EQA) dominated and break-even sat around 360 tests a month – five times the plan. A cost model would have shown this before any reagent was bought."),
    "ACE": dict(validation=60_000, training=15_000, handling=35, tat=72,
                reason_cs="Referenční laboratoř nabízí vyšetření levněji, než stál vlastní výsledek.",
                reason_en="The reference laboratory offered the test for less than our own cost per result.",
                lessons_cs="Indikace (sarkoidóza) je vzácná a nedá se ovlivnit. Make-or-buy analýza před zavedením by ukázala, že při desítkách testů měsíčně je odeslání výrazně výhodnější a klinicky přijatelné (TAT 3 dny nevadí).",
                lessons_en="The indication (sarcoidosis) is rare and cannot be grown. A make-or-buy analysis would have shown that at a few dozen tests a month sending out is far cheaper and clinically acceptable (a 3-day TAT is fine)."),
    "KRYO": dict(validation=40_000, training=30_000, handling=60, tat=96,
                 reason_cs="Manuální metoda s vysokou časovou náročností VŠ a laboranta.",
                 reason_en="Manual method with high specialist and technician time per test.",
                 lessons_cs="Body výkonu nepokrývají 25 minut práce laboranta na vzorek. Osobní náklady se v plánu nepočítaly, protože ‚personál už máme‘ – skrytý náklad příležitosti.",
                 lessons_en="Procedure points do not cover 25 minutes of technician time per sample. Staff cost was left out of the plan because 'we already have the staff' – a hidden opportunity cost."),
    "FOL": dict(validation=50_000, training=10_000, handling=25, tat=48,
                reason_cs="Malý objem při velkém balení reagencie – expirace otevřených balení.",
                reason_en="Small volume with a large reagent pack – opened packs expired.",
                lessons_cs="Folát se ordinuje hlavně spolu s B12, ale gastroenterologie i hematologie posílaly vzorky jinam. Varovat měl nepoměr balení 100 testů vs. 28denní stabilita při ~40 testech měsíčně.",
                lessons_en="Folate is mostly ordered together with B12, but gastroenterology and haematology kept sending samples elsewhere. The mismatch of a 100-test pack with 28-day stability at ~40 tests a month was the warning sign."),
    "PCT": dict(validation=110_000, training=15_000, handling=40, tat=24,
                reason_cs=None, reason_en=None,
                lessons_cs="Osvědčila se: jasná klinická poptávka (sepse, ATB stewardship) z ARO, JIP a interny a STAT režim, který referenční laboratoř nenabídne.",
                lessons_en="A success: clear clinical demand (sepsis, antibiotic stewardship) from ICU, IMCU and internal medicine, plus a STAT turnaround a reference lab cannot offer."),
    "NTPROBNP": dict(validation=100_000, training=15_000, handling=40, tat=24,
                     reason_cs=None, reason_en=None,
                     lessons_cs="Osvědčila se: kardiologie a interna ji zařadily do standardních postupů pro srdeční selhání; objem rostl nad plán.",
                     lessons_en="A success: cardiology and internal medicine built it into heart-failure pathways; volume grew above plan."),
    "TNT": dict(validation=110_000, training=15_000, handling=40, tat=24,
                reason_cs=None, reason_en=None,
                lessons_cs="Osvědčila se: urgentní příjem potřebuje výsledek do 60 minut (0/1h algoritmus), odeslání nepřipadá v úvahu.",
                lessons_en="A success: the emergency department needs a result within 60 minutes (0/1h algorithm), so sending out is not an option."),
}


def build_method_registry(tests: pd.DataFrame, results: pd.DataFrame, orders: pd.DataFrame,
                          rng: np.random.Generator) -> pd.DataFrame:
    month = results["order_id"].map(orders.set_index("order_id")["collected_at"]).dt.to_period("M")
    rep = results[results["value"].notna()].assign(m=month)
    vol = rep.groupby("test_id").size() / rep.groupby("test_id")["m"].nunique()
    t = tests.set_index("test_id")
    rows = []
    for c in CATALOG:
        if c.dist == "calc":
            continue
        info = NEW_METHODS.get(c.key)
        lc = LIFECYCLE.get(c.key)
        pv = config.POINT_VALUE_BY_SPECIALTY[t.at[c.key, "specialty"]]
        if lc:
            cancelled = lc[1] is not None
            category = "NEW_CANCELLED" if cancelled else "NEW_SUCCESS"
        else:
            category = "ROUTINE"
        rows.append(dict(
            test_id=c.key,
            category=category,
            method_status=t.at[c.key, "method_status"],
            introduced_on=pd.Timestamp(lc[0]).date() if lc else pd.Timestamp(int(rng.integers(2006, 2020)), int(rng.integers(1, 13)), 1).date(),
            cancelled_on=pd.Timestamp(lc[1]).date() if lc and lc[1] else None,
            planned_monthly_volume=lc[2] if lc else None,
            actual_avg_monthly_volume=round(float(vol.get(c.key, 0)), 1),
            cancellation_reason_code=lc[3] if lc else None,
            cancellation_reason_cs=info["reason_cs"] if info else None,
            cancellation_reason_en=info["reason_en"] if info else None,
            lessons_learned_cs=info["lessons_cs"] if info else None,
            lessons_learned_en=info["lessons_en"] if info else None,
            validation_cost_czk=info["validation"] if info else 0,
            training_cost_czk=info["training"] if info else 0,
            outsource_handling_czk=info["handling"] if info else round(15 + .02 * t.at[c.key, "points"] * pv),
            outsource_tat_hours=info["tat"] if info else 24,
        ))
    return pd.DataFrame(rows)
