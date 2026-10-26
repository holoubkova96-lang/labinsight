"""Katalog vyšetření: klinické parametry + parametry nákladového modelu.

Body a kódy výkonů se načítají z data/source/szv_body.csv (VZP v. 1482).
Klinické a nákladové parametry jsou fiktivní, ale realistické.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Test:
    key: str
    group: str            # BIO / HEM / COAG / IMU / SPEC
    name_cs: str
    name_en: str
    unit: str
    analyzer: str
    dist: str             # "norm" | "lognorm"
    mu: float             # průměr (norm) nebo medián (lognorm) u zdravé populace
    sigma: float          # SD (norm) nebo log-SD (lognorm)
    ref_m: tuple          # (dolní, horní) muži
    ref_f: tuple          # (dolní, horní) ženy
    crit: tuple           # (kritická dolní, kritická horní); None = není
    decimals: int
    weight: float         # relativní četnost ordinace
    # --- nákladový model ---
    reagent_czk: float    # reagencie + spotřební materiál na 1 test
    pack_size: int        # testů v balení reagencie
    stability_days: int   # stabilita otevřené reagencie na analyzátoru
    qc_per_day: int       # počet QC měření denně (2 úrovně = 2)
    qc_czk: float         # cena 1 QC měření (materiál + reagencie)
    cal_per_month: float  # kalibrací měsíčně
    cal_czk: float        # cena 1 kalibrace
    ehk_year_czk: float   # externí hodnocení kvality ročně
    tech_min: float       # minuty laboranta na test
    uni_min: float        # minuty VŠ (validace) na test


A_CHEM, A_IMMU, A_HEM, A_COAG, A_SPEC = "AN_CHEM", "AN_IMMU", "AN_HEM", "AN_COAG", "AN_SPEC"

T = Test
CATALOG: list[Test] = [
    # --- biochemie: ionty, ledviny ---
    T("NA", "BIO", "Sodík", "Sodium", "mmol/l", A_CHEM, "norm", 139, 2.5, (136, 145), (136, 145), (120, 160), 0, 10, 2.1, 1000, 28, 2, 18, 1, 450, 6000, .15, .05),
    T("K", "BIO", "Draslík", "Potassium", "mmol/l", A_CHEM, "norm", 4.3, .35, (3.5, 5.1), (3.5, 5.1), (2.8, 6.2), 2, 10, 2.1, 1000, 28, 2, 18, 1, 450, 6000, .15, .05),
    T("CL", "BIO", "Chloridy", "Chloride", "mmol/l", A_CHEM, "norm", 102, 2.8, (98, 107), (98, 107), (80, 120), 0, 8, 2.1, 1000, 28, 2, 18, 1, 450, 6000, .15, .05),
    T("UREA", "BIO", "Urea", "Urea", "mmol/l", A_CHEM, "lognorm", 5.2, .30, (2.8, 8.1), (2.6, 6.7), (None, 35), 1, 9, 3.4, 800, 30, 2, 22, 1, 520, 6000, .15, .05),
    T("CREA", "BIO", "Kreatinin", "Creatinine", "µmol/l", A_CHEM, "lognorm", 80, .22, (64, 104), (49, 90), (None, 600), 0, 10, 3.0, 800, 30, 2, 22, 1, 520, 6000, .15, .05),
    T("EGFR", "BIO", "eGFR (CKD-EPI)", "eGFR (CKD-EPI)", "ml/s/1,73m²", A_CHEM, "calc", 1.5, 0, (1.0, 99), (1.0, 99), (0.25, None), 2, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0),
    T("GLU", "BIO", "Glukóza", "Glucose", "mmol/l", A_CHEM, "lognorm", 5.2, .18, (3.9, 5.6), (3.9, 5.6), (2.2, 25), 1, 9, 1.9, 1000, 30, 2, 15, 1, 400, 6000, .15, .05),
    T("HBA1C", "BIO", "Glykovaný hemoglobin", "HbA1c", "mmol/mol", A_IMMU, "lognorm", 38, .20, (20, 42), (20, 42), None, 0, 3, 38, 150, 28, 2, 60, .5, 1800, 9000, .4, .1),
    # --- jaterní testy ---
    T("ALT", "BIO", "ALT", "ALT", "µkat/l", A_CHEM, "lognorm", .38, .45, (.10, .78), (.10, .58), (None, 16), 2, 8, 2.6, 800, 30, 2, 20, 1, 480, 6000, .15, .05),
    T("AST", "BIO", "AST", "AST", "µkat/l", A_CHEM, "lognorm", .40, .40, (.10, .72), (.10, .60), (None, 16), 2, 7, 2.6, 800, 30, 2, 20, 1, 480, 6000, .15, .05),
    T("GGT", "BIO", "GGT", "GGT", "µkat/l", A_CHEM, "lognorm", .45, .60, (.14, .84), (.14, .68), None, 2, 5, 2.8, 800, 30, 2, 20, 1, 480, 6000, .15, .05),
    T("ALP", "BIO", "ALP", "ALP", "µkat/l", A_CHEM, "lognorm", 1.10, .30, (.66, 2.20), (.58, 1.74), None, 2, 5, 2.4, 800, 30, 2, 20, 1, 480, 6000, .15, .05),
    T("BILI", "BIO", "Bilirubin celkový", "Total bilirubin", "µmol/l", A_CHEM, "lognorm", 10, .45, (2, 17), (2, 17), (None, 300), 1, 6, 2.2, 800, 30, 2, 20, 1, 480, 6000, .15, .05),
    T("ALB", "BIO", "Albumin", "Albumin", "g/l", A_CHEM, "norm", 42, 4, (35, 52), (35, 52), (15, None), 1, 4, 1.8, 1000, 30, 2, 15, 1, 400, 6000, .15, .05),
    T("TP", "BIO", "Celková bílkovina", "Total protein", "g/l", A_CHEM, "norm", 70, 5, (64, 83), (64, 83), None, 1, 3, 1.6, 1000, 30, 2, 15, 1, 400, 6000, .15, .05),
    T("CK", "BIO", "Kreatinkináza (CK)", "Creatine kinase (CK)", "µkat/l", A_CHEM, "lognorm", 1.6, .55, (0, 3.2), (0, 2.42), None, 2, 3, 3.2, 800, 30, 2, 20, 1, 480, 6000, .15, .05),
    T("LIP", "BIO", "Lipáza", "Lipase", "µkat/l", A_CHEM, "lognorm", .50, .45, (.22, 1.0), (.22, 1.0), None, 2, 2, 6.5, 300, 30, 2, 28, 1, 650, 6000, .15, .05),
    T("UA", "BIO", "Kyselina močová", "Uric acid", "µmol/l", A_CHEM, "lognorm", 300, .25, (202, 417), (143, 339), None, 0, 3, 2.3, 800, 30, 2, 18, 1, 450, 6000, .15, .05),
    # --- minerály ---
    T("CA", "BIO", "Vápník celkový", "Total calcium", "mmol/l", A_CHEM, "norm", 2.35, .10, (2.15, 2.55), (2.15, 2.55), (1.6, 3.5), 2, 5, 1.9, 1000, 30, 2, 15, 1, 400, 6000, .15, .05),
    T("MG", "BIO", "Hořčík", "Magnesium", "mmol/l", A_CHEM, "norm", .85, .08, (.66, 1.07), (.66, 1.07), (.4, 3.0), 2, 4, 2.0, 1000, 30, 2, 15, 1, 400, 6000, .15, .05),
    T("P", "BIO", "Fosfor anorganický", "Inorganic phosphate", "mmol/l", A_CHEM, "norm", 1.10, .18, (.87, 1.45), (.87, 1.45), (.3, None), 2, 3, 1.8, 1000, 30, 2, 15, 1, 400, 6000, .15, .05),
    # --- zánět, kardio ---
    T("CRP", "BIO", "C-reaktivní protein", "C-reactive protein", "mg/l", A_CHEM, "lognorm", 2.5, 1.3, (0, 5), (0, 5), None, 1, 9, 9.5, 500, 30, 2, 30, 1, 900, 7000, .2, .05),
    T("PCT", "IMU", "Prokalcitonin", "Procalcitonin", "µg/l", A_IMMU, "lognorm", .06, 1.4, (0, .5), (0, .5), None, 2, 1.2, 185, 100, 28, 2, 240, .5, 3500, 14000, .5, .15),
    T("TNT", "IMU", "Troponin T hs", "Troponin T hs", "ng/l", A_IMMU, "lognorm", 8, 1.0, (0, 14), (0, 14), (None, 100), 0, 2.5, 160, 100, 28, 2, 220, .5, 3200, 14000, .5, .15),
    T("NTPROBNP", "IMU", "NT-proBNP", "NT-proBNP", "ng/l", A_IMMU, "lognorm", 90, 1.3, (0, 125), (0, 125), None, 0, 1.6, 190, 100, 28, 2, 240, .5, 3500, 14000, .5, .15),
    # --- lipidy ---
    T("CHOL", "BIO", "Cholesterol celkový", "Total cholesterol", "mmol/l", A_CHEM, "norm", 5.0, .9, (2.9, 5.0), (2.9, 5.0), None, 2, 4, 2.0, 1000, 30, 2, 15, 1, 400, 6000, .15, .05),
    T("HDL", "BIO", "HDL cholesterol", "HDL cholesterol", "mmol/l", A_CHEM, "norm", 1.4, .35, (1.0, 2.1), (1.2, 2.7), None, 2, 3, 9.0, 300, 30, 2, 30, 1, 800, 6000, .15, .05),
    T("LDL", "BIO", "LDL cholesterol", "LDL cholesterol", "mmol/l", A_CHEM, "norm", 3.0, .8, (1.2, 3.0), (1.2, 3.0), None, 2, 3, 11, 300, 30, 2, 32, 1, 850, 6000, .15, .05),
    T("TAG", "BIO", "Triacylglyceroly", "Triglycerides", "mmol/l", A_CHEM, "lognorm", 1.3, .45, (.45, 1.7), (.45, 1.7), None, 2, 4, 2.2, 1000, 30, 2, 15, 1, 400, 6000, .15, .05),
    # --- štítná žláza, železo, vitaminy ---
    T("TSH", "IMU", "TSH", "TSH", "mU/l", A_IMMU, "lognorm", 1.8, .55, (.27, 4.2), (.27, 4.2), None, 2, 3.5, 42, 200, 28, 2, 70, .5, 1500, 9000, .3, .1),
    T("FT4", "IMU", "Volný tyroxin (fT4)", "Free T4", "pmol/l", A_IMMU, "norm", 16, 2.5, (12, 22), (12, 22), None, 1, 2, 44, 200, 28, 2, 70, .5, 1500, 9000, .3, .1),
    T("FERR", "IMU", "Feritin", "Ferritin", "µg/l", A_IMMU, "lognorm", 90, .8, (30, 400), (13, 150), None, 0, 2, 48, 100, 28, 2, 75, .5, 1600, 9000, .3, .1),
    T("VITD", "IMU", "Vitamin D (25-OH)", "Vitamin D (25-OH)", "nmol/l", A_IMMU, "lognorm", 60, .40, (75, 250), (75, 250), None, 0, 2, 120, 100, 28, 2, 180, .5, 2800, 12000, .4, .1),
    T("B12", "IMU", "Vitamin B12", "Vitamin B12", "pmol/l", A_IMMU, "lognorm", 300, .40, (145, 569), (145, 569), None, 0, 1.2, 62, 100, 28, 2, 95, .5, 1900, 9000, .3, .1),
    T("FOL", "IMU", "Foláty", "Folate", "nmol/l", A_IMMU, "lognorm", 18, .45, (8.8, 60), (8.8, 60), None, 1, 1, 64, 100, 28, 2, 95, .5, 1900, 9000, .3, .1),
    # --- hematologie a koagulace ---
    T("KO_DIF", "HEM", "Krevní obraz + diferenciál", "CBC + differential", "×10⁹/l (WBC)", A_HEM, "lognorm", 7.0, .30, (4.0, 10.0), (4.0, 10.0), (1.0, 50), 1, 12, 18, 2000, 30, 3, 25, .5, 900, 9000, .2, .1),
    T("PT_INR", "COAG", "Protrombinový test (INR)", "Prothrombin time (INR)", "INR", A_COAG, "lognorm", 1.0, .08, (.8, 1.2), (.8, 1.2), (None, 5), 2, 7, 14, 400, 5, 2, 40, 1, 700, 7000, .3, .05),
    T("APTT", "COAG", "APTT", "APTT", "s", A_COAG, "lognorm", 30, .10, (25, 37), (25, 37), (None, 100), 1, 6, 13, 400, 5, 2, 40, 1, 700, 7000, .3, .05),
    T("DDIM", "COAG", "D-dimery", "D-dimer", "mg/l FEU", A_COAG, "lognorm", .30, 1.0, (0, .5), (0, .5), None, 2, 2.5, 120, 100, 7, 2, 120, 1, 2000, 9000, .3, .1),
    T("FBG", "COAG", "Fibrinogen", "Fibrinogen", "g/l", A_COAG, "lognorm", 3.0, .22, (1.8, 4.2), (1.8, 4.2), (1.0, None), 1, 3, 16, 200, 5, 2, 45, 1, 800, 7000, .3, .05),
    T("FW", "HEM", "Sedimentace erytrocytů (FW)", "ESR", "mm/h", A_HEM, "lognorm", 10, .70, (0, 15), (0, 20), None, 0, 2, 9, 1, 1, 1, 15, 0, 0, 3000, 1.0, 0),
    # --- málo frekventované speciální metody (problém nevýhodnosti) ---
    T("ANTIXA", "SPEC", "Anti-Xa aktivita", "Anti-Xa activity", "IU/ml", A_COAG, "lognorm", .45, .50, (.5, 1.0), (.5, 1.0), None, 2, .05, 260, 50, 3, 2, 180, 2, 2400, 15000, .6, .2),
    T("IL6", "SPEC", "Interleukin 6", "Interleukin 6", "ng/l", A_SPEC, "lognorm", 4, 1.4, (0, 7), (0, 7), None, 1, .06, 520, 50, 14, 2, 450, 1, 5200, 18000, .7, .2),
    T("ACE", "SPEC", "ACE (angiotenzin konvertující enzym)", "ACE (angiotensin converting enzyme)", "µkat/l", A_SPEC, "lognorm", .70, .35, (.33, 1.33), (.33, 1.33), None, 2, .04, 130, 50, 21, 2, 160, 1, 1800, 12000, .5, .2),
    T("KRYO", "SPEC", "Kryoglobuliny", "Cryoglobulins", "g/l", A_SPEC, "lognorm", .02, .9, (0, .05), (0, .05), None, 3, .02, 60, 1, 1, 1, 90, 0, 0, 9000, 25, 5),
]

BY_KEY = {t.key: t for t in CATALOG}

# Životní cyklus metod: (zavedení, zrušení | None, plánovaná měsíční frekvence, důvod zrušení)
# Metody, které nejsou uvedené, běží od začátku období.
LIFECYCLE = {
    "ANTIXA": ("2024-01-15", "2025-06-30", 90, "low_volume_reagent_expiry"),
    "IL6": ("2024-04-01", "2025-03-31", 70, "low_volume_high_qc_cost"),
    "ACE": ("2023-11-01", "2025-01-31", 45, "low_volume_outsourcing_cheaper"),
    "KRYO": ("2024-09-01", "2026-02-28", 15, "manual_labour_cost"),
    "FOL": ("2024-02-01", "2026-06-30", 120, "low_volume_reagent_expiry"),
    "PCT": ("2023-12-01", None, 60, None),
    "NTPROBNP": ("2024-03-01", None, 45, None),
    "TNT": ("2024-01-08", None, 65, None),
}
