/**
 * Pravidla pro opakovaná vyšetření – jeden zdroj pravdy pro SQL dotazy.
 *
 * Minimální interval opakování (MRI): vychází z doporučení „National Minimum
 * Retesting Intervals in Pathology“ (The Royal College of Pathologists / ACB, 2021),
 * zjednodušeno pro ukázku. Vyšetření bez MRI (ionty, CRP…) se u hospitalizovaných
 * opakují oprávněně i denně, proto se za duplicitu nepovažují.
 */
export const MIN_RETEST_DAYS: Record<string, number> = {
  HBA1C: 90,
  VITD: 90,
  CHOL: 30,
  HDL: 30,
  LDL: 30,
  TAG: 30,
  TSH: 30,
  FT4: 30,
  FERR: 30,
  B12: 30,
  FOL: 30,
  ACE: 30,
};

/**
 * Delta check: maximální přijatelná relativní změna proti předchozímu výsledku
 * téhož pacienta do 7 dnů. Větší změna = podezření na záměnu vzorku nebo
 * preanalytickou chybu (orientační hodnoty pro ukázku).
 */
export const DELTA_LIMITS: Record<string, number> = {
  NA: 0.06,
  CL: 0.08,
  K: 0.2,
  CA: 0.15,
  MG: 0.25,
  ALB: 0.2,
  TP: 0.2,
  CREA: 0.3,
  UREA: 0.5,
  GLU: 0.5,
  KO_DIF: 0.5,
  PT_INR: 0.5,
};
export const DEFAULT_DELTA_LIMIT = 0.75;
export const DELTA_WINDOW_DAYS = 7;

/** Převede slovník na SQL VALUES (pro CTE s pravidly). */
export function valuesSql(map: Record<string, number>): string {
  return Object.entries(map)
    .map(([k, v]) => `('${k}', ${v})`)
    .join(', ');
}
