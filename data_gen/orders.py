"""Žádanky (fact_orders).

Žádanky vznikají po *epizodách péče*: hospitalizace na JIP znamená denní odběry
několik dní po sobě, urgentní příjem obvykle jednu žádanku, onkologie cykly
po ~3 týdnech a externí ambulance jednotlivé návštěvy. Díky tomu jsou
v datech realistická opakovaná vyšetření u hospitalizovaných.
"""
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

import config

# Týdenní rytmus (Po–Ne) a vliv svátku podle typu provozu
DOW = {
    "inpatient": np.array([1.10, 1.05, 1.00, 1.00, .95, .70, .65]),
    "emergency": np.array([1.05, 1.00, 1.00, 1.00, 1.05, 1.00, .95]),
    "outpatient": np.array([1.20, 1.10, 1.05, 1.00, .80, .03, 0]),
}
HOLIDAY = {"inpatient": .70, "emergency": 1.0, "outpatient": .02}

# Rozložení hodin odběru (relativní váhy pro 0–23 h)
HOURS = {
    # ranní odběry na odděleních 5–7 h
    "routine_ward": np.array([.2, .2, .2, .3, 1, 6, 9, 5, 2, 1.5, 1.5, 1.5, 1.2, 1.2, 1, 1, .8, .6, .5, .4, .3, .3, .2, .2]),
    # STAT a urgentní příjem: celý den, špička odpoledne a večer
    "stat": np.array([1.6, 1.3, 1.1, 1, 1, 1.1, 1.5, 2.2, 3, 3.6, 4, 4.1, 4, 4, 4.1, 4.2, 4.2, 4, 3.8, 3.4, 3, 2.6, 2.2, 1.9]),
    # ambulance: dopoledne
    "outpatient": np.array([0, 0, 0, 0, 0, 0, .5, 6, 9, 8, 6, 4, 2, 1.5, 1, .5, .2, 0, 0, 0, 0, 0, 0, 0]),
}

# Důvod epizody – řídí později výběr vyšetření a výsledky (neexportuje se)
REASONS = {
    "INT": {"infection": .25, "cardiac": .20, "renal": .10, "diabetes": .10, "gi_liver": .10, "general": .25},
    "CHIR": {"preop": .45, "abdominal": .25, "trauma": .15, "infection": .15},
    "JIP": {"cardiac": .45, "infection": .20, "renal": .10, "general": .25},
    "ARO": {"sepsis": .45, "trauma": .25, "postop": .30},
    "PED": {"infection": .55, "general": .45},
    "ONK": {"oncology": 1.0},
    "URG": {"chest_pain": .22, "infection": .25, "abdominal": .20, "trauma": .13, "general": .20},
}
EXT_REASONS = {"checkup": .55, "chronic_followup": .35, "acute": .10}


def _date_weights(dim_date: pd.DataFrame, profile: str) -> np.ndarray:
    t = (pd.to_datetime(dim_date["date"]) - pd.Timestamp(config.START_DATE)).dt.days.to_numpy() / 365
    doy = pd.to_datetime(dim_date["date"]).dt.dayofyear.to_numpy()
    trend = 1 + .04 * t                                   # +4 % ročně
    season = 1 + .08 * np.cos(2 * np.pi * (doy - 20) / 365)  # vrchol v lednu (respirační sezóna)
    dow = DOW[profile][dim_date["day_of_week"].to_numpy() - 1]
    hol = np.where(dim_date["is_holiday"], HOLIDAY[profile], 1)
    w = trend * season * dow * hol
    return w / w.sum()


def _patient_weights(patients: pd.DataFrame, dept: pd.Series) -> np.ndarray:
    age = patients["_age"].to_numpy()
    w = patients["_utilization"].to_numpy().copy()
    cat, focus = dept["category"], dept["patient_focus"]
    child = age < 18
    if cat in ("PED", "PLDD"):
        w *= child
    elif cat == "URG":
        w *= np.where(child, .3, 1)
    else:
        w *= ~child
    if cat == "ONK":
        w *= patients["_oncology"].to_numpy()
    if cat in ("JIP", "ARO"):
        w *= np.where(patients["_cardiac"], 2, 1)
    if focus in ("diabetes", "cardiac", "ckd", "thyroid"):
        w *= np.where(patients[f"_{focus}"], 10, 1)
    if focus == "female":
        w *= (patients["sex"] == "F").to_numpy()
    return w / w.sum()


def _ts(day: datetime, hour_profile: str, rng: np.random.Generator) -> datetime:
    p = HOURS[hour_profile] / HOURS[hour_profile].sum()
    h = rng.choice(24, p=p)
    return day + timedelta(hours=int(h), minutes=int(rng.integers(0, 60)), seconds=int(rng.integers(0, 60)))


def _transport_minutes(kind: str, category: str, priority: str, rng: np.random.Generator) -> float:
    if kind == "EXTERNAL":
        return rng.lognormal(np.log(150), .45)  # svoz z ambulancí
    if category == "URG" or priority == "STAT":
        return rng.lognormal(np.log(12), .45)   # potrubní pošta / donáška
    return rng.lognormal(np.log(28), .5)


def build_orders(patients: pd.DataFrame, depts: pd.DataFrame, dim_date: pd.DataFrame,
                 rng: np.random.Generator) -> pd.DataFrame:
    days = pd.to_datetime(dim_date["date"]).to_numpy()
    date_w = {p: _date_weights(dim_date, p) for p in DOW}
    end = datetime.combine(config.END_DATE, datetime.max.time())

    # Pravděpodobnost výběru oddělení pro novou epizodu = podíl žádanek / žádanek na epizodu
    ep_w = (depts["order_share"] / depts["orders_per_episode"]).to_numpy()
    ep_w = ep_w / ep_w.sum()
    pat_w = {row["dept_id"]: _patient_weights(patients, row) for _, row in depts.iterrows()}
    pat_ids = patients["patient_id"].to_numpy()
    pat_age = dict(zip(patients["patient_id"], patients["_age"]))
    pat_ins = dict(zip(patients["patient_id"], patients["insurer_code"]))

    rows, episode = [], 0
    while len(rows) < config.N_ORDERS:
        d = depts.iloc[rng.choice(len(depts), p=ep_w)]
        cat, kind, stat_share = d["category"], d["kind"], d["stat_share"]
        profile = "emergency" if cat == "URG" else "inpatient" if d["is_inpatient"] else "outpatient"
        start = pd.Timestamp(days[rng.choice(len(days), p=date_w[profile])]).to_pydatetime()
        patient = rng.choice(pat_ids, p=pat_w[d["dept_id"]])
        episode += 1

        reasons = REASONS.get(cat, EXT_REASONS)
        reason = rng.choice(list(reasons), p=list(reasons.values()))

        # Časy odběrů v epizodě: (datetime, priority)
        draws: list[tuple[datetime, str]] = []
        if d["is_inpatient"]:
            n = 1 + rng.poisson(d["orders_per_episode"] - 1)
            for i in range(n):
                day = start + timedelta(days=i)
                # příjmový odběr bývá častěji STAT
                stat = rng.random() < (min(1, stat_share * 1.8) if i == 0 else stat_share)
                draws.append((_ts(day, "stat" if stat else "routine_ward", rng), "STAT" if stat else "ROUTINE"))
                if cat in ("JIP", "ARO") and rng.random() < .35:  # další odběr týž den
                    draws.append((_ts(day, "stat", rng), "STAT"))
        elif cat == "ONK":
            n = 1 + rng.poisson(3)
            for i in range(n):
                day = start + timedelta(days=int(i * 21 + rng.integers(-2, 3)))
                if day.weekday() >= 5:
                    day += timedelta(days=7 - day.weekday())
                draws.append((_ts(day, "outpatient", rng), "ROUTINE"))
        elif cat == "URG":
            first = _ts(start, "stat", rng)
            stat = rng.random() < stat_share
            draws.append((first, "STAT" if stat else "ROUTINE"))
            if rng.random() < .15:  # kontrolní odběr (např. troponin za 3 h)
                draws.append((first + timedelta(hours=float(rng.uniform(2.5, 4))), "STAT"))
        else:  # externí ambulance
            stat = rng.random() < stat_share
            draws.append((_ts(start, "outpatient", rng), "STAT" if stat else "ROUTINE"))

        self_pay = (kind == "EXTERNAL" and pat_age[patient] >= 18
                    and rng.random() < (.14 if cat in ("PL", "GYN") else .05))
        for collected, priority in draws:
            if collected > end:
                continue
            received = collected + timedelta(minutes=float(_transport_minutes(kind, cat, priority, rng)))
            rows.append((episode, patient, d["dept_id"], collected, received, priority,
                         "SELF" if self_pay else "INSURANCE", None if self_pay else pat_ins[patient], reason))

    orders = pd.DataFrame(rows, columns=["episode_id", "patient_id", "dept_id", "collected_at", "received_at",
                                         "priority", "payer_type", "insurer_code", "_reason"])
    orders = orders.sort_values("collected_at", kind="stable").reset_index(drop=True)
    orders.insert(0, "order_id", [f"O-{i:06d}" for i in range(1, len(orders) + 1)])
    orders["episode_id"] = orders["episode_id"].map(lambda e: f"E-{e:05d}")
    orders["date_key"] = orders["collected_at"].dt.strftime("%Y%m%d").astype(int)
    orders["collected_at"] = orders["collected_at"].dt.floor("s")
    orders["received_at"] = orders["received_at"].dt.floor("s")
    return orders


EXPORT_ORDER_COLS = ["order_id", "episode_id", "patient_id", "dept_id", "date_key", "collected_at",
                     "received_at", "priority", "payer_type", "insurer_code"]
