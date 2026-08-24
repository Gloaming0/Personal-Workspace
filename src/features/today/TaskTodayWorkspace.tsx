import { format } from 'date-fns'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { TodayDashboard } from './TodayDashboard'
import { DefaultTodayDashboardQuery } from './TodayDashboardQuery'
import { DefaultTodayDashboardViewModelAssembler } from './TodayDashboardViewModelAssembler'
import { MockTodaySupportingViewModelSource } from './MockTodaySupportingViewModelSource'
import { createTodaySupportingMock } from './mockData'
import type { TodayDashboardViewModel } from './viewModel'
import { FocusLimitError } from '@/features/tasks/TaskService'
import {
  createTaskRuntime,
  demoUserId,
  type TaskRuntime,
} from '@/features/tasks/taskRuntime'
import { useTranslations } from '@/features/settings/language/useTranslations'

function createPendingViewModel(
  date: string,
  language: 'en' | 'zh-CN',
): TodayDashboardViewModel {
  const supporting = createTodaySupportingMock(language)
  return {
    date,
    summary: {
      openTaskCount: 0,
      waitingCount: supporting.waitingCount,
      completedCheckInCount: supporting.completedCheckInCount,
      totalCheckInCount: supporting.totalCheckInCount,
    },
    focus: [],
    tasks: [],
    waiting: supporting.waiting,
    checkIns: supporting.checkIns,
    quickMemo: supporting.quickMemo,
    recentActivity: supporting.recentActivity,
  }
}

interface TaskTodayWorkspaceProps {
  runtime?: TaskRuntime
}

export function TaskTodayWorkspace({ runtime }: TaskTodayWorkspaceProps) {
  const { language, t } = useTranslations()
  const [taskRuntime] = useState(() => runtime ?? createTaskRuntime())
  const date = format(new Date(), 'yyyy-MM-dd')
  const [viewModel, setViewModel] = useState(() =>
    createPendingViewModel(date, language),
  )
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)

  const query = useMemo(
    () =>
      new DefaultTodayDashboardQuery({
        tasks: taskRuntime.repository,
        supportingData: new MockTodaySupportingViewModelSource(language),
        assembler: new DefaultTodayDashboardViewModelAssembler(),
      }),
    [language, taskRuntime],
  )

  const refresh = useCallback(async () => {
    const data = await query.execute({
      date,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    setViewModel(data)
    setLoading(false)
  }, [date, query])

  useEffect(() => {
    let active = true
    void query
      .execute({
        date,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      .then((data) => {
        if (!active) return
        setViewModel(data)
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [date, query])

  const runCommand = async (command: () => Promise<unknown>) => {
    setActionError(null)
    try {
      await command()
      await refresh()
    } catch (error) {
      setActionError(
        error instanceof FocusLimitError
          ? t('today.focusLimitError')
          : t('today.taskActionError'),
      )
    }
  }

  return (
    <TodayDashboard
      data={viewModel}
      status={loading ? 'loading' : 'ready'}
      actionError={actionError}
      onCreateTask={(title) =>
        runCommand(() =>
          taskRuntime.service.create({
            userId: demoUserId,
            title,
            plannedDate: date,
          }),
        )
      }
      onToggleTask={(taskId, completed) =>
        runCommand(() =>
          completed
            ? taskRuntime.service.reopen(taskId)
            : taskRuntime.service.complete(taskId),
        )
      }
      onToggleFocus={(taskId, focused) =>
        runCommand(() =>
          focused
            ? taskRuntime.service.removeFocus(taskId)
            : taskRuntime.service.setFocus(taskId, date),
        )
      }
    />
  )
}
