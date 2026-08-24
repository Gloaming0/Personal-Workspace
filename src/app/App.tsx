import { Check, Circle, Clock3, Inbox, Layers3, Sparkles } from 'lucide-react'
import { LanguageSwitcher } from '@/features/settings/language/LanguageSwitcher'
import { useTranslations } from '@/features/settings/language/useTranslations'
import { ThemeSwitcher } from '@/features/settings/theme/ThemeSwitcher'

const foundationMessageKeys = [
  'foundation.react',
  'foundation.theme',
  'foundation.responsive',
  'foundation.quality',
] as const

export function App() {
  const { t } = useTranslations()

  return (
    <main className="foundation-page">
      <nav className="foundation-nav" aria-label={t('nav.primary')}>
        <a className="brand" href="#top" aria-label={t('nav.home')}>
          <span className="brand-mark">DW</span>
          <span>Daily Work OS</span>
        </a>
        <div className="nav-links" aria-label={t('nav.foundationAreas')}>
          <a className="nav-link active" href="#foundation">
            <Layers3 aria-hidden="true" size={17} />
            <span>{t('nav.foundation')}</span>
          </a>
          <a className="nav-link" href="#principles">
            <Sparkles aria-hidden="true" size={17} />
            <span>{t('nav.principles')}</span>
          </a>
          <a className="nav-link" href="#next">
            <Inbox aria-hidden="true" size={17} />
            <span>{t('nav.next')}</span>
          </a>
        </div>
        <p className="nav-note">{t('nav.note')}</p>
      </nav>

      <section className="foundation-content" id="top">
        <header className="topbar">
          <span className="phase-label">{t('phase.label')}</span>
          <div className="preference-controls">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </header>

        <div className="hero" id="foundation">
          <p className="eyebrow">{t('hero.date')}</p>
          <h1>{t('hero.title')}</h1>
          <p className="hero-copy">{t('hero.description')}</p>
        </div>

        <section
          className="foundation-grid"
          aria-label={t('foundation.status')}
        >
          <article className="panel" id="principles">
            <div className="panel-heading">
              <div>
                <p className="section-label">{t('foundation.ready')}</p>
                <h2>{t('foundation.title')}</h2>
              </div>
              <span className="status-pill">
                <Check aria-hidden="true" size={14} />
                {t('foundation.inPlace')}
              </span>
            </div>
            <ul className="foundation-list">
              {foundationMessageKeys.map((messageKey) => (
                <li key={messageKey}>
                  <span className="check-mark">
                    <Check aria-hidden="true" size={14} />
                  </span>
                  {t(messageKey)}
                </li>
              ))}
            </ul>
          </article>

          <aside className="panel next-panel" id="next">
            <p className="section-label">{t('next.label')}</p>
            <h2>{t('next.title')}</h2>
            <div className="timeline-item">
              <Circle aria-hidden="true" size={15} />
              <div>
                <strong>{t('next.layoutTitle')}</strong>
                <span>{t('next.layoutDescription')}</span>
              </div>
            </div>
            <div className="timeline-item muted">
              <Clock3 aria-hidden="true" size={15} />
              <div>
                <strong>{t('next.workflowTitle')}</strong>
                <span>{t('next.workflowDescription')}</span>
              </div>
            </div>
          </aside>
        </section>
      </section>
    </main>
  )
}
