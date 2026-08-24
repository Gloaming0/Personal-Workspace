import { CircleCheck, Clock3, StickyNote } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { enUS, zhCN } from 'date-fns/locale'
import { DashboardWidget } from './DashboardWidget'
import { EmptyWidgetState, WidgetSkeleton } from './WidgetState'
import { useTranslations } from '@/features/settings/language/useTranslations'
import type {
  TodayActivityItemViewModel,
  TodayActivityKind,
  TodayWidgetStatus,
} from '../viewModel'

interface RecentActivityWidgetProps {
  items: TodayActivityItemViewModel[]
  status?: TodayWidgetStatus
}

const activityIcons: Record<TodayActivityKind, typeof Clock3> = {
  task_completed: CircleCheck,
  waiting_created: Clock3,
  memo_updated: StickyNote,
}

const activityMessageKeys = {
  task_completed: 'today.activityTaskCompleted',
  waiting_created: 'today.activityWaitingCreated',
  memo_updated: 'today.activityMemoUpdated',
} as const

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
              <li key={item.activityId}>
                <span className="activity-icon">
                  <ActivityIcon aria-hidden="true" size={14} />
                </span>
                <div>
                  <strong>
                    {t(activityMessageKeys[item.kind]).replace(
                      '{title}',
                      item.entityTitle,
                    )}
                  </strong>
                  <span>
                    {formatDistanceToNow(parseISO(item.occurredAt), {
                      addSuffix: true,
                      locale: language === 'zh-CN' ? zhCN : enUS,
                    })}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </DashboardWidget>
  )
}
