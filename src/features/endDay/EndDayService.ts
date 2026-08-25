import { addDays, format, parseISO } from 'date-fns'
import { finalizeDailyLog } from '@/domain/dailyLog'
import type { DailyLog, DailyLogTaskSnapshot, Task } from '@/domain/entities'
import type { EntityId, Instant } from '@/domain/shared'
import type { DailyLogRepository } from '@/repositories/contracts'
import { DailyLogAlreadyFinalizedError } from '@/repositories/errors'
import type { TaskService } from '@/features/tasks/TaskService'
import type { ActivityService } from '@/features/activity/ActivityService'
import type { EndDayQuery } from './EndDayQuery'
import type {
  EndDayOverview,
  FinalizeEndDayInput,
  UnfinishedTaskAction,
} from './contracts'

interface EndDayContext {
  createId: () => EntityId
  now: () => Instant
}

const defaultContext: EndDayContext = {
  createId: () => crypto.randomUUID(),
  now: () => new Date().toISOString(),
}

export class EndDayIncompleteDecisionsError extends Error {
  constructor() {
    super('Every unfinished Task requires an End Day action.')
    this.name = 'EndDayIncompleteDecisionsError'
  }
}

export class EndDayService {
  constructor(
    private readonly query: EndDayQuery,
    private readonly taskService: TaskService,
    private readonly logs: DailyLogRepository,
    private readonly activities?: ActivityService,
    private readonly context: EndDayContext = defaultContext,
  ) {}

  async preview(input: Parameters<EndDayQuery['execute']>[0]) {
    const [overview, finalizedLog] = await Promise.all([
      this.query.execute(input),
      this.logs.findByDate(input.userId, input.date),
    ])
    return { ...overview, finalizedLog }
  }

  async finalize(input: FinalizeEndDayInput): Promise<DailyLog> {
    if (await this.logs.findByDate(input.userId, input.date)) {
      throw new DailyLogAlreadyFinalizedError(input.userId, input.date)
    }
    const overview = await this.query.execute(input)
    if (overview.openTasks.some((task) => !input.taskActions[task.id])) {
      throw new EndDayIncompleteDecisionsError()
    }

    const openTasks: Task[] = []
    const tomorrow = format(addDays(parseISO(input.date), 1), 'yyyy-MM-dd')
    for (const task of overview.openTasks) {
      const action = input.taskActions[task.id] as UnfinishedTaskAction
      if (action === 'delete') {
        await this.taskService.delete(input.userId, task.id)
      } else if (action === 'tomorrow') {
        openTasks.push(
          await this.taskService.moveToTomorrow(
            input.userId,
            task.id,
            tomorrow,
          ),
        )
      } else if (action === 'later') {
        openTasks.push(
          await this.taskService.moveToLater(input.userId, task.id),
        )
      } else {
        openTasks.push(task)
      }
    }

    const snapshotTask = (
      task: Task,
      source: EndDayOverview,
    ): DailyLogTaskSnapshot => ({
      entityId: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      projectName: task.projectId
        ? (source.projectNames.get(task.projectId) ?? null)
        : null,
      plannedDate: task.plannedDate,
      dueAt: task.dueAt,
    })
    const completedRoutineIds = new Map(
      overview.routineLogs.map((log) => [log.routineId, log.completedAt]),
    )
    const log = finalizeDailyLog(
      {
        userId: input.userId,
        date: input.date,
        summary: input.summary,
        snapshot: {
          completedTasks: overview.completedTasks.map((task) =>
            snapshotTask(task, overview),
          ),
          openTasks: openTasks.map((task) => snapshotTask(task, overview)),
          waiting: overview.waiting.map((item) => ({
            entityId: item.id,
            title: item.title,
            status: item.status,
            person: item.person,
            projectName: item.projectId
              ? (overview.projectNames.get(item.projectId) ?? null)
              : null,
            sentAt: item.sentAt,
            followUpDate: item.followUpDate,
          })),
          memos: overview.memos.map((memo) => ({
            entityId: memo.id,
            content: memo.content,
          })),
          routines: overview.routines.map((routine) => ({
            entityId: routine.id,
            title: routine.title,
            completed: completedRoutineIds.has(routine.id),
            completedAt: completedRoutineIds.get(routine.id) ?? null,
          })),
        },
      },
      { id: this.context.createId(), now: this.context.now() },
    )
    await this.logs.finalize(input.userId, log)
    try {
      await this.activities?.record({
        userId: log.userId,
        eventType: 'daily_log_finalized',
        entityType: 'daily_log',
        entityId: log.id,
        title: log.date,
      })
    } catch {
      // The immutable log is authoritative; a secondary timeline failure must
      // not make a successfully finalized day appear unsuccessful.
    }
    return log
  }
}
