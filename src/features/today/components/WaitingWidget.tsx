import { Hourglass } from 'lucide-react'
import { DashboardWidget } from './DashboardWidget'
import { EmptyWidgetState, WidgetSkeleton } from './WidgetState'
import { useTranslations } from '@/features/settings/language/useTranslations'
import type { DashboardStatus, WaitingItem } from '../types'
import { localize } from '../types'

interface WaitingWidgetProps {
  items: WaitingItem[]
  status?: DashboardStatus
}

export function WaitingWidget({ items, status = 'ready' }: WaitingWidgetProps) {
  const { language, t } = useTranslations()

  return (
    <DashboardWidget
      className="waiting-widget"
      title={t('today.waitingTitle')}
      count={items.length}
      icon={<Hourglass aria-hidden="true" size={18} />}
    >
      {status === 'loading' ? (
        <WidgetSkeleton rows={2} />
      ) : status === 'empty' || items.length === 0 ? (
        <EmptyWidgetState
          title={t('today.waitingEmptyTitle')}
          description={t('today.waitingEmptyDescription')}
        />
      ) : (
        <ul className="waiting-list">
          {items.map((item) => (
            <li key={item.id}>
              <span className="waiting-status" aria-hidden="true">
                <Hourglass size={15} />
              </span>
              <div>
                <strong>{localize(item.title, language)}</strong>
                <span>{localize(item.person, language)}</span>
              </div>
              <small>{localize(item.followUp, language)}</small>
            </li>
          ))}
        </ul>
      )}
    </DashboardWidget>
  )
}
