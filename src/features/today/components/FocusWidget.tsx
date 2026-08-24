import { Target } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { DashboardWidget } from './DashboardWidget'
import { EmptyWidgetState, WidgetSkeleton } from './WidgetState'
import { useTranslations } from '@/features/settings/language/useTranslations'
import type { TodayFocusItemViewModel, TodayWidgetStatus } from '../viewModel'

interface FocusWidgetProps {
  items: TodayFocusItemViewModel[]
  status?: TodayWidgetStatus
  onRemoveFocus?: (taskId: string) => Promise<unknown>
}

export function FocusWidget({
  items,
  status = 'ready',
  onRemoveFocus,
}: FocusWidgetProps) {
  const { t } = useTranslations()
  const visibleItems = [...items]
    .sort((left, right) => left.focusOrder - right.focusOrder)
    .slice(0, 3)

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
            <li key={item.taskId}>
              <span className="focus-number">{index + 1}</span>
              <div>
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
              {onRemoveFocus && (
                <button
                  className="task-inline-action"
                  type="button"
                  onClick={() => void onRemoveFocus(item.taskId)}
                >
                  {t('today.removeFocus')}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </DashboardWidget>
  )
}
