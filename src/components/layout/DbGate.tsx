import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { initDb, type LoadProgress } from '../../db/duckdb';
import { Icon } from '../ui/Icon';

/** Načte DuckDB a data; do té doby ukazuje průběh. */
export function DbGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<LoadProgress>({ step: 'engine', loaded: 0, total: 1 });
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    initDb(setProgress).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [attempt]);

  if (progress.step === 'ready') return <>{children}</>;

  const pct = progress.step === 'engine' ? 5 : 10 + (progress.loaded / progress.total) * 90;
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4" data-mode="clinical">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <div className="flex items-center gap-2 font-semibold">
          <Icon name="db" className="size-5 text-accent" /> {t('app.name')}
        </div>
        {error ? (
          <div role="alert" className="mt-4 space-y-3 text-sm">
            <p className="font-medium text-critical">{t('loading.error')}</p>
            <code className="block text-xs break-all text-muted">{error}</code>
            <button
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white"
              onClick={() => {
                setError(null);
                setAttempt((a) => a + 1);
              }}
            >
              {t('common.retry')}
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-2" role="status">
            <p className="text-sm text-ink-2">
              {progress.step === 'engine'
                ? t('loading.engine')
                : t('loading.tables', { loaded: progress.loaded, total: progress.total })}
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
