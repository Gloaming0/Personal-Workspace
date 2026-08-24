import type {
  Activity,
  Memo,
  Routine,
  RoutineLog,
  Task,
  Waiting,
} from '@/domain/entities'
import type { EntityId, LocalDate } from '@/domain/shared'
import type {
  ActivityRepository,
  TaskRepository,
  MemoRepository,
  RoutineLogRepository,
  RoutineRepository,
  WaitingRepository,
} from '@/repositories/contracts'
import type { TodayDashboardViewModel } from './viewModel'
import type { Language } from '@/features/settings/language/types'

export interface TodayDashboardQueryInput {
  date: LocalDate
  timezone: string
  language: Language
}

export interface TodayDashboardQuery {
  execute(input: TodayDashboardQueryInput): Promise<TodayDashboardViewModel>
}

export interface TodayProjectNameResolver {
  resolve(
    projectIds: readonly EntityId[],
  ): Promise<ReadonlyMap<EntityId, string>>
}

export interface TodayDashboardQueryDependencies {
  tasks: TaskRepository
  waiting: WaitingRepository
  memos: MemoRepository
  routines: RoutineRepository
  routineLogs: RoutineLogRepository
  activities: ActivityRepository
  projectNames: TodayProjectNameResolver
  assembler: TodayDashboardViewModelAssembler
}

export interface TodayDashboardAggregate {
  date: LocalDate
  timezone: string
  language: Language
  plannedTasks: Task[]
  focusTasks: Task[]
  waiting: Waiting[]
  memos: Memo[]
  routines: Routine[]
  routineLogs: RoutineLog[]
  activities: Activity[]
  projectNames: ReadonlyMap<EntityId, string>
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
