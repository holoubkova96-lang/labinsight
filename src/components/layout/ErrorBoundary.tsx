import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '../../i18n';
import { Icon } from '../ui/Icon';

type State = { error: Error | null };

/**
 * Místo bílé stránky ukáže srozumitelnou chybu s tlačítkem pro obnovení.
 * Typický případ: stránka byla otevřená před novým nasazením a prohlížeč
 * hledá soubory staré verze, které už na serveru nejsou.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const t = i18n.t.bind(i18n);
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4" data-mode="clinical">
        <div role="alert" className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <Icon name="alert" className="size-5 text-critical" />
            {t('errors.title')}
          </p>
          <p className="mt-2 text-ink-2">{t('errors.text')}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-md bg-accent px-3 py-1.5 font-medium text-white dark:text-black"
          >
            {t('errors.reload')}
          </button>
        </div>
      </div>
    );
  }
}
