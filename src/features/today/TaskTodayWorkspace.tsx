/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
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
  RepositoryVersionConflictError,
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
import type { DatabaseRuntimeSnapshot } from '@/database/runtimeState'

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
    | 'databaseState'
    | 'onRetryDatabase'
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

function isVersionConflict(error: unknown): boolean {
  if (error instanceof RepositoryVersionConflictError) return true
  return (
    error instanceof Error &&
    isVersionConflict((error as Error & { cause?: unknown }).cause)
  )
}

interface TodayWorkspaceProviderProps {
  children: ReactNode
  runtime?: TaskRuntime
  userId?: string
}

export function TodayWorkspaceProvider({
  children,
  runtime,
  userId = localUserId,
}: TodayWorkspaceProviderProps) {
  const { language, t } = useTranslations()
  const localDatabaseError = t('today.localDatabaseError')
  const [taskRuntime] = useState(() => runtime ?? getTaskRuntime())
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [instant] = useState(() => new Date().toISOString())
  const date = resolveMorningReviewDate(instant, timezone)
  const fallbackDatabaseState: DatabaseRuntimeSnapshot = {
    status: 'ready',
    errorCategory: null,
    canRetry: false,
  }
  const databaseState = useSyncExternalStore(
    taskRuntime.databaseRuntime?.subscribe ?? (() => () => undefined),
    taskRuntime.databaseRuntime?.getSnapshot ?? (() => fallbackDatabaseState),
  )
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

  const ensureDatabaseReady = useCallback(async () => {
    const status = taskRuntime.databaseRuntime?.getSnapshot().status
    if (!status || status === 'opening') await taskRuntime.ready
    else if (status !== 'ready' && status !== 'read-only') {
      throw new Error('Local database is unavailable.')
    }
  }, [taskRuntime])

  const refresh = useCallback(async () => {
    await ensureDatabaseReady()
    const data = await query.execute({
      userId: userId,
      date,
      timezone,
      language,
      instant,
    })
    setViewModel(data)
    setLoading(false)
  }, [date, ensureDatabaseReady, instant, language, query, timezone, userId])

  useEffect(() => {
    let active = true
    void taskRuntime.ready
      .then(() =>
        query.execute({
          userId: userId,
          date,
          timezone,
          language,
          instant,
        }),
      )
      .then((data) => {
        if (!active) return
        setViewModel(data)
        setLoading(false)
      })
      .catch((error: unknown) => {
        if (!active) return
        const runtimeState = taskRuntime.databaseRuntime?.getSnapshot().status
        if (
          !runtimeState ||
          runtimeState === 'ready' ||
          runtimeState === 'opening'
        ) {
          taskRuntime.databaseRuntime?.failure(error)
        }
        setActionError(localDatabaseError)
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [
    date,
    instant,
    language,
    localDatabaseError,
    query,
    taskRuntime,
    timezone,
    userId,
  ])

  useEffect(() => {
    let active = true
    if (!taskRuntime.morningReviewService) return
    void taskRuntime.ready
      .then(() =>
        taskRuntime.morningReviewService!.load({
          userId: userId,
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
  }, [date, taskRuntime, timezone, userId])

  useEffect(() => {
    if (!taskRuntime.localChanges) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = taskRuntime.localChanges.subscribe(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        void refresh().catch((error: unknown) => {
          taskRuntime.databaseRuntime?.failure(error)
          setActionError(localDatabaseError)
        })
      }, 25)
    })
    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  }, [localDatabaseError, refresh, taskRuntime])

  const runCommand = async (command: () => Promise<unknown>) => {
    setActionError(null)
    try {
      await command()
      await refresh()
    } catch (error) {
      if (isVersionConflict(error)) {
        await refresh().catch(() => undefined)
        setActionError(t('today.staleConflict'))
        return
      }
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
      if (isVersionConflict(error)) {
        await refresh().catch(() => undefined)
        setWaitingActionError(t('today.staleConflict'))
        return
      }
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
      if (isVersionConflict(error)) {
        await refresh().catch(() => undefined)
        setMemoActionError(t('today.staleConflict'))
        return
      }
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
      if (isVersionConflict(error)) {
        await refresh().catch(() => undefined)
        setRoutineActionError(t('today.staleConflict'))
        return
      }
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
    databaseState,
    onRetryDatabase: async () => {
      if (!taskRuntime.retryDatabase) return
      setLoading(true)
      setActionError(null)
      try {
        await taskRuntime.retryDatabase()
        await refresh()
      } catch {
        setLoading(false)
      }
    },
    morningReview,
    onApplyMorningReview: async (taskId, action) => {
      if (!taskRuntime.morningReviewService) return
      const next = await taskRuntime.morningReviewService.apply(
        { userId: userId, date, timezone },
        taskId,
        action,
      )
      setMorningReview(next)
      await refresh()
    },
    onMoveAllMorningReview: async () => {
      if (!taskRuntime.morningReviewService) return
      await taskRuntime.morningReviewService.moveAll({
        userId: userId,
        date,
        timezone,
      })
      setMorningReview(null)
      await refresh()
    },
    onSkipMorningReview: async () => {
      if (!taskRuntime.morningReviewService) return
      await taskRuntime.morningReviewService.skip({
        userId: userId,
        date,
        timezone,
      })
      setMorningReview(null)
    },
    onCreateTask: (title) =>
      runCommand(() =>
        taskRuntime.service.create({
          userId: userId,
          title,
          plannedDate: date,
        }),
      ),
    onToggleTask: (taskId, completed, entityVersion) =>
      runCommand(() =>
        completed
          ? taskRuntime.service.reopen(userId, taskId, undefined, entityVersion)
          : taskRuntime.service.complete(
              userId,
              taskId,
              undefined,
              entityVersion,
            ),
      ),
    onToggleFocus: (taskId, focused, entityVersion) =>
      runCommand(() =>
        focused
          ? taskRuntime.service.removeFocus(
              userId,
              taskId,
              undefined,
              entityVersion,
            )
          : taskRuntime.service.setFocus(
              userId,
              taskId,
              date,
              undefined,
              entityVersion,
            ),
      ),
    onCreateWaiting: (values) =>
      runWaitingCommand(() =>
        taskRuntime.waitingService.create({ userId: userId, ...values }),
      ),
    onEditWaiting: (waitingId, values, entityVersion) =>
      runWaitingCommand(() =>
        taskRuntime.waitingService.edit(
          userId,
          waitingId,
          values,
          entityVersion,
        ),
      ),
    onTransitionWaiting: (waitingId, action, entityVersion) =>
      runWaitingCommand(() => {
        switch (action) {
          case 'confirm':
            return taskRuntime.waitingService.confirm(
              userId,
              waitingId,
              entityVersion,
            )
          case 'close':
            return taskRuntime.waitingService.close(
              userId,
              waitingId,
              entityVersion,
            )
          case 'reopen':
            return taskRuntime.waitingService.reopen(
              userId,
              waitingId,
              entityVersion,
            )
        }
      }),
    onCreateMemo: (values) =>
      runMemoCommand(() =>
        taskRuntime.memoService.create({ userId: userId, ...values }),
      ),
    onEditMemo: (memoId, values, entityVersion) =>
      runMemoCommand(() =>
        taskRuntime.memoService.edit(userId, memoId, values, entityVersion),
      ),
    onDeleteMemo: (memoId, entityVersion) =>
      runMemoCommand(() =>
        taskRuntime.memoService.delete(userId, memoId, entityVersion),
      ),
    onToggleMemoPin: (memoId, pinned, entityVersion) =>
      runMemoCommand(() =>
        pinned
          ? taskRuntime.memoService.unpin(userId, memoId, entityVersion)
          : taskRuntime.memoService.pin(userId, memoId, entityVersion),
      ),
    onCreateRoutine: (values) =>
      runRoutineCommand(() =>
        taskRuntime.routineService.create({
          userId: userId,
          timezone,
          ...values,
        }),
      ),
    onToggleRoutine: (routineId, completed, routineDate, routineVersion) =>
      runRoutineCommand(() =>
        completed
          ? taskRuntime.routineService.undo(
              userId,
              routineId,
              routineDate,
              routineVersion,
            )
          : taskRuntime.routineService.complete(
              userId,
              routineId,
              routineDate,
              routineVersion,
            ),
      ),
    onPauseRoutine: (routineId, routineVersion) =>
      runRoutineCommand(() =>
        taskRuntime.routineService.pause(userId, routineId, routineVersion),
      ),
    onArchiveRoutine: (routineId, routineVersion) =>
      runRoutineCommand(() =>
        taskRuntime.routineService.archive(userId, routineId, routineVersion),
      ),
    ...(taskRuntime.endDayService
      ? {
          onLoadEndDay: async () => {
            await ensureDatabaseReady()
            return taskRuntime.endDayService!.preview({
              userId: userId,
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
            await ensureDatabaseReady()
            await taskRuntime.endDayService!.finalize({
              commandId,
              userId: userId,
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
  userId?: string
}

export function TaskTodayWorkspace({
  runtime,
  userId,
}: TaskTodayWorkspaceProps) {
  if (runtime) {
    return (
      <TodayWorkspaceProvider runtime={runtime} userId={userId}>
        <TodayWorkspaceDashboard />
      </TodayWorkspaceProvider>
    )
  }
  return <TodayWorkspaceDashboard />
}
