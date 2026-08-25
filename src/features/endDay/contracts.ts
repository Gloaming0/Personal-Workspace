import type {
  Memo,
  DailyLog,
  Routine,
  RoutineLog,
  Task,
  Waiting,
} from '@/domain/entities'
import type { EntityId, LocalDate, UserId } from '@/domain/shared'

export type UnfinishedTaskAction = 'tomorrow' | 'later' | 'keep' | 'delete'

export interface EndDayOverview {
  userId: UserId
  date: LocalDate
  timezone: string
  completedTasks: Task[]
  openTasks: Task[]
  waiting: Waiting[]
  memos: Memo[]
  routines: Routine[]
  routineLogs: RoutineLog[]
  projectNames: ReadonlyMap<EntityId, string>
  finalizedLog?: DailyLog | null
}

export interface FinalizeEndDayInput {
  commandId: EntityId
  userId: UserId
  date: LocalDate
  timezone: string
  summary: string
  taskActions: Readonly<Record<EntityId, UnfinishedTaskAction>>
}
