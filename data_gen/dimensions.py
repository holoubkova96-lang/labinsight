"""Dimenze: kalendář, pojišťovny, oddělení/žadatelé, pacienti.

Pacienti mají kromě exportovaných sloupců i skryté „latentní“ rysy (chronická
onemocnění, míra využívání péče). Ty řídí realismus žádanek a výsledků, ale do
aplikace se neexportují – stejně jako je laboratoř o pacientovi nezná.
"""
from datetime import date, timedelta

import numpy as np
import pandas as pd
from faker import Faker

import config

# --- kalendář ---------------------------------------------------------------

_EASTER_MONDAYS = [date(2024, 4, 1), date(2025, 4, 21), date(2026, 4, 6)]
_FIXED_HOLIDAYS = [(1, 1), (5, 1), (5, 8), (7, 5), (7, 6), (9, 28), (10, 28), (11, 17), (12, 24), (12, 25), (12, 26)]


def _czech_holidays(years: range) -> set[date]:
    days = {date(y, m, d) for y in years for m, d in _FIXED_HOLIDAYS}
    for em in _EASTER_MONDAYS:
        days |= {em, em - timedelta(days=3)}  # Velikonoční pondělí + Velký pátek
    return days


def build_dim_date() -> pd.DataFrame:
    days = pd.date_range(config.START_DATE, config.END_DATE, freq="D")
    holidays = _czech_holidays(range(config.START_DATE.year, config.END_DATE.year + 1))
    season = np.select(
        [days.month.isin([12, 1, 2]), days.month.isin([3, 4, 5]), days.month.isin([6, 7, 8])],
        ["winter", "spring", "summer"],
        "autumn",
    )
    return pd.DataFrame({
        "date_key": days.strftime("%Y%m%d").astype(int),
        "date": days.date,
        "year": days.year,
        "quarter": days.quarter,
        "month": days.month,
        "month_key": days.strftime("%Y-%m"),
        "iso_week": days.isocalendar().week.to_numpy(),
        "day_of_week": days.dayofweek + 1,  # 1 = pondělí
        "is_weekend": days.dayofweek >= 5,
        "is_holiday": [d in holidays for d in days.date],
        "season": season,
    })


# --- pojišťovny -------------------------------------------------------------

def build_dim_insurers() -> pd.DataFrame:
    rows = [
        {
            "insurer_code": code,
            "name_cs": cs,
            "name_en": en,
            "contract_coef": coef,  # FIKTIVNÍ – simulace individuální smlouvy
            "point_value_801": config.point_value("801", code),
            "point_value_818": config.point_value("818", code),
            "point_value_999": config.point_value("999", code),
            "is_fictional_contract": True,
        }
        for code, (cs, en, coef, _share) in config.INSURERS.items()
    ]
    return pd.DataFrame(rows)


# --- oddělení a externí žadatelé ------------------------------------------

# (id, název CZ, název EN, kategorie, lůžkové?, podíl žádanek, průměr žádanek na epizodu, podíl STAT)
INTERNAL_DEPTS = [
    ("INT", "Interna", "Internal medicine", "INT", True, .18, 3.5, .20),
    ("CHIR", "Chirurgie", "Surgery", "CHIR", True, .10, 2.5, .25),
    ("JIP", "JIP interní", "Intermediate care unit", "JIP", True, .07, 6.0, .60),
    ("ARO", "ARO", "Intensive care unit (ICU)", "ARO", True, .04, 7.0, .70),
    ("PED", "Pediatrie", "Paediatrics", "PED", True, .05, 2.0, .20),
    ("ONK", "Onkologie", "Oncology", "ONK", False, .08, 4.0, .05),
    ("URG", "Urgentní příjem", "Emergency department", "URG", False, .16, 1.15, .85),
]

# (kategorie, CZ, EN, počet ambulancí, zaměření pacientů)
EXTERNAL_TYPES = [
    ("PL", "Praktický lékař", "General practitioner", 5, None),
    ("PLDD", "Praktický lékař pro děti a dorost", "Paediatric GP", 2, "child"),
    ("DIAB", "Diabetologie", "Diabetology", 2, "diabetes"),
    ("KARD", "Kardiologie", "Cardiology", 2, "cardiac"),
    ("NEFRO", "Nefrologie", "Nephrology", 1, "ckd"),
    ("ENDO", "Endokrinologie", "Endocrinology", 1, "thyroid"),
    ("GYN", "Gynekologie", "Gynaecology", 2, "female"),
    ("INTA", "Interní ambulance", "Internal medicine outpatient clinic", 2, None),
]
EXTERNAL_ORDER_SHARE = 0.32
EXTERNAL_TYPE_WEIGHT = {"PL": 3.0, "PLDD": .6, "DIAB": 1.2, "KARD": 1.0, "NEFRO": .8, "ENDO": .8, "GYN": .7, "INTA": 1.0}


def build_dim_departments(fake: Faker) -> pd.DataFrame:
    rows = [
        dict(dept_id=i, name_cs=cs, name_en=en, category=cat, kind="INTERNAL", is_inpatient=inp,
             order_share=share, orders_per_episode=ope, stat_share=stat, patient_focus=None)
        for i, cs, en, cat, inp, share, ope, stat in INTERNAL_DEPTS
    ]
    total_w = sum(EXTERNAL_TYPE_WEIGHT[cat] * n for cat, *_rest, n, _f in EXTERNAL_TYPES)
    for cat, cs, en, n, focus in EXTERNAL_TYPES:
        for k in range(1, n + 1):
            owner = fake.unique.last_name()
            rows.append(dict(
                dept_id=f"EXT_{cat}_{k}",
                name_cs=f"{cs} – {owner} s.r.o.",
                name_en=f"{en} – {owner} Ltd.",
                category=cat, kind="EXTERNAL", is_inpatient=False,
                order_share=EXTERNAL_ORDER_SHARE * EXTERNAL_TYPE_WEIGHT[cat] / total_w,
                orders_per_episode=1.0, stat_share=.02, patient_focus=focus,
            ))
    return pd.DataFrame(rows)


# --- pacienti ---------------------------------------------------------------

AGE_GROUPS = [("0-17", 0, 17, .10), ("18-39", 18, 39, .18), ("40-64", 40, 64, .32), ("65-79", 65, 79, .27), ("80+", 80, 97, .13)]

# Spádová oblast fiktivní krajské nemocnice
DISTRICTS = {
    "Hradec Králové": .40, "Náchod": .12, "Trutnov": .12, "Jičín": .10, "Rychnov nad Kněžnou": .08,
    "Pardubice": .06, "Chrudim": .04, "Jiný okres": .08,
}

REFERENCE_YEAR = 2025  # věk pacienta uprostřed sledovaného období


def build_patients(rng: np.random.Generator) -> pd.DataFrame:
    n = config.N_PATIENTS
    grp_idx = rng.choice(len(AGE_GROUPS), size=n, p=[g[3] for g in AGE_GROUPS])
    lo = np.array([AGE_GROUPS[i][1] for i in grp_idx])
    hi = np.array([AGE_GROUPS[i][2] for i in grp_idx])
    age = rng.integers(lo, hi + 1)
    sex = np.where(rng.random(n) < .52, "F", "M")
    codes = list(config.INSURERS)
    insurer = rng.choice(codes, size=n, p=[config.INSURERS[c][3] for c in codes])
    district = rng.choice(list(DISTRICTS), size=n, p=list(DISTRICTS.values()))

    adult = age >= 18
    age_f = np.clip((age - 30) / 50, 0, 1.2)  # 0 do 30 let, ~1 v 80 letech
    p = pd.DataFrame({
        "patient_id": [f"P-{i:05d}" for i in range(1, n + 1)],
        "sex": sex,
        "birth_year": REFERENCE_YEAR - age,
        "age_group": [AGE_GROUPS[i][0] for i in grp_idx],
        "insurer_code": insurer,
        "district": district,
        # --- latentní rysy (neexportují se) ---
        "_age": age,
        "_diabetes": adult & (rng.random(n) < .03 + .18 * age_f),
        "_ckd": adult & (rng.random(n) < .01 + .20 * age_f**2),
        "_cardiac": adult & (rng.random(n) < .01 + .22 * age_f**2),
        "_oncology": adult & (rng.random(n) < .01 + .07 * age_f),
        "_thyroid": adult & (rng.random(n) < np.where(sex == "F", .08, .02)),
        "_inflammation": rng.lognormal(0, .6, n),  # individuální sklon k zánětům
    })
    chronic = p[["_diabetes", "_ckd", "_cardiac", "_oncology"]].sum(axis=1)
    # Míra využívání péče: starší a chronicky nemocní chodí častěji
    util = rng.lognormal(0, .6, n) * (1 + 1.2 * age_f) * (1 + .6 * chronic)
    p["_utilization"] = np.minimum(util, np.quantile(util, .98))  # bez extrémních „rekordmanů“
    return p


EXPORT_PATIENT_COLS = ["patient_id", "sex", "birth_year", "age_group", "insurer_code", "district"]
