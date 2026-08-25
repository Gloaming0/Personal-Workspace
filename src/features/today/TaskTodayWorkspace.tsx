/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { TodayDashboard, type TodayDashboardProps } from './TodayDashboard'
import { DefaultTodayDashboardQuery } from './TodayDashboardQuery'
import { DefaultTodayDashboardViewModelAssembler } from './TodayDashboardViewModelAssembler'
import { MockTodayProjectNameResolver } from './MockTodayProjectNameResolver'
import type { TodayDashboardViewModel } from './viewModel'
import { FocusLimitError } from '@/features/tasks/TaskService'
import {
  MemoPersistenceError,
  RoutinePersistenceError,
  TaskPersistenceError,
  WaitingPersistenceError,
} from '@/repositories/errors'
import {
  getTaskRuntime,
  localUserId,
  type TaskRuntime,
} from '@/features/tasks/taskRuntime'
import { useTranslations } from '@/features/settings/language/useTranslations'
import { MorningReviewFlow } from '@/features/morningReview/MorningReviewFlow'
import type {
  MorningReviewAction,
  MorningReviewData,
} from '@/features/morningReview/contracts'
import { resolveMorningReviewDate } from '@/features/morningReview/MorningReviewQuery'

type TodayWorkspaceValue = Required<
  Pick<
    TodayDashboardProps,
    | 'data'
    | 'status'
    | 'onCreateTask'
    | 'onToggleTask'
    | 'onToggleFocus'
    | 'onCreateWaiting'
    | 'onEditWaiting'
    | 'onTransitionWaiting'
    | 'onCreateMemo'
    | 'onEditMemo'
    | 'onDeleteMemo'
    | 'onToggleMemoPin'
    | 'onCreateRoutine'
    | 'onToggleRoutine'
    | 'onPauseRoutine'
    | 'onArchiveRoutine'
  >
> &
  Pick<
    TodayDashboardProps,
    | 'actionError'
    | 'waitingActionError'
    | 'memoActionError'
    | 'routineActionError'
    | 'onLoadEndDay'
    | 'onFinalizeEndDay'
  > & {
    morningReview: MorningReviewData | null
    onApplyMorningReview: (
      taskId: string,
      action: MorningReviewAction,
    ) => Promise<void>
    onMoveAllMorningReview: () => Promise<void>
    onSkipMorningReview: () => Promise<void>
  }

const TodayWorkspaceContext = createContext<TodayWorkspaceValue | null>(null)

function createPendingViewModel(date: string): TodayDashboardViewModel {
  return {
    date,
    summary: {
      openTaskCount: 0,
      waitingCount: 0,
      completedCheckInCount: 0,
      totalCheckInCount: 0,
    },
    focus: [],
    tasks: [],
    waiting: [],
    checkIns: [],
    quickMemo: null,
    recentActivity: [],
  }
}

interface TodayWorkspaceProviderProps {
  children: ReactNode
  runtime?: TaskRuntime
}

export function TodayWorkspaceProvider({
  children,
  runtime,
}: TodayWorkspaceProviderProps) {
  const { language, t } = useTranslations()
  const localDatabaseError = t('today.localDatabaseError')
  const [taskRuntime] = useState(() => runtime ?? getTaskRuntime())
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const date = resolveMorningReviewDate(new Date().toISOString(), timezone)
  const [viewModel, setViewModel] = useState(() => createPendingViewModel(date))
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [waitingActionError, setWaitingActionError] = useState<string | null>(
    null,
  )
  const [memoActionError, setMemoActionError] = useState<string | null>(null)
  const [routineActionError, setRoutineActionError] = useState<string | null>(
    null,
  )
  const [morningReview, setMorningReview] = useState<MorningReviewData | null>(
    null,
  )

  const query = useMemo(
    () =>
      new DefaultTodayDashboardQuery({
        tasks: taskRuntime.repository,
        waiting: taskRuntime.waitingRepository,
        memos: taskRuntime.memoRepository,
        routines: taskRuntime.routineRepository,
        routineLogs: taskRuntime.routineLogRepository,
        activities: taskRuntime.activityRepository,
        projectNames: new MockTodayProjectNameResolver(),
        assembler: new DefaultTodayDashboardViewModelAssembler(),
      }),
    [taskRuntime],
  )

  const refresh = useCallback(async () => {
    await taskRuntime.ready
    const data = await query.execute({
      userId: localUserId,
      date,
      timezone,
      language,
    })
    setViewModel(data)
    setLoading(false)
  }, [date, language, query, taskRuntime, timezone])

  useEffect(() => {
    let active = true
    void taskRuntime.ready
      .then(() =>
        query.execute({ userId: localUserId, date, timezone, language }),
      )
      .then((data) => {
        if (!active) return
        setViewModel(data)
        setLoading(false)
      })
      .catch(() => {
        if (!active) return
        setActionError(localDatabaseError)
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [date, language, localDatabaseError, query, taskRuntime, timezone])

  useEffect(() => {
    let active = true
    if (!taskRuntime.morningReviewService) return
    void taskRuntime.ready
      .then(() =>
        taskRuntime.morningReviewService!.load({
          userId: localUserId,
          date,
          timezone,
        }),
      )
      .then((review) => active && setMorningReview(review))
      .catch(() => {
        // Morning Review is intentionally non-blocking. Today remains usable
        // if the optional review cannot be prepared.
      })
    return () => {
      active = false
    }
  }, [date, taskRuntime, timezone])

  const runCommand = async (command: () => Promise<unknown>) => {
    setActionError(null)
    try {
      await command()
      await refresh()
    } catch (error) {
      setActionError(
        error instanceof FocusLimitError
          ? t('today.focusLimitError')
          : error instanceof TaskPersistenceError
            ? localDatabaseError
            : t('today.taskActionError'),
      )
    }
  }

  const runWaitingCommand = async (command: () => Promise<unknown>) => {
    setWaitingActionError(null)
    try {
      await command()
      await refresh()
    } catch (error) {
      setWaitingActionError(
        error instanceof WaitingPersistenceError
          ? localDatabaseError
          : t('today.waitingActionError'),
      )
    }
  }

  const runMemoCommand = async (command: () => Promise<unknown>) => {
    setMemoActionError(null)
    try {
      await command()
      await refresh()
    } catch (error) {
      setMemoActionError(
        error instanceof MemoPersistenceError
          ? localDatabaseError
          : t('today.memoActionError'),
      )
    }
  }

  const runRoutineCommand = async (command: () => Promise<unknown>) => {
    setRoutineActionError(null)
    try {
      await command()
      await refresh()
    } catch (error) {
      setRoutineActionError(
        error instanceof RoutinePersistenceError
          ? localDatabaseError
          : t('today.routineActionError'),
      )
    }
  }

  const value: TodayWorkspaceValue = {
    data: viewModel,
    status: loading ? 'loading' : 'ready',
    actionError,
    waitingActionError,
    memoActionError,
    routineActionError,
    morningReview,
    onApplyMorningReview: async (taskId, action) => {
      if (!taskRuntime.morningReviewService) return
      const next = await taskRuntime.morningReviewService.apply(
        { userId: localUserId, date, timezone },
        taskId,
        action,
      )
      setMorningReview(next)
      await refresh()
    },
    onMoveAllMorningReview: async () => {
      if (!taskRuntime.morningReviewService) return
      await taskRuntime.morningReviewService.moveAll({
        userId: localUserId,
        date,
        timezone,
      })
      setMorningReview(null)
      await refresh()
    },
    onSkipMorningReview: async () => {
      if (!taskRuntime.morningReviewService) return
      await taskRuntime.morningReviewService.skip({
        userId: localUserId,
        date,
        timezone,
      })
      setMorningReview(null)
    },
    onCreateTask: (title) =>
      runCommand(() =>
        taskRuntime.service.create({
          userId: localUserId,
          title,
          plannedDate: date,
        }),
      ),
    onToggleTask: (taskId, completed) =>
      runCommand(() =>
        completed
          ? taskRuntime.service.reopen(localUserId, taskId)
          : taskRuntime.service.complete(localUserId, taskId),
      ),
    onToggleFocus: (taskId, focused) =>
      runCommand(() =>
        focused
          ? taskRuntime.service.removeFocus(localUserId, taskId)
          : taskRuntime.service.setFocus(localUserId, taskId, date),
      ),
    onCreateWaiting: (values) =>
      runWaitingCommand(() =>
        taskRuntime.waitingService.create({ userId: localUserId, ...values }),
      ),
    onEditWaiting: (waitingId, values) =>
      runWaitingCommand(() =>
        taskRuntime.waitingService.edit(localUserId, waitingId, values),
      ),
    onTransitionWaiting: (waitingId, action) =>
      runWaitingCommand(() => {
        switch (action) {
          case 'confirm':
            return taskRuntime.waitingService.confirm(localUserId, waitingId)
          case 'close':
            return taskRuntime.waitingService.close(localUserId, waitingId)
          case 'reopen':
            return taskRuntime.waitingService.reopen(localUserId, waitingId)
        }
      }),
    onCreateMemo: (values) =>
      runMemoCommand(() =>
        taskRuntime.memoService.create({ userId: localUserId, ...values }),
      ),
    onEditMemo: (memoId, values) =>
      runMemoCommand(() =>
        taskRuntime.memoService.edit(localUserId, memoId, values),
      ),
    onDeleteMemo: (memoId) =>
      runMemoCommand(() => taskRuntime.memoService.delete(localUserId, memoId)),
    onToggleMemoPin: (memoId, pinned) =>
      runMemoCommand(() =>
        pinned
          ? taskRuntime.memoService.unpin(localUserId, memoId)
          : taskRuntime.memoService.pin(localUserId, memoId),
      ),
    onCreateRoutine: (values) =>
      runRoutineCommand(() =>
        taskRuntime.routineService.create({
          userId: localUserId,
          timezone,
          ...values,
        }),
      ),
    onToggleRoutine: (routineId, completed) =>
      runRoutineCommand(() =>
        completed
          ? taskRuntime.routineService.undo(localUserId, routineId, date)
          : taskRuntime.routineService.complete(localUserId, routineId, date),
      ),
    onPauseRoutine: (routineId) =>
      runRoutineCommand(() =>
        taskRuntime.routineService.pause(localUserId, routineId),
      ),
    onArchiveRoutine: (routineId) =>
      runRoutineCommand(() =>
        taskRuntime.routineService.archive(localUserId, routineId),
      ),
    ...(taskRuntime.endDayService
      ? {
          onLoadEndDay: async () => {
            await taskRuntime.ready
            return taskRuntime.endDayService!.preview({
              userId: localUserId,
              date,
              timezone,
            })
          },
          onFinalizeEndDay: async (
            commandId: string,
            summary: string,
            taskActions: Record<
              string,
              'tomorrow' | 'later' | 'keep' | 'delete'
            >,
          ) => {
            await taskRuntime.ready
            await taskRuntime.endDayService!.finalize({
              commandId,
              userId: localUserId,
              date,
              timezone,
              summary,
              taskActions,
            })
            await refresh()
          },
        }
      : {}),
  }

  return (
    <TodayWorkspaceContext.Provider value={value}>
      {children}
    </TodayWorkspaceContext.Provider>
  )
}

export function useTodayWorkspace(): TodayWorkspaceValue {
  const value = useContext(TodayWorkspaceContext)
  if (!value) throw new Error('TodayWorkspaceProvider is missing.')
  return value
}

export function useOptionalTodayWorkspace(): TodayWorkspaceValue | null {
  return useContext(TodayWorkspaceContext)
}

function TodayWorkspaceDashboard() {
  const workspace = useTodayWorkspace()
  return (
    <>
      <TodayDashboard {...workspace} />
      {workspace.morningReview && (
        <MorningReviewFlow
          data={workspace.morningReview}
          onApply={workspace.onApplyMorningReview}
          onMoveAll={workspace.onMoveAllMorningReview}
          onSkip={workspace.onSkipMorningReview}
        />
      )}
    </>
  )
}

interface TaskTodayWorkspaceProps {
  runtime?: TaskRuntime
}

export function TaskTodayWorkspace({ runtime }: TaskTodayWorkspaceProps) {
  if (runtime) {
    return (
      <TodayWorkspaceProvider runtime={runtime}>
        <TodayWorkspaceDashboard />
      </TodayWorkspaceProvider>
    )
  }
  return <TodayWorkspaceDashboard />
}
