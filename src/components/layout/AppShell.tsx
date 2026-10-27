import { Outlet, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isMode } from '../../pages/registry';
import { useUi } from '../../store/ui';
import { useUrlSync } from '../../store/useUrlSync';
import { FilterChips } from '../slicers/FilterChips';
import { SlicerPanel } from '../slicers/SlicerPanel';
import { Icon } from '../ui/Icon';
import { DASHBOARD_ID, PageTabs } from './PageTabs';
import { TopBar } from './TopBar';

export function AppShell() {
  useUrlSync();
  const { t } = useTranslation();
  const params = useParams();
  const mode = isMode(params.mode) ? params.mode : 'clinical';
  const slicersOpen = useUi((s) => s.slicersOpen);
  const setSlicersOpen = useUi((s) => s.setSlicersOpen);

  return (
    <div data-mode={mode} className="min-h-screen bg-bg">
      <TopBar mode={mode} />
      <PageTabs mode={mode} />
      <div className="mx-auto flex max-w-[1600px] gap-6 px-4 py-5 lg:px-6">
        {/* desktop: postranní panel; mobil: zásuvka */}
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border border-line bg-surface">
            <SlicerPanel />
          </div>
        </aside>
        {slicersOpen && (
          <div
            className="fixed inset-0 z-40 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label={t('slicers.title')}
          >
            <button
              className="absolute inset-0 bg-black/40"
              aria-label={t('slicers.close')}
              onClick={() => setSlicersOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 w-[min(20rem,88vw)] overflow-y-auto bg-surface shadow-xl">
              <SlicerPanel onClose={() => setSlicersOpen(false)} />
            </div>
          </div>
        )}
        <main id={DASHBOARD_ID} className="min-w-0 flex-1 space-y-4">
          <FilterChips />
          <Outlet />
        </main>
      </div>
      <footer className="mx-auto max-w-[1600px] px-4 pb-6 text-xs text-muted lg:px-6">
        <p className="flex items-start gap-2">
          <Icon name="info" className="mt-0.5 size-3.5 shrink-0" />
          {t('app.disclaimer')}
        </p>
      </footer>
    </div>
  );
}
