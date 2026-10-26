"""Vnitřní kontrola kvality (fact_qc_runs).

Každá metoda měří denně kontrolní materiál ve 2 úrovních (L1 = fyziologická,
L2 = patologická). Do jinak stabilního procesu se vkládají typické chyby,
které mají Westgardova pravidla odhalit:
- systematický posun (např. špatná kalibrace) → 2-2s, 10x,
- pozvolný trend (stárnoucí reagencie, lampa) → 10x, nakonec 1-3s,
- náhodná odlehlá hodnota → 1-3s, R-4s,
- změna šarže reagencie → malý trvalý posun.
"""
import numpy as np
import pandas as pd

import config
from catalog import CATALOG, LIFECYCLE
from results import BATCH_TESTS
from test_dims import ANALYZERS, DUAL_CHEM_MIN_WEIGHT

CV = {"BIO": .020, "IMU": .045, "HEM": .025, "COAG": .035, "SPEC": .07}
CV_OVERRIDE = {"NA": .008, "CL": .012, "K": .015, "CA": .015}
ANALYZER_BIAS_SD = {"AN_CHEM2": .3}  # mírná systematická odchylka 2. analyzátoru
RUN_TIMES = [(6, 30), (14, 30), (22, 0)]


def analyzers_for(t) -> list[str]:
    if t.analyzer == "AN_CHEM" and t.weight < DUAL_CHEM_MIN_WEIGHT:
        return ["AN_CHEM1"]
    return [a[0] for a in ANALYZERS if a[1] == t.analyzer]


def active_days(key: str, days: pd.DatetimeIndex) -> pd.DatetimeIndex:
    if key in LIFECYCLE:
        start, end, *_ = LIFECYCLE[key]
        days = days[(days >= pd.Timestamp(start)) & ((days <= pd.Timestamp(end)) if end else True)]
    if key in BATCH_TESTS:
        days = days[days.dayofweek.isin(BATCH_TESTS[key])]
    return days


def _targets(t) -> tuple[float, float]:
    if t.dist == "lognorm":
        return t.mu, t.mu * float(np.exp(2.2 * t.sigma))
    return t.mu, t.mu + 3 * t.sigma


def _error_profile(n: int, rng: np.random.Generator) -> tuple[np.ndarray, np.ndarray]:
    """Systematická chyba (v násobcích SD) a číslo šarže pro každý den."""
    err, lot = np.zeros(n), np.zeros(n, int)
    # změny šarže reagencie každých 45–90 dní
    d = 0
    while d < n:
        span = int(rng.integers(45, 91))
        err[d:d + span] += rng.normal(0, .35)
        lot[d:d + span] = lot[d - 1] + 1 if d else 1
        d += span
    for _ in range(rng.poisson(2.5)):  # posuny
        s, ln = int(rng.integers(0, n)), int(rng.integers(3, 13))
        err[s:s + ln] += rng.choice([-1, 1]) * rng.uniform(1.6, 2.6)
    for _ in range(rng.poisson(1.5)):  # trendy
        s, ln = int(rng.integers(0, n)), int(rng.integers(10, 26))
        seg = min(ln, n - s)
        err[s:s + seg] += np.linspace(0, rng.choice([-1, 1]) * rng.uniform(2.5, 3.5), ln)[:seg]
    return err, lot


def build_qc_runs(rng: np.random.Generator) -> pd.DataFrame:
    all_days = pd.date_range(config.START_DATE, config.END_DATE, freq="D")
    frames = []
    for t in CATALOG:
        if t.dist == "calc" or t.qc_per_day == 0:
            continue
        days = active_days(t.key, all_days)
        if len(days) == 0:
            continue
        cv = CV_OVERRIDE.get(t.key, CV[t.group])
        means = _targets(t)
        for an in analyzers_for(t):
            err, lot = _error_profile(len(days), rng)
            err += ANALYZER_BIAS_SD.get(an, 0)
            for i in range(t.qc_per_day):
                if t.qc_per_day == 1:
                    level = np.where(np.arange(len(days)) % 2 == 0, 1, 2)
                else:
                    level = np.full(len(days), 1 if i % 2 == 0 else 2)
                mean = np.where(level == 1, means[0], means[1])
                sd = mean * cv
                z = rng.standard_normal(len(days))
                z[rng.random(len(days)) < .004] *= 4  # náhodná hrubá chyba
                h, m = RUN_TIMES[min(i // 2, 2)] if t.qc_per_day > 1 else RUN_TIMES[0]
                run_at = days + pd.to_timedelta(h * 60 + m + rng.integers(0, 25, len(days)), unit="min")
                frames.append(pd.DataFrame({
                    "test_id": t.key, "analyzer_id": an, "run_at": run_at, "level": level,
                    "lot_number": [f"{t.key}-{an[-4:]}-{x:03d}" for x in lot],
                    "value": np.round(mean + sd * (z + err), t.decimals + 1),
                    "target_mean": np.round(mean, t.decimals + 1), "target_sd": np.round(sd, t.decimals + 2),
                }))
    qc = pd.concat(frames, ignore_index=True).sort_values(["run_at", "test_id", "analyzer_id", "level"])
    qc.insert(0, "run_id", np.arange(1, len(qc) + 1))
    qc["date_key"] = qc["run_at"].dt.strftime("%Y%m%d").astype(int)
    return qc.reset_index(drop=True)
