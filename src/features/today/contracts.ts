import type {
  Memo,
  Routine,
  RoutineLog,
  Task,
  Waiting,
} from '@/domain/entities'
import type { EntityId, LocalDate } from '@/domain/shared'
import type {
  TaskRepository,
  MemoRepository,
  RoutineLogRepository,
  RoutineRepository,
  WaitingRepository,
} from '@/repositories/contracts'
import type {
  TodayActivityItemViewModel,
  TodayDashboardViewModel,
} from './viewModel'

export interface TodayDashboardQueryInput {
  date: LocalDate
  timezone: string
}

export interface TodayDashboardQuery {
  execute(input: TodayDashboardQueryInput): Promise<TodayDashboardViewModel>
}

export interface TodaySupportingViewModel {
  recentActivity: TodayActivityItemViewModel[]
}

export interface TodayProjectNameResolver {
  resolve(
    projectIds: readonly EntityId[],
  ): Promise<ReadonlyMap<EntityId, string>>
}

export interface TodaySupportingViewModelSource {
  get(input: TodayDashboardQueryInput): TodaySupportingViewModel
}

export interface TodayDashboardQueryDependencies {
  tasks: TaskRepository
  waiting: WaitingRepository
  memos: MemoRepository
  routines: RoutineRepository
  routineLogs: RoutineLogRepository
  projectNames: TodayProjectNameResolver
  supportingData: TodaySupportingViewModelSource
  assembler: TodayDashboardViewModelAssembler
}

export interface TodayDashboardAggregate {
  date: LocalDate
  timezone: string
  plannedTasks: Task[]
  focusTasks: Task[]
  waiting: Waiting[]
  memos: Memo[]
  routines: Routine[]
  routineLogs: RoutineLog[]
  projectNames: ReadonlyMap<EntityId, string>
  supportingData: TodaySupportingViewModel
}

export interface TodayDashboardViewModelAssembler {
  assemble(aggregate: TodayDashboardAggregate): TodayDashboardViewModel
}

export type TodayDashboardQueryState =
  | { status: 'idle' }
  | { status: 'loading'; previousData?: TodayDashboardViewModel }
  | { status: 'success'; data: TodayDashboardViewModel }
  | {
      status: 'error'
      error: unknown
      previousData?: TodayDashboardViewModel
    }
