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
    const [plannedTasks, focusTasks, waiting] = await Promise.all([
      this.dependencies.tasks.find({
        plannedOn: input.date,
        statuses: ['todo', 'doing', 'done'],
      }),
      this.dependencies.tasks.find({
        focusDate: input.date,
        statuses: ['todo', 'doing'],
      }),
      this.dependencies.waiting.find({ statuses: ['waiting', 'confirmed'] }),
    ])
    const projectIds = [
      ...new Set(
        waiting.flatMap((entity) =>
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
      projectNames,
      supportingData: this.dependencies.supportingData.get(input),
    })
  }
}
