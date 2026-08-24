import { ListChecks } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { DashboardWidget } from './DashboardWidget'
import { EmptyWidgetState, WidgetSkeleton } from './WidgetState'
import { useTranslations } from '@/features/settings/language/useTranslations'
import type { TodayTaskItemViewModel, TodayWidgetStatus } from '../viewModel'

interface TodayTasksWidgetProps {
  items: TodayTaskItemViewModel[]
  status?: TodayWidgetStatus
}

export function TodayTasksWidget({
  items,
  status = 'ready',
}: TodayTasksWidgetProps) {
  const { t } = useTranslations()

  return (
    <DashboardWidget
      className="tasks-widget"
      title={t('today.tasksTitle')}
      description={t('today.tasksDescription')}
      count={items.filter((item) => item.status !== 'done').length}
      icon={<ListChecks aria-hidden="true" size={18} />}
    >
      {status === 'loading' ? (
        <WidgetSkeleton rows={4} />
      ) : status === 'empty' || items.length === 0 ? (
        <EmptyWidgetState
          title={t('today.tasksEmptyTitle')}
          description={t('today.tasksEmptyDescription')}
        />
      ) : (
        <ul className="work-item-list">
          {items.map((item) => (
            <li key={item.taskId} data-completed={item.status === 'done'}>
              <input
                aria-label={item.title}
                type="checkbox"
                checked={item.status === 'done'}
                disabled
                readOnly
              />
              <div className="work-item-copy">
                <strong>{item.title}</strong>
                <span>
                  {[
                    item.projectName,
                    item.plannedAt && format(parseISO(item.plannedAt), 'HH:mm'),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              {item.priority === 'P1' && (
                <span className="priority-mark">{t('today.highPriority')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </DashboardWidget>
  )
}
