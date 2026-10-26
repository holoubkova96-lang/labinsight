"""Globální parametry generátoru. Vše, co se dá „ladit“, je tady."""
from datetime import date

SEED = 42

# 36 uzavřených měsíců: 10/2023 – 9/2026
START_DATE = date(2023, 10, 1)
END_DATE = date(2026, 9, 30)

N_PATIENTS = 5_000
N_ORDERS = 50_000

# Hodnota bodu podle vyhl. č. 432/2025 Sb., příloha č. 5, část B (pro rok 2026):
#   bod 2 b) – akreditovaný poskytovatel (ČSN EN ISO 15189 / NASKL R3):
#             0,80 Kč pro 801 a 812–815, 0,90 Kč pro 818; bez akreditace 0,40 Kč
#   bod 1    – 1,05 Kč pro výkony kapitol 819 a 999
# Zjednodušení: koeficient BONlab (bod 7.21) a pravidlo ≤ 50 unikátních pojištěnců
# (bod 7.22, 1,04 Kč) nejsou modelovány.
ACCREDITED = True
POINT_VALUE_BY_SPECIALTY = {"801": 0.80, "813": 0.80, "818": 0.90, "999": 1.05}
POINT_VALUE_NON_ACCREDITED = 0.40

# Fiktivní smluvní koeficient k hodnotě bodu (simulace individuálních smluv, ±3 %)
INSURERS = {
    "111": ("Všeobecná zdravotní pojišťovna ČR", "General Health Insurance Company", 1.000, 0.55),
    "201": ("Vojenská zdravotní pojišťovna ČR", "Military Health Insurance Company", 0.985, 0.07),
    "205": ("Česká průmyslová zdravotní pojišťovna", "Czech Industrial Health Insurance Company", 1.015, 0.13),
    "207": ("Oborová zdravotní pojišťovna", "Professional Health Insurance Company", 1.030, 0.08),
    "209": ("Zaměstnanecká pojišťovna Škoda", "Škoda Employee Insurance Company", 0.970, 0.02),
    "211": ("Zdravotní pojišťovna ministerstva vnitra ČR", "Ministry of the Interior Health Insurance Company", 1.010, 0.13),
    "213": ("RBP, zdravotní pojišťovna", "RBP Health Insurance Company", 0.990, 0.02),
}  # kód: (název CZ, název EN, fiktivní smluvní koeficient, podíl pacientů)


def point_value(specialty: str, insurer_code: str) -> float:
    """Kč za bod pro danou odbornost výkonu a pojišťovnu."""
    base = POINT_VALUE_BY_SPECIALTY[specialty]
    if not ACCREDITED and specialty != "999":
        base = POINT_VALUE_NON_ACCREDITED
    return round(base * INSURERS[insurer_code][2], 4)

SELF_PAYER_SHARE = 0.03  # podíl žádanek samoplátců
STAT_SHARE = 0.28

# Osobní náklady (Kč/hod včetně odvodů) – fiktivní, realistické
HOURLY_RATE_LAB_TECH = 420
HOURLY_RATE_UNIVERSITY = 780

# Kč za test, pokud ceník samoplátců nemá cenu: body × hodnota bodu × přirážka
SELF_PAY_MARKUP = 1.35
