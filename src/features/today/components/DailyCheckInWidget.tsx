import { CalendarCheck2 } from 'lucide-react'
import { DashboardWidget } from './DashboardWidget'
import { EmptyWidgetState, WidgetSkeleton } from './WidgetState'
import { useTranslations } from '@/features/settings/language/useTranslations'
import type { TodayCheckInItemViewModel, TodayWidgetStatus } from '../viewModel'

interface DailyCheckInWidgetProps {
  items: TodayCheckInItemViewModel[]
  status?: TodayWidgetStatus
}

export function DailyCheckInWidget({
  items,
  status = 'ready',
}: DailyCheckInWidgetProps) {
  const { t } = useTranslations()

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
            <li key={item.routineId} data-completed={item.completed}>
              <input
                aria-label={item.title}
                type="checkbox"
                checked={item.completed}
                disabled
                readOnly
              />
              <span>{item.title}</span>
            </li>
          ))}
        </ul>
      )}
    </DashboardWidget>
  )
}
