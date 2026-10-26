"""Generátor fiktivních dat LabInsight – spuštění jedním příkazem:

    python data_gen/generate.py

Výstup: public/data/*.parquet (pro aplikaci) a data/tmp/*.parquet (latentní
rysy pro další kroky generátoru, necommituje se).
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from faker import Faker

sys.path.insert(0, str(Path(__file__).parent))

import config  # noqa: E402
from dimensions import (EXPORT_PATIENT_COLS, build_dim_date, build_dim_departments,  # noqa: E402
                        build_dim_insurers, build_patients)
from orders import EXPORT_ORDER_COLS, build_orders  # noqa: E402
from results import EXPORT_RESULT_COLS, build_results  # noqa: E402
from costs import build_monthly_costs  # noqa: E402
from qc import build_qc_runs  # noqa: E402
from registry import build_method_registry  # noqa: E402
from test_dims import build_dim_analyzers, build_dim_reference_ranges, build_dim_tests  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data"
TMP = ROOT / "data" / "tmp"


def write(df: pd.DataFrame, name: str, folder: Path = OUT) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{name}.parquet"
    # časová razítka v ms – v prohlížeči se z nich stane JS číslo bez ztráty přesnosti
    df.to_parquet(path, index=False, compression="zstd", coerce_timestamps="ms", allow_truncated_timestamps=True)
    print(f"  {path.relative_to(ROOT)}: {len(df):>7,} řádků, {path.stat().st_size / 1024:,.0f} kB")


def print_stats(patients: pd.DataFrame, depts: pd.DataFrame, orders: pd.DataFrame) -> None:
    o = orders.merge(depts[["dept_id", "category", "kind"]], on="dept_id")
    month = o["collected_at"].dt.to_period("M")
    print("\n=== Pacienti ===")
    print(patients["age_group"].value_counts(normalize=True).sort_index().round(3).to_string())
    print("ženy:", round((patients["sex"] == "F").mean(), 3))
    print("chronická onemocnění:", {c[1:]: round(patients[c].mean(), 3)
                                    for c in ["_diabetes", "_ckd", "_cardiac", "_oncology", "_thyroid"]})
    print("\n=== Žádanky ===")
    print("celkem:", len(o), "| pacientů s žádankou:", o["patient_id"].nunique(),
          "| epizod:", o["episode_id"].nunique())
    print("podíl podle žadatele:\n" + o["category"].value_counts(normalize=True).round(3).to_string())
    print("interní / externí:", o["kind"].value_counts(normalize=True).round(3).to_dict())
    print("STAT:", round((o["priority"] == "STAT").mean(), 3), "| samoplátci:", round((o["payer_type"] == "SELF").mean(), 3))
    print("pojišťovny:", o["insurer_code"].value_counts(normalize=True).round(3).to_dict())
    dow = o["collected_at"].dt.dayofweek.value_counts(normalize=True).sort_index().round(3)
    print("den v týdnu (Po=0):", dow.to_dict())
    print("hodina – top 5:", o["collected_at"].dt.hour.value_counts().head(5).to_dict())
    tat = (o["received_at"] - o["collected_at"]).dt.total_seconds() / 60
    print("transport min (medián) interní/externí:",
          round(tat[o["kind"] == "INTERNAL"].median(), 1), "/", round(tat[o["kind"] == "EXTERNAL"].median(), 1))
    per_m = o.groupby(month).size()
    print(f"měsíčně: min {per_m.min()}, max {per_m.max()}, první 3 {per_m.head(3).tolist()}, poslední 3 {per_m.tail(3).tolist()}")
    per_p = o.groupby("patient_id").size()
    print("žádanek na pacienta: medián", per_p.median(), "| 90. percentil", per_p.quantile(.9), "| max", per_p.max())


def print_result_stats(r: pd.DataFrame, orders: pd.DataFrame, tests: pd.DataFrame) -> None:
    print("\n=== Výsledky ===")
    print("celkem:", len(r), "| na žádanku:", round(len(r) / len(orders), 2),
          "| nevydáno:", int(r["value"].isna().sum()), "| opakování:", round(r["is_repeat"].mean(), 3))
    print("flag:", r["flag"].value_counts(normalize=True).round(3).to_dict())
    print("vzorky:", r["sample_issue"].value_counts(normalize=True).round(4).to_dict())
    month = pd.to_datetime(r["order_id"].map(orders.set_index("order_id")["collected_at"])).dt.to_period("M")
    active_months = r.assign(m=month).groupby("test_id")["m"].nunique()
    per_month = (r["test_id"].value_counts() / active_months).round(0).sort_values()
    print("průměrně za měsíc (aktivní měsíce), nejméně časté:", per_month.head(10).astype(int).to_dict())
    print("nejčastější:", per_month.tail(6).astype(int).to_dict())
    print("osvědčené metody:", per_month[["PCT", "TNT", "NTPROBNP"]].astype(int).to_dict())
    pct_path = r[r["is_critical"]]
    within30 = ((pct_path["critical_reported_at"] - pct_path["validated_at"]).dt.total_seconds() <= 1800).mean()
    print("kritických:", len(pct_path), "| nahlášeno do 30 min:", round(within30, 3))
    w = r.pivot_table(index="order_id", columns="test_id", values="value")
    for a, b in (("CREA", "UREA"), ("CREA", "EGFR"), ("TNT", "NTPROBNP"), ("ALT", "AST"), ("CRP", "PCT"), ("TSH", "FT4")):
        print(f"korelace log {a}–{b}:", round(np.log(w[[a, b]].dropna()).corr().iloc[0, 1], 2))
    tat = r.merge(orders[["order_id", "priority", "collected_at"]], on="order_id")
    tat_min = (tat["validated_at"] - tat["collected_at"]).dt.total_seconds() / 60
    print("medián TAT odběr→validace STAT/rutina:", round(tat_min[tat["priority"] == "STAT"].median()),
          "/", round(tat_min[tat["priority"] == "ROUTINE"].median()))
    print("výnos celkem (mil. Kč):", round(r["revenue_czk"].sum() / 1e6, 2),
          "| body celkem (mil.):", round(r["points"].sum() / 1e6, 2))
    m = r.assign(m=month)
    seas = m[m["test_id"].isin(["CRP", "VITD"])].groupby(["test_id", m["m"].dt.month])["value"].median().unstack().round(1)
    print("sezónnost (medián podle měsíce):\n" + seas.to_string())


def print_business_stats(r: pd.DataFrame, qc: pd.DataFrame, costs: pd.DataFrame, orders: pd.DataFrame) -> None:
    print("\n=== QC ===")
    z = (qc["value"] - qc["target_mean"]) / qc["target_sd"]
    print("měření:", len(qc), "| |z|>2:", round((z.abs() > 2).mean(), 3), "| |z|>3:", round((z.abs() > 3).mean(), 4))
    print("\n=== Ekonomika (36 měsíců) ===")
    rev = r.assign(month_key=r["order_id"].map(orders.set_index("order_id")["collected_at"]).dt.strftime("%Y-%m"))
    rev_t = rev.groupby("test_id")["revenue_czk"].sum()
    cost_cols = [c for c in costs.columns if c.endswith("_czk") and c != "total_cost_czk"]
    total_rev = rev_t.sum()
    print(f"výnos {total_rev / 1e6:.2f} mil. Kč")
    for c in cost_cols:
        print(f"  {c:<20} {costs[c].sum() / 1e6:6.2f} mil. ({costs[c].sum() / total_rev:5.1%})")
    print(f"provozní výsledek {(total_rev - costs['total_cost_czk'].sum()) / 1e6:.2f} mil. Kč "
          f"(marže {(1 - costs['total_cost_czk'].sum() / total_rev):.1%})")
    g = costs.groupby("test_id").agg(cost=("total_cost_czk", "sum"), n=("reportable_results", "sum"),
                                     exp=("expiry_czk", "sum"), months=("month_key", "nunique"))
    g["revenue"] = rev_t
    g["margin_pct"] = (1 - g["cost"] / g["revenue"]).round(3)
    g["cost_per_result"] = (g["cost"] / g["n"]).round(1)
    g["rev_per_result"] = (g["revenue"] / g["n"]).round(1)
    g["n_month"] = (g["n"] / g["months"]).round(0)
    g["expiry_share"] = (g["exp"] / g["cost"]).round(2)
    print(g.sort_values("margin_pct")[["n_month", "rev_per_result", "cost_per_result", "margin_pct", "expiry_share"]].to_string())


def main() -> None:
    rng = np.random.default_rng(config.SEED)
    fake = Faker("cs_CZ")
    Faker.seed(config.SEED)

    print("Generuji dimenze a žádanky…")
    dim_date = build_dim_date()
    insurers = build_dim_insurers()
    depts = build_dim_departments(fake)
    patients = build_patients(rng)
    orders = build_orders(patients, depts, dim_date, rng)
    print("Generuji výsledky…")
    tests = build_dim_tests()
    ref = build_dim_reference_ranges()
    results = build_results(orders, patients, depts, tests, ref, rng)
    print("Generuji QC, registr metod a náklady…")
    qc = build_qc_runs(rng)
    registry = build_method_registry(tests, results, orders, rng)
    costs = build_monthly_costs(results, qc, registry)

    print("\nZapisuji:")
    write(tests, "dim_tests")
    write(ref, "dim_reference_ranges")
    write(build_dim_analyzers(), "dim_analyzers")
    write(results[EXPORT_RESULT_COLS], "fact_results")
    write(qc, "fact_qc_runs")
    write(costs, "fact_monthly_costs")
    write(registry, "dim_method_registry")
    write(dim_date, "dim_date")
    write(insurers, "dim_insurers")
    write(depts.drop(columns=["order_share", "orders_per_episode", "stat_share", "patient_focus"]), "dim_departments")
    write(patients[EXPORT_PATIENT_COLS], "dim_patients")
    write(orders[EXPORT_ORDER_COLS], "fact_orders")
    write(patients, "patients_latent", TMP)
    write(orders, "orders_latent", TMP)

    print_stats(patients, depts, orders)
    print_result_stats(results, orders, tests)
    print_business_stats(results, qc, costs, orders)


if __name__ == "__main__":
    main()
