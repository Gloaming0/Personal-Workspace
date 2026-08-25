import type {
  ActivityRepository,
  DailyLogRepository,
  MemoRepository,
  RoutineLogRepository,
  RoutineRepository,
  TaskRepository,
  WaitingRepository,
} from '@/repositories/contracts'

export const unitOfWorkStores = [
  'tasks',
  'waiting',
  'memos',
  'routines',
  'routineLogs',
  'dailyLogs',
  'activities',
] as const

export type UnitOfWorkStore = (typeof unitOfWorkStores)[number]

export interface UnitOfWorkRepositories {
  tasks: TaskRepository
  waiting: WaitingRepository
  memos: MemoRepository
  routines: RoutineRepository
  routineLogs: RoutineLogRepository
  dailyLogs: DailyLogRepository
  activities: ActivityRepository
}

export interface UnitOfWorkTransaction {
  includes(store: UnitOfWorkStore): boolean
  repository<K extends UnitOfWorkStore>(store: K): UnitOfWorkRepositories[K]
}

export interface UnitOfWork {
  execute<T>(
    stores: readonly UnitOfWorkStore[],
    command: (transaction: UnitOfWorkTransaction) => Promise<T>,
  ): Promise<T>
}

export class UnitOfWorkScopeError extends Error {
  constructor(store: UnitOfWorkStore) {
    super(`The active Unit of Work does not include ${store}.`)
    this.name = 'UnitOfWorkScopeError'
  }
}

export class DefaultUnitOfWorkTransaction implements UnitOfWorkTransaction {
  private readonly stores: ReadonlySet<UnitOfWorkStore>

  constructor(stores: readonly UnitOfWorkStore[]) {
    this.stores = new Set(stores)
  }

  private repositories?: Partial<UnitOfWorkRepositories>

  withRepositories(
    repositories: Partial<UnitOfWorkRepositories>,
  ): DefaultUnitOfWorkTransaction {
    this.repositories = repositories
    return this
  }

  includes(store: UnitOfWorkStore): boolean {
    return this.stores.has(store)
  }

  repository<K extends UnitOfWorkStore>(store: K): UnitOfWorkRepositories[K] {
    const repository = this.repositories?.[store]
    if (!repository) throw new UnitOfWorkScopeError(store)
    return repository as UnitOfWorkRepositories[K]
  }
}

export function executeAtomic<T>(
  unitOfWork: UnitOfWork,
  stores: readonly UnitOfWorkStore[],
  command: (transaction: UnitOfWorkTransaction) => Promise<T>,
  transaction?: UnitOfWorkTransaction,
): Promise<T> {
  if (!transaction) return unitOfWork.execute(stores, command)
  stores.forEach((store) => {
    if (!transaction.includes(store)) throw new UnitOfWorkScopeError(store)
  })
  return command(transaction)
}
