import { useTranslation } from 'react-i18next';
import type { Lang } from '.';

const LOCALE: Record<Lang, string> = { cs: 'cs-CZ', en: 'en-US' };

export function fmtNumber(v: number | null | undefined, lang: Lang, digits = 0): string {
  if (v == null || Number.isNaN(v)) return '–';
  return new Intl.NumberFormat(LOCALE[lang], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
}

/** CZ: 1 234,50 Kč · EN: CZK 1,234.50 */
export function fmtCzk(v: number | null | undefined, lang: Lang, digits = 0): string {
  if (v == null || Number.isNaN(v)) return '–';
  return new Intl.NumberFormat(LOCALE[lang], {
    style: 'currency',
    currency: 'CZK',
    currencyDisplay: lang === 'cs' ? 'symbol' : 'code',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
}

export function fmtPct(v: number | null | undefined, lang: Lang, digits = 1): string {
  if (v == null || Number.isNaN(v)) return '–';
  return new Intl.NumberFormat(LOCALE[lang], {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
}

/** CZ: 26. 10. 2026 · EN: Oct 26, 2026 */
export function fmtDate(v: string | number | Date | null | undefined, lang: Lang): string {
  if (v == null) return '–';
  const d = typeof v === 'string' ? new Date(`${v.slice(0, 10)}T00:00:00`) : new Date(v);
  if (Number.isNaN(d.getTime())) return '–';
  return lang === 'cs'
    ? d.toLocaleDateString('cs-CZ')
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** '2025-03' → CZ: 3/2025 · EN: Mar 2025 */
export function fmtMonth(monthKey: string, lang: Lang): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(LOCALE[lang], {
    month: lang === 'cs' ? 'numeric' : 'short',
    year: 'numeric',
  });
}

/** Formátovací funkce svázané s aktuálním jazykem. */
export function useFormat() {
  const { i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? 'cs') as Lang;
  return {
    lang,
    num: (v: number | null | undefined, d = 0) => fmtNumber(v, lang, d),
    czk: (v: number | null | undefined, d = 0) => fmtCzk(v, lang, d),
    pct: (v: number | null | undefined, d = 1) => fmtPct(v, lang, d),
    date: (v: string | number | Date | null | undefined) => fmtDate(v, lang),
    month: (m: string) => fmtMonth(m, lang),
    /** Název z dimenze podle jazyka (sloupce name_cs / name_en). */
    name: (row: { name_cs?: unknown; name_en?: unknown }) =>
      String((lang === 'cs' ? row.name_cs : row.name_en) ?? ''),
  };
}
