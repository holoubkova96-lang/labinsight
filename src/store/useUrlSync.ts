import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isLang, rememberLang } from '../i18n';
import { useFilterValues, useFilters } from './filters';
import { filtersKey, filtersToParams, paramsToFilters } from './urlState';

/**
 * Obousměrná synchronizace filtrů a jazyka s URL. Výchozí stav se načte z URL
 * už v main.tsx, takže tady řešíme jen další změny (klik na filtr, tlačítko Zpět).
 */
export function useUrlSync() {
  const [params, setParams] = useSearchParams();
  const { i18n } = useTranslation();
  const filters = useFilterValues();
  const replaceAll = useFilters((s) => s.replaceAll);
  const paramsStr = params.toString();

  // URL → stav (např. navigace zpět)
  useEffect(() => {
    const p = new URLSearchParams(paramsStr);
    const fromUrl = paramsToFilters(p);
    if (filtersKey(fromUrl) !== filtersKey(useFilters.getState())) replaceAll(fromUrl);
    const lang = p.get('lang');
    if (isLang(lang) && lang !== i18n.resolvedLanguage) void i18n.changeLanguage(lang);
  }, [paramsStr, replaceAll, i18n]);

  // stav → URL
  const key = filtersKey(filters);
  const lang = i18n.resolvedLanguage;
  useEffect(() => {
    const current = new URLSearchParams(paramsStr);
    const next = filtersToParams(paramsToFilters(new URLSearchParams(key)), current);
    if (lang) next.set('lang', lang);
    if (next.toString() !== current.toString()) setParams(next, { replace: true });
    if (isLang(lang)) rememberLang(lang);
    // paramsStr záměrně chybí: reagujeme jen na změnu stavu, ne na změnu URL
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, lang, setParams]);
}
