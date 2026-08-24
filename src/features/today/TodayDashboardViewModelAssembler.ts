import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { Task, Waiting } from '@/domain/entities'
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
      differenceInCalendarDays(
        parseISO(`${aggregate.date}T00:00:00`),
        parseISO(waiting.sentAt),
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

    return {
      date: aggregate.date,
      summary: {
        openTaskCount: tasks.filter((task) => task.status !== 'done').length,
        waitingCount: waiting.length,
        completedCheckInCount: aggregate.supportingData.completedCheckInCount,
        totalCheckInCount: aggregate.supportingData.totalCheckInCount,
      },
      focus,
      tasks,
      waiting,
      checkIns: aggregate.supportingData.checkIns,
      quickMemo: aggregate.supportingData.quickMemo,
      recentActivity: aggregate.supportingData.recentActivity,
    }
  }
}
