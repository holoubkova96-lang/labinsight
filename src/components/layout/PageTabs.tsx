import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PAGES, type Mode } from '../../pages/registry';

export function PageTabs({ mode }: { mode: Mode }) {
  const { t } = useTranslation();
  const { search } = useLocation();
  return (
    <nav className="border-b border-line bg-surface" aria-label={t(`mode.${mode}`)}>
      <div className="scroll-thin mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-4 lg:px-6">
        {PAGES[mode].map((p) => (
          <NavLink
            key={p.id}
            to={{ pathname: `/${mode}/${p.id}`, search }}
            className={({ isActive }) =>
              `-mb-px border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors ${
                isActive
                  ? 'border-accent font-medium text-ink'
                  : 'border-transparent text-ink-2 hover:text-ink'
              }`
            }
          >
            {t(`pages.${mode}.${p.id}`)}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
