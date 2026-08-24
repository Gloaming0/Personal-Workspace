import { ListChecks } from 'lucide-react'
import { DashboardWidget } from './DashboardWidget'
import { EmptyWidgetState, WidgetSkeleton } from './WidgetState'
import { useTranslations } from '@/features/settings/language/useTranslations'
import type { DashboardStatus, TodayTask } from '../types'
import { localize } from '../types'

interface TodayTasksWidgetProps {
  items: TodayTask[]
  status?: DashboardStatus
}

export function TodayTasksWidget({
  items,
  status = 'ready',
}: TodayTasksWidgetProps) {
  const { language, t } = useTranslations()

  return (
    <DashboardWidget
      className="tasks-widget"
      title={t('today.tasksTitle')}
      description={t('today.tasksDescription')}
      count={items.filter((item) => !item.completed).length}
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
            <li key={item.id} data-completed={item.completed}>
              <input
                aria-label={localize(item.title, language)}
                type="checkbox"
                checked={item.completed}
                disabled
                readOnly
              />
              <div className="work-item-copy">
                <strong>{localize(item.title, language)}</strong>
                <span>
                  {localize(item.project, language)} · {item.time}
                </span>
              </div>
              {item.priority === 'high' && (
                <span className="priority-mark">{t('today.highPriority')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </DashboardWidget>
  )
}
