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
        this.dependencies.tasks.find({
          plannedOn: input.date,
          statuses: ['todo', 'doing', 'done'],
        }),
        this.dependencies.tasks.find({ statuses: ['done'] }),
        this.dependencies.waiting.find({ statuses: ['waiting', 'confirmed'] }),
        this.dependencies.memos.find({
          updatedOn: input.date,
          timezone: input.timezone,
        }),
        this.dependencies.routines.findByStatus(['active']),
        this.dependencies.routineLogs.findForDate(input.date),
      ])
    const completedOnDate = completed.filter(
      (task) =>
        task.completedAt !== null &&
        instantToLocalDate(task.completedAt, input.timezone) === input.date,
    )
    const userTasks = [
      ...new Map(
        [...planned, ...completedOnDate]
          .filter((task) => task.userId === input.userId)
          .map((task) => [task.id, task]),
      ).values(),
    ]
    const userWaiting = waiting.filter((item) => item.userId === input.userId)
    const userMemos = memos.filter((memo) => memo.userId === input.userId)
    const userRoutines = routines.filter(
      (routine) =>
        routine.userId === input.userId &&
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
      routineLogs: routineLogs.filter((log) => log.userId === input.userId),
      projectNames: await this.dependencies.projectNames.resolve(projectIds),
    }
  }
}
