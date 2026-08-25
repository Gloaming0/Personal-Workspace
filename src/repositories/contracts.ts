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
import type {
  ActivityEntityType,
  EntityId,
  LocalDate,
  UserId,
} from '@/domain/shared'

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
  getById(userId: UserId, id: EntityId): Promise<Task | null>
  find(userId: UserId, query: TaskQuery): Promise<Task[]>
  save(
    userId: UserId,
    task: Task,
    options?: RepositoryWriteOptions,
  ): Promise<void>
}

export interface WaitingQuery {
  statuses?: readonly WaitingStatus[]
  followUpOnOrBefore?: LocalDate
  projectId?: EntityId
}

export interface WaitingRepository {
  getById(userId: UserId, id: EntityId): Promise<Waiting | null>
  find(userId: UserId, query: WaitingQuery): Promise<Waiting[]>
  save(
    userId: UserId,
    waiting: Waiting,
    options?: RepositoryWriteOptions,
  ): Promise<void>
}

export interface RoutineRepository {
  getById(userId: UserId, id: EntityId): Promise<Routine | null>
  findByStatus(
    userId: UserId,
    statuses: readonly RoutineStatus[],
  ): Promise<Routine[]>
  save(
    userId: UserId,
    routine: Routine,
    options?: RepositoryWriteOptions,
  ): Promise<void>
}

export interface RoutineLogRepository {
  findForDate(userId: UserId, date: LocalDate): Promise<RoutineLog[]>
  findByRoutineAndDate(
    userId: UserId,
    routineId: EntityId,
    date: LocalDate,
  ): Promise<RoutineLog | null>
  save(
    userId: UserId,
    log: RoutineLog,
    options?: RepositoryWriteOptions,
  ): Promise<void>
}

export interface MemoQuery {
  pinned?: boolean
  updatedOn?: LocalDate
  timezone?: string
  projectId?: EntityId
  limit?: number
}

export interface MemoRepository {
  getById(userId: UserId, id: EntityId): Promise<Memo | null>
  find(userId: UserId, query: MemoQuery): Promise<Memo[]>
  save(
    userId: UserId,
    memo: Memo,
    options?: RepositoryWriteOptions,
  ): Promise<void>
}

export interface ProjectRepository {
  getById(userId: UserId, id: EntityId): Promise<Project | null>
  getByIds(userId: UserId, ids: readonly EntityId[]): Promise<Project[]>
  findByStatus(
    userId: UserId,
    statuses: readonly ProjectStatus[],
  ): Promise<Project[]>
  save(
    userId: UserId,
    project: Project,
    options?: RepositoryWriteOptions,
  ): Promise<void>
}

export interface DailyLogRepository {
  findByDate(userId: UserId, date: LocalDate): Promise<DailyLog | null>
  finalize(userId: UserId, log: DailyLog): Promise<void>
}

export interface ActivityQuery {
  eventTypes?: readonly ActivityEventType[]
  entityType?: ActivityEntityType
  entityId?: EntityId
  limit?: number
}

export interface ActivityRepository {
  find(userId: UserId, query: ActivityQuery): Promise<Activity[]>
  append(userId: UserId, activity: Activity): Promise<void>
}
