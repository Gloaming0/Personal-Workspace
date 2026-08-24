import { CircleCheck, Clock3, StickyNote } from 'lucide-react'
import { DashboardWidget } from './DashboardWidget'
import { EmptyWidgetState, WidgetSkeleton } from './WidgetState'
import { useTranslations } from '@/features/settings/language/useTranslations'
import type { DashboardStatus, RecentActivity } from '../types'
import { localize } from '../types'

interface RecentActivityWidgetProps {
  items: RecentActivity[]
  status?: DashboardStatus
}

const activityIcons = {
  task: CircleCheck,
  waiting: Clock3,
  memo: StickyNote,
}

export function RecentActivityWidget({
  items,
  status = 'ready',
}: RecentActivityWidgetProps) {
  const { language, t } = useTranslations()

  return (
    <DashboardWidget
      className="utility-widget activity-widget"
      title={t('today.activityTitle')}
      icon={<Clock3 aria-hidden="true" size={17} />}
    >
      {status === 'loading' ? (
        <WidgetSkeleton />
      ) : status === 'empty' || items.length === 0 ? (
        <EmptyWidgetState
          title={t('today.activityEmptyTitle')}
          description={t('today.activityEmptyDescription')}
        />
      ) : (
        <ul className="activity-list">
          {items.map((item) => {
            const ActivityIcon = activityIcons[item.kind]
            return (
              <li key={item.id}>
                <span className="activity-icon">
                  <ActivityIcon aria-hidden="true" size={14} />
                </span>
                <div>
                  <strong>{localize(item.description, language)}</strong>
                  <span>{localize(item.occurredAt, language)}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </DashboardWidget>
  )
}
