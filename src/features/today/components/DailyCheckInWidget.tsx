import { CalendarCheck2 } from 'lucide-react'
import { DashboardWidget } from './DashboardWidget'
import { EmptyWidgetState, WidgetSkeleton } from './WidgetState'
import { useTranslations } from '@/features/settings/language/useTranslations'
import type { DailyCheckIn, DashboardStatus } from '../types'
import { localize } from '../types'

interface DailyCheckInWidgetProps {
  items: DailyCheckIn[]
  status?: DashboardStatus
}

export function DailyCheckInWidget({
  items,
  status = 'ready',
}: DailyCheckInWidgetProps) {
  const { language, t } = useTranslations()

  return (
    <DashboardWidget
      className="utility-widget check-in-widget"
      title={t('today.checkInTitle')}
      count={items.filter((item) => item.completed).length}
      icon={<CalendarCheck2 aria-hidden="true" size={17} />}
    >
      {status === 'loading' ? (
        <WidgetSkeleton />
      ) : status === 'empty' || items.length === 0 ? (
        <EmptyWidgetState
          title={t('today.checkInEmptyTitle')}
          description={t('today.checkInEmptyDescription')}
        />
      ) : (
        <ul className="check-in-list">
          {items.map((item) => (
            <li key={item.id} data-completed={item.completed}>
              <input
                aria-label={localize(item.title, language)}
                type="checkbox"
                checked={item.completed}
                disabled
                readOnly
              />
              <span>{localize(item.title, language)}</span>
            </li>
          ))}
        </ul>
      )}
    </DashboardWidget>
  )
}
