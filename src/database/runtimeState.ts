export type DatabaseRuntimeStatus =
  | 'opening'
  | 'ready'
  | 'blocked'
  | 'unavailable'
  | 'recovery-required'
  | 'read-only'

export type DatabaseErrorCategory =
  | 'open-failure'
  | 'migration-failure'
  | 'blocked-upgrade'
  | 'versionchange'
  | 'quota-exceeded'
  | 'transaction-abort'
  | 'corrupt-record'
  | 'unknown'

export interface DatabaseDiagnostic {
  databaseVersion: number
  storeName: string | null
  errorCategory: DatabaseErrorCategory
  timestamp: string
}

export interface DatabaseRuntimeSnapshot {
  status: DatabaseRuntimeStatus
  errorCategory: DatabaseErrorCategory | null
  canRetry: boolean
}

type Listener = () => void

function errorName(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause
    return cause ? `${error.name}:${errorName(cause)}` : error.name
  }
  return typeof error === 'object' && error && 'name' in error
    ? String((error as { name: unknown }).name)
    : ''
}

export function classifyDatabaseError(
  error: unknown,
  phase: 'open' | 'migration' | 'transaction' = 'transaction',
): DatabaseErrorCategory {
  const name = errorName(error)
  if (/QuotaExceeded/i.test(name)) return 'quota-exceeded'
  if (/Abort|TransactionInactive/i.test(name)) return 'transaction-abort'
  if (phase === 'migration') return 'migration-failure'
  if (phase === 'open')
    return /Upgrade|Version/i.test(name) ? 'migration-failure' : 'open-failure'
  return 'unknown'
}

export class DatabaseReadOnlyError extends Error {
  constructor() {
    super('The local database is in read-only recovery mode.')
    this.name = 'DatabaseReadOnlyError'
  }
}

export class DatabaseRuntimeState {
  private snapshot: DatabaseRuntimeSnapshot = {
    status: 'opening',
    errorCategory: null,
    canRetry: false,
  }
  private readonly listeners = new Set<Listener>()
  private readonly diagnosticLog: DatabaseDiagnostic[] = []

  constructor(private readonly databaseVersion: number) {}

  getSnapshot = (): DatabaseRuntimeSnapshot => this.snapshot

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  diagnostics(): readonly DatabaseDiagnostic[] {
    return structuredClone(this.diagnosticLog)
  }

  opening(): void {
    this.set({ status: 'opening', errorCategory: null, canRetry: false })
  }

  ready(): void {
    this.set({ status: 'ready', errorCategory: null, canRetry: false })
  }

  blocked(): void {
    this.record('blocked-upgrade', null)
    this.set({
      status: 'blocked',
      errorCategory: 'blocked-upgrade',
      canRetry: true,
    })
  }

  versionChanged(): void {
    this.record('versionchange', null)
    this.set({
      status: 'recovery-required',
      errorCategory: 'versionchange',
      canRetry: true,
    })
  }

  failure(
    error: unknown,
    options: {
      phase?: 'open' | 'migration' | 'transaction'
      storeName?: string
    } = {},
  ): DatabaseErrorCategory {
    const category = classifyDatabaseError(
      error,
      options.phase ?? 'transaction',
    )
    this.record(category, options.storeName ?? null)
    const status: DatabaseRuntimeStatus =
      category === 'quota-exceeded'
        ? 'read-only'
        : category === 'migration-failure'
          ? 'recovery-required'
          : 'unavailable'
    this.set({ status, errorCategory: category, canRetry: true })
    return category
  }

  corruptRecord(storeName: string): void {
    this.record('corrupt-record', storeName)
  }

  enterReadOnly(): void {
    this.set({
      status: 'read-only',
      errorCategory: this.snapshot.errorCategory,
      canRetry: true,
    })
  }

  assertWritable(): void {
    if (this.snapshot.status === 'read-only') throw new DatabaseReadOnlyError()
  }

  private record(
    errorCategory: DatabaseErrorCategory,
    storeName: string | null,
  ): void {
    this.diagnosticLog.push({
      databaseVersion: this.databaseVersion,
      storeName,
      errorCategory,
      timestamp: new Date().toISOString(),
    })
  }

  private set(snapshot: DatabaseRuntimeSnapshot): void {
    this.snapshot = snapshot
    this.listeners.forEach((listener) => listener())
  }
}
