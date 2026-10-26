import { useTranslation } from 'react-i18next';
import { Icon } from '../components/ui/Icon';
import { useQuery } from '../db/useQuery';
import { TABLES } from '../db/duckdb';
import { useFormat } from '../i18n/format';

type Source = { id: string; url: string; date?: string };
const SOURCES: Source[] = [
  { id: 'vzp', url: 'https://vzp.cz/poskytovatele/ciselniky/zdravotni-vykony', date: '2026-10-26' },
  { id: 'decree', url: 'https://www.zakonyprolidi.cz/cs/2025-432', date: '2026-10-26' },
  { id: 'prices', url: 'https://webkalkulacka.agellab.cz/' },
  { id: 'mri', url: 'https://www.rcpath.org/' },
  { id: 'ckdepi', url: 'https://doi.org/10.1056/NEJMoa2102953' },
  { id: 'westgard', url: 'https://www.westgard.com/westgard-rules.html' },
];

type CountRow = { table_name: string; n: number };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function About() {
  const { t } = useTranslation();
  const f = useFormat();
  const counts = useQuery<CountRow>(
    TABLES.map((name) => `SELECT '${name}' AS table_name, count(*) AS n FROM ${name}`).join('\nUNION ALL\n'),
  );
  const list = (key: string) => t(key, { returnObjects: true }) as string[];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="rounded-xl border border-line bg-surface p-5">
        <h1 className="text-xl font-semibold">{t('nav.about')}</h1>
        <p className="mt-2 text-sm text-ink-2">{t('about.intro')}</p>
      </header>

      <div
        role="note"
        className="flex gap-3 rounded-xl border border-[var(--warning)]/60 bg-[var(--warning)]/10 p-4 text-sm"
      >
        <Icon name="alert" className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-semibold">{t('about.disclaimerTitle')}</p>
          <p className="mt-1 text-ink-2">{t('about.disclaimer')}</p>
        </div>
      </div>

      <Section title={t('about.sourcesTitle')}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr className="border-b border-line">
                <th className="py-2 pr-4 font-medium">{t('about.source')}</th>
                <th className="py-2 pr-4 font-medium">{t('about.usage')}</th>
                <th className="py-2 font-medium whitespace-nowrap">{t('about.retrieved')}</th>
              </tr>
            </thead>
            <tbody>
              {SOURCES.map((s) => (
                <tr key={s.id} className="border-b border-line align-top last:border-0">
                  <td className="py-2 pr-4">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-accent hover:underline"
                    >
                      {t(`about.sources.${s.id}.name`)}
                    </a>
                  </td>
                  <td className="py-2 pr-4 text-ink-2">{t(`about.sources.${s.id}.usage`)}</td>
                  <td className="py-2 whitespace-nowrap text-ink-2">{s.date ? f.date(s.date) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title={t('about.realTitle')}>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
            {list('about.real').map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Section>
        <Section title={t('about.fictionalTitle')}>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
            {list('about.fictional').map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title={t('about.generatorTitle')}>
        <div className="space-y-2 text-sm text-ink-2">
          {list('about.generator').map((x) => (
            <p key={x}>{x}</p>
          ))}
          <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs text-ink">
            <code>pip install -r data_gen/requirements.txt{'\n'}python data_gen/generate.py</code>
          </pre>
        </div>
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title={t('about.simplificationsTitle')}>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
            {list('about.simplifications').map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Section>
        <Section title={t('about.volumeTitle')}>
          <table className="w-full text-sm">
            <tbody>
              {(counts.data ?? []).map((r) => (
                <tr key={r.table_name} className="border-b border-line last:border-0">
                  <td className="py-1 font-mono text-xs">{r.table_name}</td>
                  <td className="tabular py-1 text-right">{f.num(r.n)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>

      <Section title={t('about.privacyTitle')}>
        <p className="text-sm text-ink-2">{t('about.privacy')}</p>
      </Section>
    </div>
  );
}
