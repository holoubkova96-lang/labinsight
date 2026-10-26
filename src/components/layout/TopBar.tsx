import { useEffect } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LANGS, type Lang } from '../../i18n';
import { activeFilterCount, useFilterValues } from '../../store/filters';
import { MODES, type Mode } from '../../pages/registry';
import { useUi } from '../../store/ui';
import { Icon } from '../ui/Icon';

const MODE_ACTIVE: Record<Mode, string> = {
  clinical: 'bg-clinical text-white dark:text-black',
  business: 'bg-business text-white dark:text-black',
};

export function TopBar({ mode }: { mode: Mode }) {
  const { t, i18n } = useTranslation();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const theme = useUi((s) => s.theme);
  const toggleTheme = useUi((s) => s.toggleTheme);
  const setSlicersOpen = useUi((s) => s.setSlicersOpen);
  const setLastMode = useUi((s) => s.setLastMode);
  const nFilters = activeFilterCount(useFilterValues());
  const inMode = MODES.some((m) => pathname.startsWith(`/${m}/`));

  useEffect(() => {
    if (inMode) setLastMode(mode);
  }, [inMode, mode, setLastMode]);

  const switchMode = (m: Mode) => navigate({ pathname: `/${m}/overview`, search });
  const navCls = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap ${isActive ? 'bg-surface-2 font-medium text-ink' : 'text-ink-2 hover:text-ink'}`;

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 lg:px-6">
        <Link to={{ pathname: '/', search }} className="flex items-center gap-2 font-semibold tracking-tight">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-7" />
          {t('app.name')}
        </Link>

        {/* výrazný přepínač módu – každý mód má vlastní akcentovou barvu */}
        <div
          role="radiogroup"
          aria-label={t('mode.label')}
          className="flex rounded-lg border border-line bg-surface-2 p-0.5"
        >
          {MODES.map((m) => {
            const active = inMode && m === mode;
            return (
              <button
                key={m}
                role="radio"
                aria-checked={active}
                onClick={() => switchMode(m)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${active ? MODE_ACTIVE[m] : 'text-ink-2 hover:text-ink'}`}
              >
                {t(`mode.${m}`)}
              </button>
            );
          })}
        </div>

        <nav
          className="order-last flex w-full gap-1 overflow-x-auto scroll-thin md:order-none md:w-auto"
          aria-label={t('nav.pages')}
        >
          <NavLink to={{ pathname: '/sql', search }} className={navCls}>
            {t('nav.sqlLab')}
          </NavLink>
          <NavLink to={{ pathname: '/er', search }} className={navCls}>
            {t('nav.er')}
          </NavLink>
          <NavLink to={{ pathname: '/about', search }} className={navCls}>
            {t('nav.about')}
          </NavLink>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden rounded-full border border-line px-2 py-0.5 text-xs text-muted sm:inline">
            {t('app.disclaimerShort')}
          </span>
          <div
            role="radiogroup"
            aria-label={t('lang.switch')}
            className="flex rounded-lg border border-line p-0.5"
          >
            {LANGS.map((l: Lang) => (
              <button
                key={l}
                role="radio"
                aria-checked={i18n.resolvedLanguage === l}
                onClick={() => void i18n.changeLanguage(l)}
                className={`rounded-md px-2 py-1 text-xs font-semibold ${i18n.resolvedLanguage === l ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'}`}
              >
                {t(`lang.${l}`)}
              </button>
            ))}
          </div>
          <button
            onClick={toggleTheme}
            className="rounded-lg border border-line p-2 text-ink-2 hover:text-ink"
            aria-label={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')}
            title={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          <button
            onClick={() => setSlicersOpen(true)}
            className="relative flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-2 text-sm lg:hidden"
          >
            <Icon name="filter" />
            {t('slicers.open')}
            {nFilters > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-xs font-semibold text-white dark:text-black">
                {nFilters}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
