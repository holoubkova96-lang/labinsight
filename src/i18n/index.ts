import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import cs from '../locales/cs.json';
import en from '../locales/en.json';

export type Lang = 'cs' | 'en';
export const LANGS: Lang[] = ['cs', 'en'];
const STORAGE_KEY = 'labinsight.lang';

function isLang(v: unknown): v is Lang {
  return v === 'cs' || v === 'en';
}

/** Pořadí: URL (?lang=) → uložená volba → jazyk prohlížeče. */
function detectLang(): Lang {
  const query = window.location.hash.split('?')[1] ?? '';
  const fromUrl = new URLSearchParams(query).get('lang');
  if (isLang(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* localStorage nemusí být dostupné (soukromé okno) */
  }
  return navigator.language.toLowerCase().startsWith('cs') ? 'cs' : 'en';
}

export function rememberLang(lang: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignorujeme */
  }
  document.documentElement.lang = lang;
}

const initial = detectLang();
document.documentElement.lang = initial;

void i18n.use(initReactI18next).init({
  resources: { cs: { translation: cs }, en: { translation: en } },
  lng: initial,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export { isLang };
export default i18n;
