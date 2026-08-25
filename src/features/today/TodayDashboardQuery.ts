import type {
  TodayDashboardQuery as TodayDashboardQueryContract,
  TodayDashboardQueryDependencies,
  TodayDashboardQueryInput,
} from './contracts'
import type { TodayDashboardViewModel } from './viewModel'
import { isRoutineScheduledOn } from '@/domain/routine'

export class DefaultTodayDashboardQuery implements TodayDashboardQueryContract {
  constructor(private readonly dependencies: TodayDashboardQueryDependencies) {}

  async execute(
    input: TodayDashboardQueryInput,
  ): Promise<TodayDashboardViewModel> {
    const [
      plannedTasks,
      focusTasks,
      waiting,
      pinnedMemos,
      todayMemos,
      activeRoutines,
      routineLogs,
      activities,
    ] = await Promise.all([
      this.dependencies.tasks.find(input.userId, {
        plannedOn: input.date,
        statuses: ['todo', 'doing', 'done'],
      }),
      this.dependencies.tasks.find(input.userId, {
        focusDate: input.date,
        statuses: ['todo', 'doing'],
      }),
      this.dependencies.waiting.find(input.userId, {
        statuses: ['waiting', 'confirmed'],
      }),
      this.dependencies.memos.find(input.userId, { pinned: true }),
      this.dependencies.memos.find(input.userId, {
        updatedOn: input.date,
        timezone: input.timezone,
      }),
      this.dependencies.routines.findByStatus(input.userId, ['active']),
      this.dependencies.routineLogs.findForDate(input.userId, input.date),
      this.dependencies.activities.find(input.userId, { limit: 10 }),
    ])
    const memos = [
      ...new Map(
        [...pinnedMemos, ...todayMemos].map((memo) => [memo.id, memo]),
      ).values(),
    ]
    const routines = activeRoutines.filter((routine) =>
      isRoutineScheduledOn(routine.schedule, input.date),
    )
    const projectIds = [
      ...new Set(
        [...waiting, ...memos].flatMap((entity) =>
          entity.projectId ? [entity.projectId] : [],
        ),
      ),
    ]
    const projectNames =
      await this.dependencies.projectNames.resolve(projectIds)

    return this.dependencies.assembler.assemble({
      ...input,
      plannedTasks,
      focusTasks,
      waiting,
      memos,
      routines,
      routineLogs,
      activities,
      projectNames,
    })
  }
}
