import { addDays, format, parseISO } from 'date-fns'
import { finalizeDailyLog } from '@/domain/dailyLog'
import type { DailyLog, DailyLogTaskSnapshot, Task } from '@/domain/entities'
import type { Instant } from '@/domain/shared'
import type { DailyLogRepository } from '@/repositories/contracts'
import { DailyLogAlreadyFinalizedError } from '@/repositories/errors'
import type { TaskService } from '@/features/tasks/TaskService'
import type { ActivityService } from '@/features/activity/ActivityService'
import { executeAtomic, type UnitOfWork } from '@/unitOfWork/contracts'
import type { EndDayQuery } from './EndDayQuery'
import type {
  EndDayOverview,
  FinalizeEndDayInput,
  UnfinishedTaskAction,
} from './contracts'

interface EndDayContext {
  now: () => Instant
}

const defaultContext: EndDayContext = {
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
    private readonly unitOfWork: UnitOfWork,
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
    const stores = this.activities
      ? ([
          'tasks',
          'waiting',
          'memos',
          'routines',
          'routineLogs',
          'dailyLogs',
          'activities',
        ] as const)
      : ([
          'tasks',
          'waiting',
          'memos',
          'routines',
          'routineLogs',
          'dailyLogs',
        ] as const)
    return executeAtomic(this.unitOfWork, stores, async (transaction) => {
      const logs = transaction.repository('dailyLogs')
      const existing = await logs.findByDate(input.userId, input.date)
      if (existing) {
        if (existing.id === input.commandId) return existing
        throw new DailyLogAlreadyFinalizedError(input.userId, input.date)
      }
      const overview = await this.query.execute(input, transaction)
      if (overview.openTasks.some((task) => !input.taskActions[task.id])) {
        throw new EndDayIncompleteDecisionsError()
      }

      const openTasks: Task[] = []
      const tomorrow = format(addDays(parseISO(input.date), 1), 'yyyy-MM-dd')
      for (const task of overview.openTasks) {
        const action = input.taskActions[task.id] as UnfinishedTaskAction
        if (action === 'delete') {
          await this.taskService.delete(input.userId, task.id, transaction)
        } else if (action === 'tomorrow') {
          openTasks.push(
            await this.taskService.moveToTomorrow(
              input.userId,
              task.id,
              tomorrow,
              transaction,
            ),
          )
        } else if (action === 'later') {
          openTasks.push(
            await this.taskService.moveToLater(
              input.userId,
              task.id,
              transaction,
            ),
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
        { id: input.commandId, now: this.context.now() },
      )
      await logs.finalize(input.userId, log)
      if (this.activities)
        await this.activities.record(
          {
            userId: log.userId,
            eventType: 'daily_log_finalized',
            entityType: 'daily_log',
            entityId: log.id,
            title: log.date,
          },
          transaction.repository('activities'),
        )
      return log
    })
  }
}
