/* eslint-disable react-refresh/only-export-components */
import { format } from 'date-fns'
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
  >

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
  const date = format(new Date(), 'yyyy-MM-dd')
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
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
    const data = await query.execute({ date, timezone, language })
    setViewModel(data)
    setLoading(false)
  }, [date, language, query, taskRuntime, timezone])

  useEffect(() => {
    let active = true
    void taskRuntime.ready
      .then(() => query.execute({ date, timezone, language }))
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
          ? taskRuntime.service.reopen(taskId)
          : taskRuntime.service.complete(taskId),
      ),
    onToggleFocus: (taskId, focused) =>
      runCommand(() =>
        focused
          ? taskRuntime.service.removeFocus(taskId)
          : taskRuntime.service.setFocus(taskId, date),
      ),
    onCreateWaiting: (values) =>
      runWaitingCommand(() =>
        taskRuntime.waitingService.create({ userId: localUserId, ...values }),
      ),
    onEditWaiting: (waitingId, values) =>
      runWaitingCommand(() =>
        taskRuntime.waitingService.edit(waitingId, values),
      ),
    onTransitionWaiting: (waitingId, action) =>
      runWaitingCommand(() => {
        switch (action) {
          case 'confirm':
            return taskRuntime.waitingService.confirm(waitingId)
          case 'close':
            return taskRuntime.waitingService.close(waitingId)
          case 'reopen':
            return taskRuntime.waitingService.reopen(waitingId)
        }
      }),
    onCreateMemo: (values) =>
      runMemoCommand(() =>
        taskRuntime.memoService.create({ userId: localUserId, ...values }),
      ),
    onEditMemo: (memoId, values) =>
      runMemoCommand(() => taskRuntime.memoService.edit(memoId, values)),
    onDeleteMemo: (memoId) =>
      runMemoCommand(() => taskRuntime.memoService.delete(memoId)),
    onToggleMemoPin: (memoId, pinned) =>
      runMemoCommand(() =>
        pinned
          ? taskRuntime.memoService.unpin(memoId)
          : taskRuntime.memoService.pin(memoId),
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
          ? taskRuntime.routineService.undo(routineId, date)
          : taskRuntime.routineService.complete(routineId, date),
      ),
    onPauseRoutine: (routineId) =>
      runRoutineCommand(() => taskRuntime.routineService.pause(routineId)),
    onArchiveRoutine: (routineId) =>
      runRoutineCommand(() => taskRuntime.routineService.archive(routineId)),
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
  return <TodayDashboard {...useTodayWorkspace()} />
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
