"""Výsledky (fact_results).

Postup:
1. Výběr vyšetření – každá žádanka dostane „panely“ podle důvodu epizody,
   oddělení a chronických onemocnění pacienta.
2. Latentní klinické faktory žádanky (zánět, ledviny, srdce, játra, glykémie,
   koagulace, pankreas, štítná žláza). Sdílený faktor vytváří korelace mezi
   analyty (kreatinin ↔ urea ↔ eGFR, troponin ↔ NT-proBNP).
3. Hodnota = zdravá populace (normální / log-normální rozdělení) + posun
   podle faktorů, pohlaví, věku a sezóny; hemolýza a chybné vzorky.
4. Časová razítka analýzy, validace a hlášení kritických hodnot; body a výnos.
"""
import numpy as np
import pandas as pd

import config
from catalog import BY_KEY, CATALOG, LIFECYCLE
from test_dims import CHEM_SPLIT, DUAL_CHEM_MIN_WEIGHT

PANELS = {
    "elyte": ["NA", "K", "CL"], "renal": ["UREA", "CREA", "EGFR"], "glu": ["GLU"],
    "liver": ["ALT", "AST", "GGT", "ALP", "BILI"], "crp": ["CRP"], "cbc": ["KO_DIF"],
    "coag": ["PT_INR", "APTT"], "cardiac": ["TNT"], "bnp": ["NTPROBNP"],
    "lipid": ["CHOL", "HDL", "LDL", "TAG"], "thyroid": ["TSH", "FT4"], "minerals": ["CA", "MG", "P"],
    "protein": ["ALB", "TP"], "lip": ["LIP"], "ua": ["UA"], "ck": ["CK"], "hba1c": ["HBA1C"],
    "iron": ["FERR"], "vitd": ["VITD"], "b12fol": ["B12", "FOL"], "pct": ["PCT"], "ddim": ["DDIM"],
    "fbg": ["FBG"], "fw": ["FW"], "antixa": ["ANTIXA"], "il6": ["IL6"], "ace": ["ACE"], "kryo": ["KRYO"],
}

# Pravděpodobnost panelu podle důvodu epizody („followup“ = 2. a další den hospitalizace)
PANEL_P = {
    "infection": dict(elyte=.9, renal=.9, glu=.6, liver=.45, crp=.95, cbc=.95, coag=.2, pct=.35, minerals=.2, protein=.3, fw=.15, ddim=.05, fbg=.1, iron=.05),
    "sepsis": dict(elyte=1, renal=1, glu=.9, liver=.8, crp=1, cbc=1, coag=.9, pct=.8, il6=.3, minerals=.7, protein=.6, fbg=.6, ddim=.3, antixa=.08, lip=.2, ck=.2),
    "cardiac": dict(elyte=.95, renal=.95, glu=.7, liver=.4, crp=.5, cbc=.9, coag=.5, cardiac=.7, bnp=.6, lipid=.3, minerals=.4, thyroid=.15, ddim=.15, ck=.3, antixa=.05, ua=.1, protein=.2),
    "renal": dict(elyte=1, renal=1, glu=.5, minerals=.8, protein=.5, ua=.5, cbc=.9, crp=.5, liver=.3, iron=.15),
    "diabetes": dict(elyte=.9, renal=.9, glu=1, hba1c=.6, lipid=.5, liver=.4, cbc=.7, crp=.4, ua=.2),
    "gi_liver": dict(elyte=.9, renal=.9, glu=.5, liver=1, lip=.6, crp=.7, cbc=.9, coag=.5, protein=.6, iron=.1, b12fol=.08),
    "general": dict(elyte=.8, renal=.8, glu=.6, liver=.5, crp=.5, cbc=.85, protein=.3, minerals=.25, thyroid=.1, iron=.1, b12fol=.05, vitd=.03, ua=.1, lipid=.1),
    "preop": dict(elyte=.9, renal=.9, glu=.7, cbc=1, coag=.9, liver=.3, crp=.3),
    "abdominal": dict(elyte=.9, renal=.9, glu=.6, liver=.9, lip=.8, crp=.9, cbc=1, coag=.3, protein=.2),
    "trauma": dict(elyte=.9, renal=.8, glu=.6, cbc=1, coag=.8, ck=.6, liver=.4, crp=.3, ddim=.1, fbg=.2),
    "postop": dict(elyte=1, renal=1, glu=.8, cbc=1, coag=.8, crp=.9, pct=.3, minerals=.6, protein=.5, liver=.5, antixa=.12, il6=.08, fbg=.4),
    "oncology": dict(elyte=.9, renal=.9, liver=.9, cbc=1, crp=.6, protein=.5, minerals=.4, ua=.3, iron=.2, b12fol=.1),
    "chest_pain": dict(elyte=.9, renal=.9, glu=.7, cbc=.9, cardiac=.95, bnp=.4, ddim=.35, crp=.5, liver=.3, coag=.3, ck=.3),
    "checkup": dict(elyte=.6, renal=.7, glu=.8, lipid=.55, liver=.45, cbc=.6, thyroid=.2, ua=.15, hba1c=.05, vitd=.12, b12fol=.04, iron=.06, fw=.1, crp=.2, protein=.1, ace=.006, kryo=.003),
    "chronic_followup": dict(elyte=.8, renal=.85, glu=.6, hba1c=.2, lipid=.4, liver=.4, cbc=.6, thyroid=.2, minerals=.3, iron=.1, b12fol=.08, vitd=.08, ua=.2, bnp=.08, crp=.25, fw=.1, protein=.2, ace=.012, kryo=.005, coag=.05),
    "acute": dict(elyte=.7, renal=.7, glu=.5, crp=.9, cbc=.9, liver=.4, fw=.2, ddim=.05),
    "followup": dict(elyte=.9, renal=.85, glu=.5, crp=.6, cbc=.8, coag=.2, liver=.2, minerals=.25, pct=.1, cardiac=.05, protein=.15, antixa=.03, il6=.02),
}
# Rutinní panely se škálují na cílových ~7 vyšetření na žádanku; vzácné metody zvlášť
ROUTINE_PANELS = ["elyte", "renal", "glu", "liver", "crp", "cbc", "coag", "lipid", "protein", "minerals", "ua"]
ROUTINE_SCALE = .6
RARE_SCALE = {"antixa": 2.5, "il6": 2.2, "ace": 3.0, "kryo": 2.0}
ADULT_ONLY_PANELS = ["lipid", "hba1c", "antixa", "il6", "ace", "kryo", "bnp", "vitd"]

# Latentní faktory podle důvodu epizody: průměrná závažnost (0 = zdravý)
FACTORS = ["inf", "ren", "card", "liv", "gly", "coag", "pan", "thy"]
REASON_FACTORS = {
    "infection": dict(inf=1.6), "sepsis": dict(inf=2.6, ren=.8, liv=.5, coag=1.2, gly=.4),
    "cardiac": dict(card=1.5, ren=.4, coag=.6), "renal": dict(ren=1.8, inf=.3), "diabetes": dict(gly=1.6, ren=.3),
    "gi_liver": dict(liv=1.8, inf=.5, coag=.6, pan=.4), "general": dict(inf=.4), "preop": dict(),
    "abdominal": dict(inf=1.0, liv=.6, pan=1.4), "trauma": dict(inf=.3, coag=.5, card=.2),
    "postop": dict(inf=1.2, coag=.6, ren=.3), "oncology": dict(inf=.6, liv=.5),
    "chest_pain": dict(card=1.2, coag=.3), "checkup": dict(), "chronic_followup": dict(), "acute": dict(inf=1.0),
}

# Citlivost analytu na faktor (v jednotkách SD, u log-normálních v log-SD)
BETAS = {
    "NA": dict(inf=-.4, ren=-.2), "K": dict(ren=.9), "UREA": dict(ren=1.4, inf=.2, card=.2), "CREA": dict(ren=2.0, card=.15),
    "GLU": dict(gly=2.5, inf=.3), "HBA1C": dict(gly=2.4), "ALT": dict(liv=2.0, card=.3), "AST": dict(liv=1.8, card=.6),
    "GGT": dict(liv=1.6), "ALP": dict(liv=1.2), "BILI": dict(liv=1.2), "ALB": dict(inf=-.8, liv=-.5), "TP": dict(inf=-.4),
    "CRP": dict(inf=1.55), "PCT": dict(inf=1.25), "IL6": dict(inf=1.4), "TNT": dict(card=2.0, ren=.5),
    "NTPROBNP": dict(card=1.6, ren=.6), "CK": dict(card=.6, inf=.3), "LIP": dict(pan=2.2),
    "CHOL": dict(gly=.4), "LDL": dict(gly=.4), "TAG": dict(gly=.8), "HDL": dict(gly=-.4),
    "TSH": dict(thy=1.0), "FT4": dict(thy=-.6), "FERR": dict(inf=1.0), "KO_DIF": dict(inf=1.0), "PT_INR": dict(coag=2.0), "APTT": dict(coag=1.0),
    "DDIM": dict(coag=.8, inf=.6, card=.4), "FBG": dict(inf=1.2), "FW": dict(inf=1.0),
    "CA": dict(ren=-.3), "P": dict(ren=1.2), "MG": dict(ren=.5), "UA": dict(ren=1.0, gly=.3),
}
SEX_F_MULT = {"CREA": .8, "CK": .75, "UA": .8, "FERR": .55}
CHILD_MULT = {"ALP": 2.5, "CREA": .5, "UA": .8}
BATCH_TESTS = {"IL6": [1, 4], "ACE": [1, 4], "KRYO": [2]}  # dny v týdnu (Po=0), kdy běží série
ANALYZER_TAT = {  # medián minut příjem → analýza (STAT, rutina)
    "AN_CHEM": (22, 55), "AN_IMMU": (35, 90), "AN_HEM": (12, 35), "AN_COAG": (25, 60), "AN_SPEC": (240, 600),
}


def _season(doy: np.ndarray, peak_doy: int) -> np.ndarray:
    return np.cos(2 * np.pi * (doy - peak_doy) / 365)


def _select_tests(o: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    panels = list(PANELS)
    table = pd.DataFrame(PANEL_P).T.reindex(columns=panels).fillna(0)
    table[ROUTINE_PANELS] *= ROUTINE_SCALE
    for p_, k in RARE_SCALE.items():
        table[p_] = (table[p_] * k).clip(upper=1)
    P = table.loc[o["profile"]].to_numpy().copy()
    col = {p: i for i, p in enumerate(panels)}
    cat = o["category"].to_numpy()

    def boost(mask, panel, p):
        P[mask, col[panel]] = np.maximum(P[mask, col[panel]], p)

    boost((cat == "DIAB") | (o["_diabetes"].to_numpy() & (o["kind"] == "EXTERNAL").to_numpy()), "hba1c", .85)
    boost(cat == "DIAB", "glu", 1)
    boost(cat == "ENDO", "thyroid", .95)
    boost(o["_thyroid"].to_numpy() & (cat == "PL"), "thyroid", .7)
    boost(cat == "KARD", "lipid", .7)
    boost(cat == "KARD", "bnp", .4)
    for p_, v in (("renal", 1), ("minerals", .9), ("ua", .6), ("iron", .4)):
        boost(cat == "NEFRO", p_, v)
    for p_ in ("iron", "b12fol", "thyroid"):
        boost(cat == "GYN", p_, .3)
    child = o["age"].to_numpy() < 18
    for p_ in ADULT_ONLY_PANELS:
        P[child, col[p_]] = 0

    chosen = rng.random(P.shape) < P
    chosen[~chosen.any(axis=1), col["cbc"]] = True
    oi, pi = np.nonzero(chosen)
    sel = pd.DataFrame({"oidx": oi, "panel": np.array(panels)[pi]})
    sel["test_id"] = sel["panel"].map(PANELS)
    sel = sel.explode("test_id", ignore_index=True)
    sel = sel[~((sel["test_id"] == "EGFR") & child[sel["oidx"]])]

    # Životní cyklus: metoda se provádí jen mezi zavedením a zrušením
    when = o["collected_at"].to_numpy()[sel["oidx"]]
    ok = np.ones(len(sel), bool)
    for key, (start, end, *_r) in LIFECYCLE.items():
        m = (sel["test_id"] == key).to_numpy()
        ok[m] &= when[m] >= np.datetime64(start)
        if end:
            ok[m] &= when[m] <= np.datetime64(end) + np.timedelta64(1, "D")
    return sel[ok].drop(columns="panel").reset_index(drop=True)


def _order_factors(o: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    n = len(o)
    F = pd.DataFrame(0.0, index=o.index, columns=FACTORS)
    for reason, fs in REASON_FACTORS.items():
        m = (o["_reason"] == reason).to_numpy()
        for f, v in fs.items():
            F.loc[m, f] = v
    F["ren"] += 1.3 * o["_ckd"] + .3 * (o["age"] > 75)
    F["gly"] += 1.5 * o["_diabetes"]
    F["card"] += .7 * o["_cardiac"]
    F["inf"] += .5 * o["_oncology"]
    F["liv"] += .3 * o["_oncology"]
    F["coag"] += 6 * (o["_cardiac"].to_numpy() & (rng.random(n) < .25))  # warfarinizovaní pacienti
    # Porucha štítné žlázy: kladně = hypotyreóza (TSH ↑, fT4 ↓), záporně = hypertyreóza
    F["thy"] = o["_thyroid"].to_numpy() * rng.choice([-2.5, 2.5], n, p=[.3, .7])
    # Zánět je v zimě častější a těžší
    F["inf"] *= o["_inflammation"].to_numpy() * (1 + .25 * _season(o["doy"].to_numpy(), 20))
    # Hospitalizace: stav se den ode dne zlepšuje
    decay = .82 ** o["day_idx"].to_numpy()
    for f in FACTORS:
        if f not in ("coag", "thy"):
            F[f] = F[f] * decay * rng.lognormal(0, .35, n) + rng.normal(0, .25, n)
    return F.clip(lower=-1.5)


def _ckd_epi(crea_umol: np.ndarray, age: np.ndarray, female: np.ndarray) -> np.ndarray:
    """eGFR CKD-EPI 2021 (bez rasy), výsledek v ml/s/1,73 m²."""
    scr = crea_umol / 88.4
    kappa = np.where(female, .7, .9)
    alpha = np.where(female, -.241, -.302)
    egfr = (142 * np.minimum(scr / kappa, 1) ** alpha * np.maximum(scr / kappa, 1) ** -1.2
            * .9938 ** age * np.where(female, 1.012, 1))
    return egfr / 60


def _values(r: pd.DataFrame, F: pd.DataFrame, rng: np.random.Generator) -> np.ndarray:
    val = np.full(len(r), np.nan)
    female = (r["sex"] == "F").to_numpy()
    child = r["age"].to_numpy() < 18
    for t in CATALOG:
        m = (r["test_id"] == t.key).to_numpy()
        if not m.any() or t.dist == "calc":
            continue
        k = m.sum()
        shift = np.zeros(k)
        for f, b in BETAS.get(t.key, {}).items():
            shift += b * F[f].to_numpy()[r["oidx"].to_numpy()[m]]
        mu = np.full(k, t.mu, float)
        mu[female[m]] *= SEX_F_MULT.get(t.key, 1)
        mu[child[m]] *= CHILD_MULT.get(t.key, 1)
        if t.key == "VITD":  # vrchol koncem léta
            shift += 1.0 * _season(r["doy"].to_numpy()[m], 225)
        if t.key == "HDL":
            mu[female[m]] += .3
        z = rng.standard_normal(k) + shift
        if t.dist == "lognorm":
            v = mu * np.exp(t.sigma * z)
        else:
            v = mu + t.sigma * z
            v = np.maximum(v, mu * .25)
        val[m] = v

    # eGFR z vygenerovaného kreatininu téže žádanky
    crea = r.loc[r["test_id"] == "CREA", ["oidx"]].assign(v=val[(r["test_id"] == "CREA").to_numpy()])
    crea_by_order = pd.Series(crea["v"].to_numpy(), index=crea["oidx"].to_numpy())
    m = (r["test_id"] == "EGFR").to_numpy()
    c = crea_by_order.reindex(r["oidx"].to_numpy()[m]).to_numpy()
    val[m] = _ckd_epi(c, r["age"].to_numpy()[m], female[m])
    return val


def _flags(r: pd.DataFrame, ref: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    adult = np.where(r["age"] >= 18, 18, 0)
    rr = r[["test_id", "sex"]].assign(age_min=adult).merge(ref, on=["test_id", "sex", "age_min"], how="left")
    v, lo, hi = r["value"].to_numpy(), rr["ref_low"].to_numpy(float), rr["ref_high"].to_numpy(float)
    clo = r["test_id"].map(lambda k: BY_KEY[k].crit[0] if BY_KEY[k].crit else None).to_numpy(float)
    chi = r["test_id"].map(lambda k: BY_KEY[k].crit[1] if BY_KEY[k].crit else None).to_numpy(float)
    flag = np.select([v <= clo, v >= chi, v < lo, v > hi], ["LL", "HH", "L", "H"], "N").astype(object)
    flag[np.isnan(v)] = None
    return flag, np.isin(flag, ["LL", "HH"])


def build_results(orders: pd.DataFrame, patients: pd.DataFrame, depts: pd.DataFrame, tests: pd.DataFrame,
                  ref: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    o = orders.merge(patients.drop(columns=["insurer_code"]), on="patient_id", how="left") \
              .merge(depts[["dept_id", "category", "kind", "is_inpatient"]], on="dept_id", how="left")
    o["age"] = o["collected_at"].dt.year - o["birth_year"]
    o["doy"] = o["collected_at"].dt.dayofyear
    o["day_idx"] = o.groupby("episode_id").cumcount()
    o["profile"] = np.where(o["is_inpatient"] & (o["day_idx"] > 0), "followup", o["_reason"])
    n = len(o)

    # Vlastnosti vzorku (na úrovni žádanky)
    issue = np.select([rng.random(n) < .025, rng.random(n) < .006, rng.random(n) < .003],
                      ["HEMOLYSIS", "CLOT", "INSUFFICIENT"], "NONE")
    chem_an = np.where(rng.random(n) < CHEM_SPLIT, "AN_CHEM1", "AN_CHEM2")

    F = _order_factors(o, rng)
    r = _select_tests(o, rng)
    oi = r["oidx"].to_numpy()
    for c in ("sex", "age", "doy"):
        r[c] = o[c].to_numpy()[oi]
    r["value"] = _values(r, F, rng)

    # Hemolýza: falešně vyšší K a AST
    r["sample_issue"] = issue[oi]
    hem = (r["sample_issue"] == "HEMOLYSIS").to_numpy()
    for key, add in (("K", lambda k: rng.uniform(.3, 1.6, k)), ("AST", lambda k: 0)):
        m = hem & (r["test_id"] == key).to_numpy()
        r.loc[m, "value"] = r.loc[m, "value"] * (1.3 if key == "AST" else 1) + add(m.sum())
    # Sraženina (citrát/EDTA) a nedostatečný objem: výsledek nevydán
    group = r["test_id"].map(lambda k: BY_KEY[k].analyzer).to_numpy()
    lost = ((r["sample_issue"] == "CLOT").to_numpy() & np.isin(group, ["AN_HEM", "AN_COAG"])) | \
           ((r["sample_issue"] == "INSUFFICIENT").to_numpy() & (rng.random(len(r)) < .5))
    r.loc[lost, "value"] = np.nan
    r.loc[(r["sample_issue"] == "CLOT").to_numpy() & ~lost, "sample_issue"] = "NONE"

    dec = r["test_id"].map(lambda k: BY_KEY[k].decimals)
    r["value"] = [round(v, d) if not np.isnan(v) else np.nan for v, d in zip(r["value"], dec)]
    r["flag"], r["is_critical"] = _flags(r, ref)

    # Analyzátor
    dual = r["test_id"].map(lambda k: BY_KEY[k].weight >= DUAL_CHEM_MIN_WEIGHT).to_numpy()
    r["analyzer_id"] = np.where(group == "AN_CHEM", np.where(dual, chem_an[oi], "AN_CHEM1"), group)

    # Časová razítka
    stat = (o["priority"] == "STAT").to_numpy()[oi]
    received = o["received_at"].to_numpy()[oi]
    med = np.array([ANALYZER_TAT[g][0 if s else 1] for g, s in zip(group, stat)], float)
    hour = pd.DatetimeIndex(received).hour.to_numpy()
    med *= np.where((hour >= 7) & (hour < 11) & ~stat, 1.3, 1)  # ranní špička
    analyzed = received + (rng.lognormal(np.log(med), .45) * 60).astype("timedelta64[s]")
    for key, days in BATCH_TESTS.items():  # série 1–2× týdně v 10:00
        m = (r["test_id"] == key).to_numpy()
        for i in np.nonzero(m)[0]:
            d = pd.Timestamp(received[i]).normalize() + pd.Timedelta(days=1)
            while d.weekday() not in days:
                d += pd.Timedelta(days=1)
            analyzed[i] = np.datetime64(d + pd.Timedelta(hours=10, minutes=int(rng.integers(0, 90))))
    night = (hour >= 22) | (hour < 6)
    vmed = np.where(stat, 6, 35) * np.where(night, 1.4, 1)
    validated = analyzed + (rng.lognormal(np.log(vmed), .6) * 60).astype("timedelta64[s]")
    r["analyzed_at"] = analyzed
    r["validated_at"] = validated
    report = validated + (rng.lognormal(np.log(11), .7, len(r)) * np.where(night, 1.5, 1) * 60).astype("timedelta64[s]")
    r["critical_reported_at"] = pd.Series(report).where(r["is_critical"].to_numpy())
    r.loc[~r["value"].notna(), ["analyzed_at", "validated_at"]] = pd.NaT

    # Opakované měření v laboratoři (kritická hodnota, hemolýza, náhodně)
    r["is_repeat"] = (r["is_critical"] & (rng.random(len(r)) < .6)) | \
                     (hem & (r["test_id"] == "K").to_numpy()) | (rng.random(len(r)) < .015)

    # Body a výnos
    t = tests.set_index("test_id")
    reportable = r["value"].notna().to_numpy()
    pts = r["test_id"].map(t["points"]).to_numpy() * reportable
    payer = o["payer_type"].to_numpy()[oi]
    ins = o["insurer_code"].to_numpy()[oi]
    spec = r["test_id"].map(t["specialty"]).to_numpy()
    pv_map = {(s, i): config.point_value(s, i) for s in config.POINT_VALUE_BY_SPECIALTY for i in config.INSURERS}
    pv = np.array([pv_map.get((s, i), 0.0) for s, i in zip(spec, ins)])
    price = r["test_id"].map(t["self_pay_price_czk"]).to_numpy() * reportable
    r["points"] = pts.astype(int)
    r["revenue_czk"] = np.round(np.where(payer == "SELF", price, pts * pv), 2)

    r["order_id"] = o["order_id"].to_numpy()[oi]
    r = r.sort_values(["order_id", "test_id"]).reset_index(drop=True)
    r.insert(0, "result_id", np.arange(1, len(r) + 1))
    return r


EXPORT_RESULT_COLS = ["result_id", "order_id", "test_id", "analyzer_id", "value", "flag", "is_critical",
                      "analyzed_at", "validated_at", "critical_reported_at", "sample_issue", "is_repeat",
                      "points", "revenue_czk"]
