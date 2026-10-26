import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isLang, rememberLang } from '../i18n';
import { useFilterValues, useFilters } from './filters';
import { filtersKey, filtersToParams, paramsToFilters } from './urlState';

/**
 * Obousměrná synchronizace filtrů a jazyka s URL. Výchozí stav se načte z URL
 * už v main.tsx, takže tady řešíme jen další změny (klik na filtr, tlačítko Zpět).
 *
 * `synced` drží poslední stav, na kterém se URL a store shodly. Díky tomu se
 * změna z jedné strany nepropíše zpět jako „nová“ změna (jinak by při navigaci
 * Zpět vznikla nekonečná smyčka URL ↔ store).
 */
export function useUrlSync() {
  const [params, setParams] = useSearchParams();
  const { i18n } = useTranslation();
  const filters = useFilterValues();
  const replaceAll = useFilters((s) => s.replaceAll);
  const paramsStr = params.toString();
  const key = filtersKey(filters);
  const lang = i18n.resolvedLanguage;

  const synced = useRef({ key, lang });
  const latest = useRef({ paramsStr, setParams });
  useEffect(() => {
    latest.current = { paramsStr, setParams };
  });

  // URL → stav (např. navigace zpět nebo sdílený odkaz)
  useEffect(() => {
    const p = new URLSearchParams(paramsStr);
    const fromUrl = paramsToFilters(p);
    const urlKey = filtersKey(fromUrl);
    const urlLang = p.get('lang');
    synced.current = { key: urlKey, lang: isLang(urlLang) ? urlLang : synced.current.lang };
    if (urlKey !== filtersKey(useFilters.getState())) replaceAll(fromUrl);
    if (isLang(urlLang) && urlLang !== i18n.resolvedLanguage) void i18n.changeLanguage(urlLang);
  }, [paramsStr, replaceAll, i18n]);

  // stav → URL (jen když se změnily filtry nebo jazyk, ne URL)
  useEffect(() => {
    if (isLang(lang)) rememberLang(lang);
    if (key === synced.current.key && lang === synced.current.lang) return;
    synced.current = { key, lang };
    const { paramsStr: current, setParams: set } = latest.current;
    const next = filtersToParams(paramsToFilters(new URLSearchParams(key)), new URLSearchParams(current));
    if (lang) next.set('lang', lang);
    if (next.toString() !== current) set(next, { replace: true });
  }, [key, lang]);
}
