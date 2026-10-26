import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

export function SqlModal({ sql, onClose }: { sql: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* schránka nemusí být dostupná */
    }
  };

  // portál do <body>: modální okno nesmí ovlivnit rozložení ani ořez karty grafu
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('common.sqlTitle')}
    >
      <button className="absolute inset-0 bg-black/50" aria-label={t('common.close')} onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Icon name="code" className="size-4 text-accent" /> {t('common.sqlTitle')}
          </h3>
          <div className="flex gap-1">
            <button onClick={copy} className="rounded-md px-2 py-1 text-xs text-ink-2 hover:bg-surface-2">
              {copied ? t('common.copied') : t('common.copy')}
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-ink-2 hover:bg-surface-2"
              aria-label={t('common.close')}
            >
              <Icon name="x" />
            </button>
          </div>
        </div>
        <p className="px-4 pt-3 text-xs text-muted">{t('common.sqlHint')}</p>
        <pre className="m-4 overflow-auto rounded-lg bg-surface-2 p-4 text-xs leading-relaxed">
          <code>{sql}</code>
        </pre>
      </div>
    </div>,
    document.body,
  );
}
