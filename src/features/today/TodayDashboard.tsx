import { format, parseISO } from 'date-fns'
import { enUS, zhCN } from 'date-fns/locale'
import { useState, type FormEvent } from 'react'
import { FocusWidget } from './components/FocusWidget'
import { TodayTasksWidget } from './components/TodayTasksWidget'
import {
  WaitingWidget,
  type WaitingFormValues,
  type WaitingTransitionAction,
} from './components/WaitingWidget'
import { DailyCheckInWidget } from './components/DailyCheckInWidget'
import { QuickMemoWidget } from './components/QuickMemoWidget'
import { createTodayDashboardMock } from './mockData'
import type { TodayDashboardViewModel, TodayWidgetStatus } from './viewModel'
import { useTranslations } from '@/features/settings/language/useTranslations'

interface TodayDashboardProps {
  data?: TodayDashboardViewModel
  status?: TodayWidgetStatus
  actionError?: string | null
  onCreateTask?: (title: string) => Promise<unknown>
  onToggleTask?: (taskId: string, completed: boolean) => Promise<unknown>
  onToggleFocus?: (taskId: string, focused: boolean) => Promise<unknown>
  waitingActionError?: string | null
  onCreateWaiting?: (values: WaitingFormValues) => Promise<unknown>
  onEditWaiting?: (
    waitingId: string,
    values: WaitingFormValues,
  ) => Promise<unknown>
  onTransitionWaiting?: (
    waitingId: string,
    action: WaitingTransitionAction,
  ) => Promise<unknown>
}

export function TodayDashboard({
  data,
  status = 'ready',
  actionError,
  onCreateTask,
  onToggleTask,
  onToggleFocus,
  waitingActionError,
  onCreateWaiting,
  onEditWaiting,
  onTransitionWaiting,
}: TodayDashboardProps) {
  const { language, t } = useTranslations()
  const [taskTitle, setTaskTitle] = useState('')
  const viewModel = data ?? createTodayDashboardMock(language)
  const date = format(
    parseISO(viewModel.date),
    language === 'zh-CN' ? 'M月d日 EEEE' : 'EEEE · MMMM d',
    { locale: language === 'zh-CN' ? zhCN : enUS },
  )
  const submitTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!onCreateTask || !taskTitle.trim()) return
    await onCreateTask(taskTitle)
    setTaskTitle('')
  }

  return (
    <div className="today-dashboard">
      <header className="today-header">
        <div>
          <p className="eyebrow">{date}</p>
          <h1>{t('today.title')}</h1>
          <p>{t('today.greeting')}</p>
        </div>
        <dl className="today-summary" aria-label={t('today.summary')}>
          <div>
            <dt>{t('today.tasksStat')}</dt>
            <dd>{viewModel.summary.openTaskCount}</dd>
          </div>
          <div>
            <dt>{t('today.waitingStat')}</dt>
            <dd>{viewModel.summary.waitingCount}</dd>
          </div>
          <div>
            <dt>{t('today.checkInsStat')}</dt>
            <dd>
              {viewModel.summary.completedCheckInCount}/
              {viewModel.summary.totalCheckInCount}
            </dd>
          </div>
        </dl>
      </header>

      {onCreateTask && (
        <form className="today-task-capture" onSubmit={submitTask}>
          <label htmlFor="today-task-title">{t('today.createTaskLabel')}</label>
          <div>
            <input
              id="today-task-title"
              value={taskTitle}
              onChange={(event) => setTaskTitle(event.target.value)}
              placeholder={t('today.createTaskPlaceholder')}
              autoComplete="off"
            />
            <button type="submit" disabled={!taskTitle.trim()}>
              {t('today.createTaskAction')}
            </button>
          </div>
          {actionError && <p role="alert">{actionError}</p>}
        </form>
      )}

      <div className="today-workspace-grid">
        <FocusWidget
          items={viewModel.focus}
          status={status}
          onRemoveFocus={
            onToggleFocus ? (taskId) => onToggleFocus(taskId, true) : undefined
          }
        />
        <TodayTasksWidget
          items={viewModel.tasks}
          status={status}
          onToggleTask={onToggleTask}
          onToggleFocus={onToggleFocus}
        />
        <WaitingWidget
          items={viewModel.waiting}
          status={status}
          actionError={waitingActionError}
          onCreate={onCreateWaiting}
          onEdit={onEditWaiting}
          onTransition={onTransitionWaiting}
        />
        <div className="today-mobile-core-widgets">
          <DailyCheckInWidget items={viewModel.checkIns} status={status} />
          <QuickMemoWidget memo={viewModel.quickMemo} status={status} />
        </div>
      </div>
    </div>
  )
}
