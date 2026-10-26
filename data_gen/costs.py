"""Nákladový model (fact_monthly_costs) – srdce business módu.

Pro každou metodu, analyzátor a měsíc:
- variabilní náklad: reagencie (+ mrtvý objem) a spotřební materiál na test,
- skryté náklady: QC (běží denně bez ohledu na počet vzorků), kalibrace,
  opakování, EHK a hlavně EXPIRACE otevřených reagencií – simulováno po dnech
  balení po balení,
- fixní: podíl na leasingu a servisu analyzátoru, amortizace validace
  a zaškolení u nově zavedených metod, režie laboratoře,
- osobní: minuty laboranta a VŠ na test, QC a kalibraci.

Výsledek dělený počtem vydaných výsledků = skutečný náklad na výsledek.
"""
import numpy as np
import pandas as pd

import config
from catalog import CATALOG, LIFECYCLE
from qc import active_days, analyzers_for
from test_dims import ANALYZERS

CAL_TESTS = 4          # testů reagencie spotřebovaných na 1 kalibraci
QC_TECH_MIN = 1.5      # minut laboranta na 1 QC měření
CAL_TECH_MIN = 20      # minut laboranta na 1 kalibraci


def _simulate_packs(usage: np.ndarray, pack: int, stability: int, discard_at_end: bool) -> tuple[np.ndarray, np.ndarray]:
    """Den po dni: kolik testů reagencie expirovalo a kolik balení se otevřelo."""
    waste, opened = np.zeros(len(usage)), np.zeros(len(usage))
    remaining, opened_day = 0, None
    for d, u in enumerate(usage):
        if remaining and d - opened_day >= stability:
            waste[d] += remaining
            remaining = 0
        while u > 0:
            if remaining == 0:
                remaining, opened_day = pack, d
                opened[d] += 1
            take = min(u, remaining)
            remaining -= take
            u -= take
    if discard_at_end and remaining:
        waste[-1] += remaining
    return waste, opened


def build_monthly_costs(results: pd.DataFrame, qc: pd.DataFrame, registry: pd.DataFrame) -> pd.DataFrame:
    all_days = pd.date_range(config.START_DATE, config.END_DATE, freq="D")
    res = results[results["value"].notna()].copy()
    res["day"] = res["analyzed_at"].dt.normalize()
    res["performed"] = 1 + res["is_repeat"].astype(int)
    perf = res.groupby(["test_id", "analyzer_id", "day"]).agg(performed=("performed", "sum"), reportable=("result_id", "size"))
    qcd = qc.assign(day=qc["run_at"].dt.normalize()).groupby(["test_id", "analyzer_id", "day"]).agg(
        qc_measurements=("run_id", "size"), lot=("lot_number", "first"))
    reg = registry.set_index("test_id")

    frames = []
    for t in CATALOG:
        if t.dist == "calc":
            continue
        lc = LIFECYCLE.get(t.key)
        span = all_days
        if lc:
            span = span[(span >= pd.Timestamp(lc[0])) & ((span <= pd.Timestamp(lc[1])) if lc[1] else True)]
        run_days = active_days(t.key, all_days)
        cal_every = max(1, round(30 / t.cal_per_month)) if t.cal_per_month else None
        for an in analyzers_for(t):
            idx = pd.MultiIndex.from_product([[t.key], [an], span], names=["test_id", "analyzer_id", "day"])
            d = perf.reindex(idx, fill_value=0).join(qcd.reindex(idx)).reset_index()
            d["qc_measurements"] = d["qc_measurements"].fillna(0)
            # kalibrace: pravidelně + při změně šarže reagencie
            k = np.arange(len(d))
            on_run_day = d["day"].isin(run_days).to_numpy()
            lot_change = (d["lot"].ffill() != d["lot"].ffill().shift()).to_numpy() & d["lot"].notna().to_numpy()
            regular = (k % cal_every == 0) if cal_every else np.zeros(len(d), bool)
            d["calibrations"] = ((regular | lot_change) & on_run_day).astype(int)
            usage = (d["performed"] + d["qc_measurements"] + CAL_TESTS * d["calibrations"]).to_numpy().astype(int)
            waste, opened = _simulate_packs(usage, t.pack_size, t.stability_days, discard_at_end=bool(lc and lc[1]))
            d["wasted_tests"], d["packs_opened"] = waste, opened
            frames.append(d.drop(columns="lot"))

    daily = pd.concat(frames, ignore_index=True)
    daily["month_key"] = daily["day"].dt.strftime("%Y-%m")
    m = daily.groupby(["month_key", "test_id", "analyzer_id"], as_index=False)[
        ["performed", "reportable", "qc_measurements", "calibrations", "wasted_tests", "packs_opened"]].sum()
    m = m.rename(columns={"performed": "tests_performed", "reportable": "reportable_results"})
    cat = pd.DataFrame([c.__dict__ for c in CATALOG]).set_index("key")
    p = cat.loc[m["test_id"]].reset_index(drop=True)

    rate_t, rate_u = config.HOURLY_RATE_LAB_TECH / 60, config.HOURLY_RATE_UNIVERSITY / 60
    m["reagent_czk"] = m["tests_performed"] * p["reagent_czk"] * (1 - config.CONSUMABLE_SHARE) * (1 + config.DEAD_VOLUME)
    m["consumables_czk"] = m["tests_performed"] * p["reagent_czk"] * config.CONSUMABLE_SHARE
    m["qc_czk"] = m["qc_measurements"] * p["qc_czk"]
    m["calibration_czk"] = m["calibrations"] * p["cal_czk"]
    m["expiry_czk"] = m["wasted_tests"] * p["reagent_czk"]
    m["staff_czk"] = (m["tests_performed"] * (p["tech_min"] * rate_t + p["uni_min"] * rate_u)
                      + m["qc_measurements"] * QC_TECH_MIN * rate_t + m["calibrations"] * CAL_TECH_MIN * rate_t)

    # Podíl metody na analyzátoru (podle spotřeby testů) → leasing a servis
    m["_load"] = m["tests_performed"] + m["qc_measurements"]
    load_total = m.groupby(["month_key", "analyzer_id"])["_load"].transform("sum")
    lease = m["analyzer_id"].map({a[0]: a[4] for a in ANALYZERS})
    m["lease_service_czk"] = lease * m["_load"] / load_total.replace(0, np.nan)

    # Náklady na úrovni metody (EHK, validace) se dělí mezi analyzátory podle objemu
    test_load = m.groupby(["month_key", "test_id"])["_load"].transform("sum")
    n_an = m.groupby(["month_key", "test_id"])["_load"].transform("size")
    share = np.where(test_load > 0, m["_load"] / test_load.replace(0, np.nan), 1 / n_an)
    m["ehk_czk"] = p["ehk_year_czk"] / 12 * share

    one_off = (m["test_id"].map(reg["validation_cost_czk"]) + m["test_id"].map(reg["training_cost_czk"])).fillna(0)
    intro = pd.PeriodIndex(m["test_id"].map(reg["introduced_on"]).astype(str), freq="M")
    cancel = m["test_id"].map(reg["cancelled_on"])
    months_since = (pd.PeriodIndex(m["month_key"], freq="M") - intro).map(lambda x: x.n)
    amort = np.where((months_since >= 0) & (months_since < config.VALIDATION_AMORT_MONTHS), one_off / config.VALIDATION_AMORT_MONTHS, 0)
    # Při zrušení se zbytek neodepsané validace odepíše jednorázově
    is_cancel_month = cancel.notna() & (m["month_key"] == cancel.astype(str).str[:7])
    remaining = one_off * np.clip(1 - (months_since + 1) / config.VALIDATION_AMORT_MONTHS, 0, 1)
    m["validation_czk"] = (amort + np.where(is_cancel_month, remaining, 0)) * share

    # Režie laboratoře (LIS, budova, vedení) podle podílu na vydaných výsledcích
    rep_total = m.groupby("month_key")["reportable_results"].transform("sum")
    m["overhead_czk"] = config.LAB_OVERHEAD_MONTH_CZK * m["reportable_results"] / rep_total

    cost_cols = ["reagent_czk", "consumables_czk", "qc_czk", "calibration_czk", "expiry_czk", "ehk_czk",
                 "staff_czk", "lease_service_czk", "validation_czk", "overhead_czk"]
    m[cost_cols] = m[cost_cols].fillna(0).round(2)
    m["total_cost_czk"] = m[cost_cols].sum(axis=1).round(2)
    for c in ["tests_performed", "reportable_results", "qc_measurements", "calibrations", "wasted_tests", "packs_opened"]:
        m[c] = m[c].astype(int)
    return m.drop(columns="_load")
