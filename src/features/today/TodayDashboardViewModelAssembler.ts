import { differenceInLocalDateDays, instantToLocalDate } from '@/domain/time'
import type {
  Activity,
  ActivityEventType,
  Memo,
  Task,
  Waiting,
} from '@/domain/entities'
import { deriveNeedsFollowUp } from '@/domain/waiting'
import type {
  TodayDashboardAggregate,
  TodayDashboardViewModelAssembler,
} from './contracts'
import type {
  TodayDashboardViewModel,
  TodayFocusItemViewModel,
  TodayTaskItemViewModel,
} from './viewModel'
import {
  messages,
  type MessageKey,
} from '@/features/settings/language/messages'

const activityMessageKeys = {
  task_created: 'today.activityTaskCreated',
  task_completed: 'today.activityTaskCompleted',
  task_reopened: 'today.activityTaskReopened',
  task_focus_set: 'today.activityTaskFocusSet',
  task_focus_removed: 'today.activityTaskFocusRemoved',
  waiting_created: 'today.activityWaitingCreated',
  waiting_confirmed: 'today.activityWaitingConfirmed',
  waiting_closed: 'today.activityWaitingClosed',
  waiting_reopened: 'today.activityWaitingReopened',
  waiting_followup_changed: 'today.activityWaitingFollowUpChanged',
  memo_created: 'today.activityMemoCreated',
  memo_updated: 'today.activityMemoUpdated',
  memo_pinned: 'today.activityMemoPinned',
  memo_unpinned: 'today.activityMemoUnpinned',
  routine_completed: 'today.activityRoutineCompleted',
  routine_completion_undone: 'today.activityRoutineUndone',
  project_status_changed: 'today.activityProjectChanged',
  daily_log_finalized: 'today.activityDailyLogFinalized',
} as const satisfies Record<ActivityEventType, MessageKey>

function toActivityViewModel(
  activity: Activity,
  aggregate: TodayDashboardAggregate,
) {
  const title =
    typeof activity.payload.title === 'string' ? activity.payload.title : ''
  return {
    activityId: activity.id,
    entityType: activity.entityType,
    text: messages[aggregate.language][
      activityMessageKeys[activity.eventType]
    ].replace('{title}', title),
    occurredAt: activity.occurredAt,
  }
}

function toQuickMemoViewModel(memo: Memo, aggregate: TodayDashboardAggregate) {
  return {
    memoId: memo.id,
    content: memo.content,
    pinned: memo.pinned,
    projectId: memo.projectId,
    projectName: memo.projectId
      ? (aggregate.projectNames.get(memo.projectId) ?? null)
      : null,
    updatedAt: memo.updatedAt,
  }
}

function toTaskViewModel(task: Task): TodayTaskItemViewModel {
  return {
    taskId: task.id,
    title: task.title,
    projectName: null,
    plannedAt: task.dueAt,
    priority: task.priority,
    status: task.status,
    focusOrder: task.focusOrder,
  }
}

type FocusedTask = Task & { focusOrder: 1 | 2 | 3 }

function toFocusViewModel(task: FocusedTask): TodayFocusItemViewModel {
  return {
    taskId: task.id,
    title: task.title,
    projectName: null,
    plannedAt: task.dueAt,
    focusOrder: task.focusOrder,
  }
}

function toWaitingViewModel(
  waiting: Waiting,
  aggregate: TodayDashboardAggregate,
) {
  return {
    waitingId: waiting.id,
    title: waiting.title,
    person: waiting.person,
    notes: waiting.notes,
    status: waiting.status,
    projectName: waiting.projectId
      ? (aggregate.projectNames.get(waiting.projectId) ?? null)
      : null,
    sourceTaskId: waiting.sourceTaskId,
    followUpDate: waiting.followUpDate,
    daysWaiting: Math.max(
      0,
      differenceInLocalDateDays(
        aggregate.date,
        instantToLocalDate(waiting.sentAt, aggregate.timezone),
      ),
    ),
    needsFollowUp: deriveNeedsFollowUp(waiting, aggregate.date),
  }
}

export class DefaultTodayDashboardViewModelAssembler implements TodayDashboardViewModelAssembler {
  assemble(aggregate: TodayDashboardAggregate): TodayDashboardViewModel {
    const tasks = aggregate.plannedTasks.map(toTaskViewModel)
    const focus = aggregate.focusTasks
      .filter((task): task is FocusedTask => task.focusOrder !== null)
      .sort((left, right) =>
        (left.focusOrder ?? 4) === (right.focusOrder ?? 4)
          ? left.createdAt.localeCompare(right.createdAt)
          : (left.focusOrder ?? 4) - (right.focusOrder ?? 4),
      )
      .slice(0, 3)
      .map(toFocusViewModel)
    const waiting = aggregate.waiting
      .map((entity) => toWaitingViewModel(entity, aggregate))
      .sort((left, right) => {
        if (left.needsFollowUp !== right.needsFollowUp)
          return left.needsFollowUp ? -1 : 1
        if (left.status !== right.status)
          return left.status === 'waiting' ? -1 : 1
        return (left.followUpDate ?? '9999-12-31').localeCompare(
          right.followUpDate ?? '9999-12-31',
        )
      })
    const quickMemo = [...aggregate.memos]
      .sort((left, right) => {
        if (left.pinned !== right.pinned) return left.pinned ? -1 : 1
        return right.updatedAt.localeCompare(left.updatedAt)
      })
      .at(0)
    const logsByRoutineAndDate = new Map(
      aggregate.routineLogs.map((log) => [`${log.routineId}:${log.date}`, log]),
    )
    const checkIns = aggregate.routines.map((routine) => {
      const date = instantToLocalDate(aggregate.instant, routine.timezone)
      const log = logsByRoutineAndDate.get(`${routine.id}:${date}`)
      return {
        routineId: routine.id,
        routineLogId: log?.id ?? null,
        date,
        title: routine.title,
        completed: Boolean(log),
      }
    })
    const recentActivity = [...aggregate.activities]
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .slice(0, 10)
      .map((activity) => toActivityViewModel(activity, aggregate))

    return {
      date: aggregate.date,
      summary: {
        openTaskCount: tasks.filter((task) => task.status !== 'done').length,
        waitingCount: waiting.length,
        completedCheckInCount: checkIns.filter((item) => item.completed).length,
        totalCheckInCount: checkIns.length,
      },
      focus,
      tasks,
      waiting,
      checkIns,
      quickMemo: quickMemo ? toQuickMemoViewModel(quickMemo, aggregate) : null,
      recentActivity,
    }
  }
}
