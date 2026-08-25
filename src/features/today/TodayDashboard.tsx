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
import type { RoutineFormValues } from './components/DailyCheckInWidget'
import {
  QuickMemoWidget,
  type MemoFormValues,
} from './components/QuickMemoWidget'
import { createTodayDashboardMock } from './mockData'
import type { TodayDashboardViewModel, TodayWidgetStatus } from './viewModel'
import { useTranslations } from '@/features/settings/language/useTranslations'
import { EndDayFlow } from '@/features/endDay/EndDayFlow'
import type { EndDayOverview } from '@/features/endDay/contracts'
import type { DatabaseRuntimeSnapshot } from '@/database/runtimeState'

export interface TodayDashboardProps {
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
  memoActionError?: string | null
  onCreateMemo?: (values: MemoFormValues) => Promise<unknown>
  onEditMemo?: (memoId: string, values: MemoFormValues) => Promise<unknown>
  onDeleteMemo?: (memoId: string) => Promise<unknown>
  onToggleMemoPin?: (memoId: string, pinned: boolean) => Promise<unknown>
  routineActionError?: string | null
  databaseState?: DatabaseRuntimeSnapshot
  onRetryDatabase?: () => Promise<void>
  onCreateRoutine?: (values: RoutineFormValues) => Promise<unknown>
  onToggleRoutine?: (
    routineId: string,
    completed: boolean,
    date: string,
  ) => Promise<unknown>
  onPauseRoutine?: (routineId: string) => Promise<unknown>
  onArchiveRoutine?: (routineId: string) => Promise<unknown>
  onLoadEndDay?: () => Promise<EndDayOverview>
  onFinalizeEndDay?: (
    commandId: string,
    summary: string,
    actions: Record<string, 'tomorrow' | 'later' | 'keep' | 'delete'>,
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
  memoActionError,
  onCreateMemo,
  onEditMemo,
  onDeleteMemo,
  onToggleMemoPin,
  routineActionError,
  databaseState = { status: 'ready', errorCategory: null, canRetry: false },
  onRetryDatabase,
  onCreateRoutine,
  onToggleRoutine,
  onPauseRoutine,
  onArchiveRoutine,
  onLoadEndDay,
  onFinalizeEndDay,
}: TodayDashboardProps) {
  const { language, t } = useTranslations()
  const [taskTitle, setTaskTitle] = useState('')
  const [endDayOpen, setEndDayOpen] = useState(false)
  const viewModel = data ?? createTodayDashboardMock(language)
  const databaseUnavailable = [
    'blocked',
    'unavailable',
    'recovery-required',
  ].includes(databaseState.status)
  const readOnly = databaseState.status === 'read-only'
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
        <div className="today-header-actions">
          {onLoadEndDay &&
            onFinalizeEndDay &&
            !readOnly &&
            !databaseUnavailable && (
              <button type="button" onClick={() => setEndDayOpen(true)}>
                {t('endDay.open')}
              </button>
            )}
          {!databaseUnavailable && (
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
          )}
        </div>
      </header>

      {(databaseUnavailable || readOnly) && (
        <section
          className="database-recovery-state"
          role={databaseUnavailable ? 'alert' : 'status'}
        >
          <h2>
            {readOnly
              ? t('database.readOnlyTitle')
              : t('database.unavailableTitle')}
          </h2>
          <p>
            {readOnly
              ? t('database.readOnlyDescription')
              : t('database.unavailableDescription')}
          </p>
          {databaseState.canRetry && onRetryDatabase && (
            <button type="button" onClick={() => void onRetryDatabase()}>
              {t('database.retry')}
            </button>
          )}
        </section>
      )}

      {databaseUnavailable ? null : (
        <>
          {onCreateTask && !readOnly && (
            <form className="today-task-capture" onSubmit={submitTask}>
              <label htmlFor="today-task-title">
                {t('today.createTaskLabel')}
              </label>
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
                onToggleFocus && !readOnly
                  ? (taskId) => onToggleFocus(taskId, true)
                  : undefined
              }
            />
            <TodayTasksWidget
              items={viewModel.tasks}
              status={status}
              onToggleTask={readOnly ? undefined : onToggleTask}
              onToggleFocus={readOnly ? undefined : onToggleFocus}
            />
            <WaitingWidget
              items={viewModel.waiting}
              status={status}
              actionError={waitingActionError}
              onCreate={readOnly ? undefined : onCreateWaiting}
              onEdit={readOnly ? undefined : onEditWaiting}
              onTransition={readOnly ? undefined : onTransitionWaiting}
            />
            <div className="today-mobile-core-widgets">
              <DailyCheckInWidget
                items={viewModel.checkIns}
                status={status}
                actionError={routineActionError}
                onCreate={readOnly ? undefined : onCreateRoutine}
                onToggle={readOnly ? undefined : onToggleRoutine}
                onPause={readOnly ? undefined : onPauseRoutine}
                onArchive={readOnly ? undefined : onArchiveRoutine}
              />
              <QuickMemoWidget
                memo={viewModel.quickMemo}
                status={status}
                actionError={memoActionError}
                onCreate={readOnly ? undefined : onCreateMemo}
                onEdit={readOnly ? undefined : onEditMemo}
                onDelete={readOnly ? undefined : onDeleteMemo}
                onTogglePin={readOnly ? undefined : onToggleMemoPin}
              />
            </div>
          </div>
          {endDayOpen && onLoadEndDay && onFinalizeEndDay && !readOnly && (
            <EndDayFlow
              onClose={() => setEndDayOpen(false)}
              onLoad={onLoadEndDay}
              onFinalize={onFinalizeEndDay}
            />
          )}
        </>
      )}
    </div>
  )
}
