import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

export function Spinner({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center gap-3 p-8 text-sm text-ink-2" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-line border-t-accent" />
      {label ?? t('common.loading')}
    </div>
  );
}

export function Skeleton({ className = 'h-64' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-2 ${className}`} aria-hidden="true" />;
}

export function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-sm text-muted">
      <Icon name="filter" className="size-5" />
      {t('common.empty')}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div
      className="flex min-h-40 flex-col items-center justify-center gap-2 p-4 text-center text-sm"
      role="alert"
    >
      <span className="flex items-center gap-2 font-medium text-critical">
        <Icon name="alert" /> {t('common.error')}
      </span>
      <code className="max-w-full overflow-x-auto text-xs text-muted">{message}</code>
    </div>
  );
}
