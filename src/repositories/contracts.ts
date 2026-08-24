import type {
  Activity,
  ActivityEventType,
  DailyLog,
  Memo,
  Project,
  ProjectStatus,
  Routine,
  RoutineLog,
  RoutineStatus,
  Task,
  TaskStatus,
  Waiting,
  WaitingStatus,
} from '@/domain/entities'
import type { ActivityEntityType, EntityId, LocalDate } from '@/domain/shared'

export interface RepositoryWriteOptions {
  expectedVersion?: number
}

export interface TaskQuery {
  statuses?: readonly TaskStatus[]
  plannedOn?: LocalDate
  plannedOnOrBefore?: LocalDate
  completedOn?: LocalDate
  focusDate?: LocalDate
  projectId?: EntityId
}

export interface TaskRepository {
  getById(id: EntityId): Promise<Task | null>
  find(query: TaskQuery): Promise<Task[]>
  save(task: Task, options?: RepositoryWriteOptions): Promise<void>
}

export interface WaitingQuery {
  statuses?: readonly WaitingStatus[]
  followUpOnOrBefore?: LocalDate
  projectId?: EntityId
}

export interface WaitingRepository {
  getById(id: EntityId): Promise<Waiting | null>
  find(query: WaitingQuery): Promise<Waiting[]>
  save(waiting: Waiting, options?: RepositoryWriteOptions): Promise<void>
}

export interface RoutineRepository {
  getById(id: EntityId): Promise<Routine | null>
  findByStatus(statuses: readonly RoutineStatus[]): Promise<Routine[]>
  save(routine: Routine, options?: RepositoryWriteOptions): Promise<void>
}

export interface RoutineLogRepository {
  findForDate(date: LocalDate): Promise<RoutineLog[]>
  findByRoutineAndDate(
    routineId: EntityId,
    date: LocalDate,
  ): Promise<RoutineLog | null>
  save(log: RoutineLog, options?: RepositoryWriteOptions): Promise<void>
}

export interface MemoQuery {
  pinned?: boolean
  updatedOn?: LocalDate
  timezone?: string
  projectId?: EntityId
  limit?: number
}

export interface MemoRepository {
  getById(id: EntityId): Promise<Memo | null>
  find(query: MemoQuery): Promise<Memo[]>
  save(memo: Memo, options?: RepositoryWriteOptions): Promise<void>
}

export interface ProjectRepository {
  getById(id: EntityId): Promise<Project | null>
  getByIds(ids: readonly EntityId[]): Promise<Project[]>
  findByStatus(statuses: readonly ProjectStatus[]): Promise<Project[]>
  save(project: Project, options?: RepositoryWriteOptions): Promise<void>
}

export interface DailyLogRepository {
  findByDate(date: LocalDate): Promise<DailyLog | null>
  save(log: DailyLog, options?: RepositoryWriteOptions): Promise<void>
}

export interface ActivityQuery {
  eventTypes?: readonly ActivityEventType[]
  entityType?: ActivityEntityType
  entityId?: EntityId
  limit?: number
}

export interface ActivityRepository {
  find(query: ActivityQuery): Promise<Activity[]>
  append(activity: Activity): Promise<void>
}
