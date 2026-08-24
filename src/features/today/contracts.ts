import type { Task } from '@/domain/entities'
import type { LocalDate } from '@/domain/shared'
import type { TaskRepository } from '@/repositories/contracts'
import type {
  TodayActivityItemViewModel,
  TodayCheckInItemViewModel,
  TodayDashboardViewModel,
  TodayQuickMemoViewModel,
  TodayWaitingItemViewModel,
} from './viewModel'

export interface TodayDashboardQueryInput {
  date: LocalDate
  timezone: string
}

export interface TodayDashboardQuery {
  execute(input: TodayDashboardQueryInput): Promise<TodayDashboardViewModel>
}

export interface TodaySupportingViewModel {
  waiting: TodayWaitingItemViewModel[]
  checkIns: TodayCheckInItemViewModel[]
  quickMemo: TodayQuickMemoViewModel | null
  recentActivity: TodayActivityItemViewModel[]
  waitingCount: number
  completedCheckInCount: number
  totalCheckInCount: number
}

export interface TodaySupportingViewModelSource {
  get(input: TodayDashboardQueryInput): TodaySupportingViewModel
}

export interface TodayDashboardQueryDependencies {
  tasks: TaskRepository
  supportingData: TodaySupportingViewModelSource
  assembler: TodayDashboardViewModelAssembler
}

export interface TodayDashboardAggregate {
  date: LocalDate
  timezone: string
  plannedTasks: Task[]
  focusTasks: Task[]
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
