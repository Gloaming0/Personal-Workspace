import { isRoutineScheduledOn } from '@/domain/routine'
import type {
  MemoRepository,
  RoutineLogRepository,
  RoutineRepository,
  TaskRepository,
  WaitingRepository,
} from '@/repositories/contracts'
import type { TodayProjectNameResolver } from '@/features/today/contracts'
import type { Instant, LocalDate, UserId } from '@/domain/shared'
import type { EndDayOverview } from './contracts'
import { instantToLocalDate } from '@/domain/time'
import type { UnitOfWorkTransaction } from '@/unitOfWork/contracts'

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

  async execute(
    input: {
      userId: UserId
      date: LocalDate
      timezone: string
    },
    transaction?: UnitOfWorkTransaction,
    instant: Instant = new Date().toISOString(),
  ): Promise<EndDayOverview> {
    const taskRepository =
      transaction?.repository('tasks') ?? this.dependencies.tasks
    const waitingRepository =
      transaction?.repository('waiting') ?? this.dependencies.waiting
    const memoRepository =
      transaction?.repository('memos') ?? this.dependencies.memos
    const routineRepository =
      transaction?.repository('routines') ?? this.dependencies.routines
    const routineLogRepository =
      transaction?.repository('routineLogs') ?? this.dependencies.routineLogs
    const [planned, completed, waiting, memos, activeRoutines] =
      await Promise.all([
        taskRepository.find(input.userId, {
          plannedOn: input.date,
          statuses: ['todo', 'doing', 'done'],
        }),
        taskRepository.find(input.userId, { statuses: ['done'] }),
        waitingRepository.find(input.userId, {
          statuses: ['waiting', 'confirmed'],
        }),
        memoRepository.find(input.userId, {
          updatedOn: input.date,
          timezone: input.timezone,
        }),
        routineRepository.findByStatus(input.userId, ['active']),
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
    const userRoutines = activeRoutines.filter((routine) => {
      const routineDate = instantToLocalDate(instant, routine.timezone)
      return isRoutineScheduledOn(routine.schedule, routineDate)
    })
    const routineDates = [
      ...new Set(
        userRoutines.map((routine) =>
          instantToLocalDate(instant, routine.timezone),
        ),
      ),
    ]
    const routineLogs = (
      await Promise.all(
        routineDates.map((date) =>
          routineLogRepository.findForDate(input.userId, date),
        ),
      )
    ).flat()
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
