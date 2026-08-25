import { isRoutineScheduledOn } from '@/domain/routine'
import type {
  MemoRepository,
  RoutineLogRepository,
  RoutineRepository,
  TaskRepository,
  WaitingRepository,
} from '@/repositories/contracts'
import type { TodayProjectNameResolver } from '@/features/today/contracts'
import type { LocalDate, UserId } from '@/domain/shared'
import type { EndDayOverview } from './contracts'
import { instantToLocalDate } from '@/domain/time'

export class EndDayQuery {
  constructor(
    private readonly dependencies: {
      tasks: TaskRepository
      waiting: WaitingRepository
      memos: MemoRepository
      routines: RoutineRepository
      routineLogs: RoutineLogRepository
      projectNames: TodayProjectNameResolver
    },
  ) {}

  async execute(input: {
    userId: UserId
    date: LocalDate
    timezone: string
  }): Promise<EndDayOverview> {
    const [planned, completed, waiting, memos, routines, routineLogs] =
      await Promise.all([
        this.dependencies.tasks.find(input.userId, {
          plannedOn: input.date,
          statuses: ['todo', 'doing', 'done'],
        }),
        this.dependencies.tasks.find(input.userId, { statuses: ['done'] }),
        this.dependencies.waiting.find(input.userId, {
          statuses: ['waiting', 'confirmed'],
        }),
        this.dependencies.memos.find(input.userId, {
          updatedOn: input.date,
          timezone: input.timezone,
        }),
        this.dependencies.routines.findByStatus(input.userId, ['active']),
        this.dependencies.routineLogs.findForDate(input.userId, input.date),
      ])
    const completedOnDate = completed.filter(
      (task) =>
        task.completedAt !== null &&
        instantToLocalDate(task.completedAt, input.timezone) === input.date,
    )
    const userTasks = [
      ...new Map(
        [...planned, ...completedOnDate].map((task) => [task.id, task]),
      ).values(),
    ]
    const userWaiting = waiting
    const userMemos = memos
    const userRoutines = routines.filter((routine) =>
      isRoutineScheduledOn(routine.schedule, input.date),
    )
    const projectIds = [
      ...new Set(
        [...userTasks, ...userWaiting, ...userMemos].flatMap((entity) =>
          entity.projectId ? [entity.projectId] : [],
        ),
      ),
    ]
    return {
      ...input,
      completedTasks: userTasks.filter((task) => task.status === 'done'),
      openTasks: userTasks.filter(
        (task) => task.status === 'todo' || task.status === 'doing',
      ),
      waiting: userWaiting,
      memos: userMemos,
      routines: userRoutines,
      routineLogs,
      projectNames: await this.dependencies.projectNames.resolve(projectIds),
    }
  }
}
