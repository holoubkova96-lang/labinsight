import { useTranslation } from 'react-i18next';

export default function Placeholder({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return (
    <section className="rounded-xl border border-dashed border-line bg-surface p-10 text-center">
      <h1 className="text-xl font-semibold">{t(titleKey)}</h1>
      <p className="mt-2 text-sm text-ink-2">{t('placeholder.text')}</p>
    </section>
  );
}
