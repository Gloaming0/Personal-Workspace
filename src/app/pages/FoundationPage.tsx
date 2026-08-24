import { Check, Circle, Clock3 } from 'lucide-react'
import { format } from 'date-fns'
import { enUS, zhCN } from 'date-fns/locale'
import { useTranslations } from '@/features/settings/language/useTranslations'

const foundationMessageKeys = [
  'foundation.react',
  'foundation.theme',
  'foundation.responsive',
  'foundation.quality',
] as const

export function FoundationPage() {
  const { language, t } = useTranslations()
  const date = format(
    new Date(),
    language === 'zh-CN' ? 'M月d日 EEEE' : 'EEEE · MMMM d',
    { locale: language === 'zh-CN' ? zhCN : enUS },
  )

  return (
    <div className="foundation-page">
      <div className="hero">
        <p className="eyebrow">{date}</p>
        <h1>{t('hero.title')}</h1>
        <p className="hero-copy">{t('hero.description')}</p>
      </div>

      <section className="foundation-grid" aria-label={t('foundation.status')}>
        <article className="panel">
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

        <aside className="panel next-panel">
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
    </div>
  )
}
