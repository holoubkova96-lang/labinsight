"""Dimenze vyšetření: dim_tests, dim_reference_ranges, dim_analyzers.

Spojuje katalog (klinické a nákladové parametry) s reálnými zdroji:
kódy a body z číselníku VZP a ceník pro samoplátce.
"""
from pathlib import Path

import pandas as pd

import config
from catalog import CATALOG, LIFECYCLE

SOURCE = Path(__file__).resolve().parent.parent / "data" / "source"

# (id, skupina z katalogu, název CZ, název EN, leasing + servis Kč/měsíc) – fiktivní
ANALYZERS = [
    ("AN_CHEM1", "AN_CHEM", "Biochemický analyzátor 1", "Clinical chemistry analyser 1", 95_000),
    ("AN_CHEM2", "AN_CHEM", "Biochemický analyzátor 2", "Clinical chemistry analyser 2", 95_000),
    ("AN_IMMU", "AN_IMMU", "Imunochemický analyzátor", "Immunoassay analyser", 120_000),
    ("AN_HEM", "AN_HEM", "Hematologický analyzátor", "Haematology analyser", 70_000),
    ("AN_COAG", "AN_COAG", "Koagulační analyzátor", "Coagulation analyser", 45_000),
    ("AN_SPEC", "AN_SPEC", "Pracoviště speciálních metod (ELISA, manuální)", "Special methods bench (ELISA, manual)", 30_000),
]
CHEM_SPLIT = .6  # podíl žádanek na biochemickém analyzátoru 1

# Dětské referenční meze (0–17 let) tam, kde se výrazně liší od dospělých
CHILD_REF = {"ALP": (1.2, 6.0), "CREA": (20, 60), "UA": (120, 330), "CK": (0, 4.0)}

GROUP_NAMES = {
    "BIO": ("Biochemie", "Clinical chemistry"),
    "IMU": ("Imunochemie", "Immunochemistry"),
    "HEM": ("Hematologie", "Haematology"),
    "COAG": ("Koagulace", "Coagulation"),
    "SPEC": ("Speciální metody", "Special methods"),
}


def build_dim_analyzers() -> pd.DataFrame:
    return pd.DataFrame(ANALYZERS, columns=["analyzer_id", "analyzer_group", "name_cs", "name_en", "lease_service_month_czk"])


def _self_pay_prices(szv: pd.DataFrame) -> pd.DataFrame:
    """Ceník samoplátců; chybějící ceny se odhadnou z bodů a označí jako odhad."""
    prices = pd.read_csv(SOURCE / "ceny_samoplatci.csv", dtype={"kod_vykonu": str}, keep_default_na=False, na_values=[""])
    df = szv[["test_key", "body", "odbornost"]].merge(prices[["test_key", "cena_kc", "datum_overeni"]], on="test_key", how="left")
    estimate = (df["body"] * df["odbornost"].map(config.POINT_VALUE_BY_SPECIALTY) * config.SELF_PAY_MARKUP / 10).round() * 10
    has_price = df["cena_kc"].notna()
    df["self_pay_price_czk"] = df["cena_kc"].where(has_price, estimate).astype(float)
    df["self_pay_price_source"] = has_price.map({True: "PRICE_LIST", False: "ESTIMATE"})
    df.loc[df["body"] == 0, ["self_pay_price_czk"]] = 0.0
    return df[["test_key", "self_pay_price_czk", "self_pay_price_source", "datum_overeni"]]


def build_dim_tests() -> pd.DataFrame:
    szv = pd.read_csv(SOURCE / "szv_body.csv", dtype={"kod_vykonu": str, "odbornost": str}, keep_default_na=False, na_values=[""])
    cat = pd.DataFrame([t.__dict__ for t in CATALOG])
    df = cat.merge(szv, left_on="key", right_on="test_key", how="left", validate="1:1")
    missing = df[df["kod_vykonu"].isna()]["key"].tolist()
    if missing:
        raise ValueError(f"Chybí kód výkonu v szv_body.csv: {missing}")
    df = df.merge(_self_pay_prices(szv), on="test_key", how="left")

    lc = df["key"].map(LIFECYCLE)
    df["introduced_on"] = pd.to_datetime([v[0] if isinstance(v, tuple) else config.START_DATE for v in lc]).date
    df["cancelled_on"] = [pd.Timestamp(v[1]).date() if isinstance(v, tuple) and v[1] else None for v in lc]
    df["method_status"] = ["CANCELLED" if c else "ACTIVE" for c in df["cancelled_on"]]

    return pd.DataFrame({
        "test_id": df["key"],
        "test_group": df["group"],
        "group_name_cs": df["group"].map(lambda g: GROUP_NAMES[g][0]),
        "group_name_en": df["group"].map(lambda g: GROUP_NAMES[g][1]),
        "name_cs": df["name_cs"],
        "name_en": df["name_en"],
        "unit": df["unit"],
        "analyzer_group": df["analyzer"],
        "decimals": df["decimals"],
        "crit_low": [c[0] if c else None for c in df["crit"]],
        "crit_high": [c[1] if c else None for c in df["crit"]],
        "procedure_code": df["kod_vykonu"],
        "procedure_name": df["nazev_vykonu"],
        "specialty": df["odbornost"],
        "points": df["body"].astype(int),
        "points_source": df["zdroj"],
        "points_downloaded_on": df["datum_stazeni"],
        "self_pay_price_czk": df["self_pay_price_czk"],
        "self_pay_price_source": df["self_pay_price_source"],
        "method_status": df["method_status"],
        "introduced_on": df["introduced_on"],
        "cancelled_on": df["cancelled_on"],
        # nákladový model (fiktivní parametry)
        "reagent_czk": df["reagent_czk"],
        "pack_size": df["pack_size"],
        "stability_days": df["stability_days"],
        "qc_per_day": df["qc_per_day"],
        "qc_czk": df["qc_czk"],
        "cal_per_month": df["cal_per_month"],
        "cal_czk": df["cal_czk"],
        "ehk_year_czk": df["ehk_year_czk"],
        "tech_min": df["tech_min"],
        "uni_min": df["uni_min"],
    })


def build_dim_reference_ranges() -> pd.DataFrame:
    rows = []
    for t in CATALOG:
        if t.dist == "calc":  # eGFR – jen dolní mez pro dospělé
            for sex in ("M", "F"):
                rows.append((t.key, sex, 18, 120, t.ref_m[0], None))
            continue
        for sex, ref in (("M", t.ref_m), ("F", t.ref_f)):
            child = CHILD_REF.get(t.key, ref)
            rows.append((t.key, sex, 0, 17, child[0], child[1]))
            rows.append((t.key, sex, 18, 120, ref[0], ref[1]))
    return pd.DataFrame(rows, columns=["test_id", "sex", "age_min", "age_max", "ref_low", "ref_high"])
