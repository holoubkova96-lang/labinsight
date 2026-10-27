import { useState } from 'react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PAGES, type Mode } from '../../pages/registry';
import { saveElementAsPng } from '../charts/exportImage';
import { Icon } from '../ui/Icon';

/** Id oblasti, která se ukládá jako obrázek celého dashboardu. */
export const DASHBOARD_ID = 'dashboard-content';

export function PageTabs({ mode }: { mode: Mode }) {
  const { t } = useTranslation();
  const { search } = useLocation();
  const { page } = useParams();
  const [busy, setBusy] = useState(false);

  const onExport = async () => {
    setBusy(true);
    try {
      const node = document.getElementById(DASHBOARD_ID);
      if (node) {
        await saveElementAsPng(
          node,
          `labinsight-${mode}-${page ?? 'overview'}-${new Date().toISOString().slice(0, 10)}.png`,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <nav className="border-b border-line bg-surface" aria-label={t(`mode.${mode}`)}>
      <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-4 lg:px-6">
        {/* záložky se na úzkém displeji posouvají tažením, posuvník je skrytý */}
        <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PAGES[mode].map((p) => (
            <NavLink
              key={p.id}
              to={{ pathname: `/${mode}/${p.id}`, search }}
              className={({ isActive }) =>
                `border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors ${
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
        <button
          onClick={() => void onExport()}
          disabled={busy}
          title={t('common.exportDashboardTitle')}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-50"
        >
          <Icon name="download" className="size-3.5" />
          <span className="hidden sm:inline">
            {busy ? t('common.exporting') : t('common.exportDashboard')}
          </span>
        </button>
      </div>
    </nav>
  );
}
