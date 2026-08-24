import type {
  Activity,
  Memo,
  Project,
  Routine,
  RoutineLog,
  Task,
  Waiting,
} from '@/domain/entities'
import type { LocalDate } from '@/domain/shared'
import type {
  ActivityRepository,
  MemoRepository,
  ProjectRepository,
  RoutineLogRepository,
  RoutineRepository,
  TaskRepository,
  WaitingRepository,
} from '@/repositories/contracts'
import type { TodayDashboardViewModel } from './viewModel'

export interface TodayDashboardQueryInput {
  date: LocalDate
  timezone: string
}

export interface TodayDashboardQuery {
  execute(input: TodayDashboardQueryInput): Promise<TodayDashboardViewModel>
}

export interface TodayDashboardQueryDependencies {
  tasks: TaskRepository
  waiting: WaitingRepository
  routines: RoutineRepository
  routineLogs: RoutineLogRepository
  memos: MemoRepository
  projects: ProjectRepository
  activity: ActivityRepository
  assembler: TodayDashboardViewModelAssembler
}

export interface TodayDashboardAggregate {
  date: LocalDate
  timezone: string
  tasks: Task[]
  waiting: Waiting[]
  routines: Routine[]
  routineLogs: RoutineLog[]
  memos: Memo[]
  projects: Project[]
  activity: Activity[]
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
