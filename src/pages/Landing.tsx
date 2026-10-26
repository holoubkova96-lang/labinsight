import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LANGS } from '../i18n';
import { Icon, type IconName } from '../components/ui/Icon';

const STACK = [
  'React',
  'TypeScript',
  'DuckDB-WASM',
  'Apache ECharts',
  'Tailwind CSS',
  'Zustand',
  'i18next',
  'Python',
];

export default function Landing() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  const cards: { to: string; mode: string; icon: IconName; title: string; desc: string }[] = [
    {
      to: '/clinical/overview',
      mode: 'clinical',
      icon: 'flask',
      title: t('landing.clinicalCta'),
      desc: t('landing.clinicalDesc'),
    },
    {
      to: '/business/overview',
      mode: 'business',
      icon: 'coins',
      title: t('landing.businessCta'),
      desc: t('landing.businessDesc'),
    },
    { to: '/sql', mode: 'clinical', icon: 'code', title: t('landing.sqlCta'), desc: t('landing.sqlDesc') },
  ];

  return (
    <div className="min-h-screen bg-bg" data-mode="clinical">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:py-16">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-semibold">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-8" />
            {t('app.name')}
          </span>
          <div
            className="flex rounded-lg border border-line p-0.5"
            role="radiogroup"
            aria-label={t('lang.switch')}
          >
            {LANGS.map((l) => (
              <button
                key={l}
                role="radio"
                aria-checked={lang === l}
                onClick={() => void i18n.changeLanguage(l)}
                className={`rounded-md px-2 py-1 text-xs font-semibold ${lang === l ? 'bg-surface-2 text-ink' : 'text-muted'}`}
              >
                {t(`lang.${l}`)}
              </button>
            ))}
          </div>
        </div>

        <h1 className="mt-12 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">
          {t('app.tagline')}
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-ink-2">{t('landing.lead')}</p>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {cards.map((c) => (
            <Link
              key={c.to}
              to={{ pathname: c.to, search: `?lang=${lang}` }}
              data-mode={c.mode}
              className="group rounded-xl border border-line bg-surface p-5 transition-shadow hover:shadow-md"
            >
              <span className="inline-flex rounded-lg bg-accent-soft p-2 text-accent">
                <Icon name={c.icon} className="size-5" />
              </span>
              <h2 className="mt-4 font-semibold group-hover:text-accent">{c.title} →</h2>
              <p className="mt-1 text-sm text-ink-2">{c.desc}</p>
            </Link>
          ))}
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">
              {t('landing.author')}
            </h2>
            <p className="mt-2 font-semibold">{t('landing.authorName')}</p>
            <p className="text-sm text-ink-2">{t('landing.authorRole')}</p>
            <div className="mt-3 flex gap-3 text-sm">
              <a className="text-accent hover:underline" href="#" rel="noopener">
                {t('landing.linkedin')}
              </a>
              <a
                className="text-accent hover:underline"
                href="https://github.com/holoubkova96-lang/labinsight"
                rel="noopener"
              >
                {t('landing.github')}
              </a>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">{t('landing.stack')}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {STACK.map((s) => (
                <span key={s} className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-2">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-10 flex items-start gap-2 text-xs text-muted">
          <Icon name="info" className="mt-0.5 size-3.5 shrink-0" />
          {t('app.disclaimer')}
        </p>
      </div>
    </div>
  );
}
