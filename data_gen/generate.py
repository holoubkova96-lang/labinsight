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

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data"
TMP = ROOT / "data" / "tmp"


def write(df: pd.DataFrame, name: str, folder: Path = OUT) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{name}.parquet"
    df.to_parquet(path, index=False, compression="zstd")
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

    print("\nZapisuji:")
    write(dim_date, "dim_date")
    write(insurers, "dim_insurers")
    write(depts.drop(columns=["order_share", "orders_per_episode", "stat_share", "patient_focus"]), "dim_departments")
    write(patients[EXPORT_PATIENT_COLS], "dim_patients")
    write(orders[EXPORT_ORDER_COLS], "fact_orders")
    write(patients, "patients_latent", TMP)
    write(orders, "orders_latent", TMP)

    print_stats(patients, depts, orders)


if __name__ == "__main__":
    main()
