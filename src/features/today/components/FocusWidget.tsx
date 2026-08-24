import { Target } from 'lucide-react'
import { DashboardWidget } from './DashboardWidget'
import { EmptyWidgetState, WidgetSkeleton } from './WidgetState'
import { useTranslations } from '@/features/settings/language/useTranslations'
import type { DashboardStatus, FocusItem } from '../types'
import { localize } from '../types'

interface FocusWidgetProps {
  items: FocusItem[]
  status?: DashboardStatus
}

export function FocusWidget({ items, status = 'ready' }: FocusWidgetProps) {
  const { language, t } = useTranslations()
  const visibleItems = items.slice(0, 3)

  return (
    <DashboardWidget
      className="focus-widget"
      title={t('today.focusTitle')}
      description={t('today.focusDescription')}
      count={visibleItems.length}
      icon={<Target aria-hidden="true" size={18} />}
    >
      {status === 'loading' ? (
        <WidgetSkeleton />
      ) : status === 'empty' || visibleItems.length === 0 ? (
        <EmptyWidgetState
          title={t('today.focusEmptyTitle')}
          description={t('today.focusEmptyDescription')}
        />
      ) : (
        <ol className="focus-list">
          {visibleItems.map((item, index) => (
            <li key={item.id}>
              <span className="focus-number">{index + 1}</span>
              <div>
                <strong>{localize(item.title, language)}</strong>
                <span>{localize(item.context, language)}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </DashboardWidget>
  )
}
