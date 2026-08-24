import { CircleDashed } from 'lucide-react'
import { useTranslations } from '@/features/settings/language/useTranslations'

interface EmptyWidgetStateProps {
  title: string
  description: string
}

export function EmptyWidgetState({
  description,
  title,
}: EmptyWidgetStateProps) {
  return (
    <div className="widget-empty-state">
      <CircleDashed aria-hidden="true" size={20} />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  )
}

export function WidgetSkeleton({ rows = 3 }: { rows?: number }) {
  const { t } = useTranslations()

  return (
    <div
      className="widget-skeleton"
      role="status"
      aria-label={t('today.loading')}
    >
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton-row" key={index}>
          <span />
          <div>
            <i />
            <i />
          </div>
        </div>
      ))}
      <span className="sr-only">{t('today.loading')}</span>
    </div>
  )
}
