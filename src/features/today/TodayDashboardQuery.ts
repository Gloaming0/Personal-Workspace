import type {
  TodayDashboardQuery as TodayDashboardQueryContract,
  TodayDashboardQueryDependencies,
  TodayDashboardQueryInput,
} from './contracts'
import type { TodayDashboardViewModel } from './viewModel'

export class DefaultTodayDashboardQuery implements TodayDashboardQueryContract {
  constructor(private readonly dependencies: TodayDashboardQueryDependencies) {}

  async execute(
    input: TodayDashboardQueryInput,
  ): Promise<TodayDashboardViewModel> {
    const [plannedTasks, focusTasks] = await Promise.all([
      this.dependencies.tasks.find({
        plannedOn: input.date,
        statuses: ['todo', 'doing', 'done'],
      }),
      this.dependencies.tasks.find({
        focusDate: input.date,
        statuses: ['todo', 'doing'],
      }),
    ])

    return this.dependencies.assembler.assemble({
      ...input,
      plannedTasks,
      focusTasks,
      supportingData: this.dependencies.supportingData.get(input),
    })
  }
}
