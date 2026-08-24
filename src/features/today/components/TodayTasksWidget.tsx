import { ListChecks } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { DashboardWidget } from './DashboardWidget'
import { EmptyWidgetState, WidgetSkeleton } from './WidgetState'
import { useTranslations } from '@/features/settings/language/useTranslations'
import type { TodayTaskItemViewModel, TodayWidgetStatus } from '../viewModel'

interface TodayTasksWidgetProps {
  items: TodayTaskItemViewModel[]
  status?: TodayWidgetStatus
  onToggleTask?: (taskId: string, completed: boolean) => Promise<unknown>
  onToggleFocus?: (taskId: string, focused: boolean) => Promise<unknown>
}

export function TodayTasksWidget({
  items,
  status = 'ready',
  onToggleTask,
  onToggleFocus,
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
                disabled={!onToggleTask}
                onChange={() =>
                  void onToggleTask?.(item.taskId, item.status === 'done')
                }
                readOnly={!onToggleTask}
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
              <div className="task-item-actions">
                {item.priority === 'P1' && (
                  <span className="priority-mark">
                    {t('today.highPriority')}
                  </span>
                )}
                {onToggleFocus && item.status !== 'done' && (
                  <button
                    className="task-inline-action"
                    type="button"
                    onClick={() =>
                      void onToggleFocus(item.taskId, item.focusOrder !== null)
                    }
                  >
                    {item.focusOrder === null
                      ? t('today.setFocus')
                      : t('today.removeFocus')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashboardWidget>
  )
}
