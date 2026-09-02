import type { SyncEntity } from '@/domain/shared'
import type { DailyWorkDatabase } from './DailyWorkDatabase'
import {
  validateActivity,
  validateDailyLog,
  validateMemo,
  validateRoutine,
  validateRoutineLog,
  validateTask,
  validateWaiting,
} from '@/repositories/validation'
import {
  validateLocalMutationChange,
  validateLocalMutationRecord,
  validatePersistedSyncConflict,
  validateSyncBootstrapRecord,
  validateSyncDeviceState,
  validateSyncMetadata,
} from '@/sync/validation'
import type {
  LocalMutationRecord,
  PersistedSyncConflict,
  SyncDeviceState,
  SyncMetadata,
} from '@/sync/contracts'
import { mutationEntityKey } from '@/sync/journal'

export type IntegrityAuditSeverity = 'error' | 'warning'

export type IntegrityAuditCode =
  | 'invalid_record'
  | 'duplicate_id'
  | 'invalid_ownership'
  | 'invalid_focus_invariant'
  | 'duplicate_routine_log'
  | 'duplicate_daily_log'
  | 'broken_reference'
  | 'invalid_sync_metadata'
  | 'cursor_regression'
  | 'orphan_mutation'
  | 'causal_cycle'
  | 'invalid_acknowledgement'
  | 'orphan_conflict'
  | 'legacy_transport_present'

export interface IntegrityAuditIssue {
  code: IntegrityAuditCode
  severity: IntegrityAuditSeverity
  storeName: string
  count: number
}

export interface IntegrityAuditReport {
  ok: boolean
  checkedAt: string
  issueCount: number
  issues: IntegrityAuditIssue[]
}

type EntityStoreName =
  | 'tasks'
  | 'confirmations'
  | 'memos'
  | 'routines'
  | 'routine_logs'
  | 'activities'
  | 'daily_logs'

type ValidatedRows<T> = { valid: T[]; invalidCount: number }

const entityValidators = {
  tasks: validateTask,
  confirmations: validateWaiting,
  memos: validateMemo,
  routines: validateRoutine,
  routine_logs: validateRoutineLog,
  activities: validateActivity,
  daily_logs: validateDailyLog,
} as const

function validateRows<T>(
  rows: readonly unknown[],
  validator: (value: unknown) => T,
): ValidatedRows<T> {
  const valid: T[] = []
  let invalidCount = 0
  for (const row of rows) {
    try {
      valid.push(validator(row))
    } catch {
      invalidCount += 1
    }
  }
  return { valid, invalidCount }
}

function duplicateCount(values: readonly string[]): number {
  return values.length - new Set(values).size
}

/** Read-only, content-free audit. It never repairs or deletes persisted rows. */
export async function auditDatabaseIntegrity(
  database: DailyWorkDatabase,
  now = () => new Date().toISOString(),
): Promise<IntegrityAuditReport> {
  const issues = new Map<string, IntegrityAuditIssue>()
  const add = (
    code: IntegrityAuditCode,
    storeName: string,
    count = 1,
    severity: IntegrityAuditSeverity = 'error',
  ) => {
    if (count < 1) return
    const key = `${code}:${storeName}`
    const current = issues.get(key)
    issues.set(key, {
      code,
      storeName,
      severity,
      count: (current?.count ?? 0) + count,
    })
  }

  const entityRows = {} as Record<EntityStoreName, SyncEntity[]>
  for (const storeName of Object.keys(entityValidators) as EntityStoreName[]) {
    const rows = await database.table(storeName).toArray()
    const validator = entityValidators[storeName] as (
      value: unknown,
    ) => SyncEntity
    const result = validateRows(rows, validator)
    entityRows[storeName] = result.valid
    add('invalid_record', storeName, result.invalidCount)
    add(
      'duplicate_id',
      storeName,
      duplicateCount(result.valid.map((row) => row.id)),
    )
  }

  const rawLocalChanges = await database.local_changes.toArray()
  const localChanges = validateRows(
    rawLocalChanges,
    validateLocalMutationChange,
  )
  add('invalid_record', 'local_changes', localChanges.invalidCount)
  add(
    'legacy_transport_present',
    'local_changes',
    localChanges.valid.length,
    'warning',
  )

  const metadata = validateRows(
    await database.sync_metadata.toArray(),
    validateSyncMetadata,
  )
  const mutations = validateRows(
    await database.local_mutations.toArray(),
    validateLocalMutationRecord,
  )
  const deviceStates = validateRows(
    await database.sync_device_state.toArray(),
    validateSyncDeviceState,
  )
  const conflicts = validateRows(
    await database.sync_conflicts.toArray(),
    validatePersistedSyncConflict,
  )
  const bootstrap = validateRows(
    await database.sync_bootstrap.toArray(),
    validateSyncBootstrapRecord,
  )
  for (const [storeName, result] of [
    ['sync_metadata', metadata],
    ['local_mutations', mutations],
    ['sync_device_state', deviceStates],
    ['sync_conflicts', conflicts],
    ['sync_bootstrap', bootstrap],
  ] as const) {
    add('invalid_record', storeName, result.invalidCount)
  }

  const allEntities = new Map<string, SyncEntity>()
  const typeByStore: Record<EntityStoreName, string> = {
    tasks: 'task',
    confirmations: 'waiting',
    memos: 'memo',
    routines: 'routine',
    routine_logs: 'routine_log',
    activities: 'activity',
    daily_logs: 'daily_log',
  }
  for (const storeName of Object.keys(entityRows) as EntityStoreName[]) {
    for (const entity of entityRows[storeName]) {
      allEntities.set(
        `${entity.userId}:${mutationEntityKey(typeByStore[storeName]!, entity.id)}`,
        entity,
      )
    }
  }

  const focusGroups = new Map<string, number[]>()
  for (const task of entityRows.tasks) {
    const row = task as typeof entityValidators.tasks extends (
      value: unknown,
    ) => infer T
      ? T
      : never
    if (
      row.deletedAt === null &&
      row.focusDate !== null &&
      row.focusOrder !== null &&
      (row.status === 'todo' || row.status === 'doing')
    ) {
      const key = `${row.userId}:${row.focusDate}`
      focusGroups.set(key, [...(focusGroups.get(key) ?? []), row.focusOrder])
    }
  }
  for (const slots of focusGroups.values()) {
    if (slots.length > 3 || duplicateCount(slots.map(String)) > 0) {
      add('invalid_focus_invariant', 'tasks')
    }
  }

  const activeRoutineLogs = entityRows.routine_logs.filter(
    (row) => row.deletedAt === null,
  ) as Array<SyncEntity & { routineId: string; date: string }>
  add(
    'duplicate_routine_log',
    'routine_logs',
    duplicateCount(
      activeRoutineLogs.map(
        (row) => `${row.userId}:${row.routineId}:${row.date}`,
      ),
    ),
  )
  const activeDailyLogs = entityRows.daily_logs.filter(
    (row) => row.deletedAt === null,
  ) as Array<SyncEntity & { date: string }>
  add(
    'duplicate_daily_log',
    'daily_logs',
    duplicateCount(activeDailyLogs.map((row) => `${row.userId}:${row.date}`)),
  )

  const tasks = new Set(
    entityRows.tasks.map((row) => `${row.userId}:${row.id}`),
  )
  for (const row of entityRows.confirmations as Array<
    SyncEntity & { sourceTaskId: string | null }
  >) {
    if (row.sourceTaskId && !tasks.has(`${row.userId}:${row.sourceTaskId}`)) {
      add('broken_reference', 'confirmations')
    }
  }
  const routines = new Set(
    entityRows.routines.map((row) => `${row.userId}:${row.id}`),
  )
  for (const row of activeRoutineLogs) {
    if (!routines.has(`${row.userId}:${row.routineId}`)) {
      add('broken_reference', 'routine_logs')
    }
  }

  for (const row of metadata.valid as SyncMetadata[]) {
    const entity = allEntities.get(
      `${row.userId}:${mutationEntityKey(row.entityType, row.entityId)}`,
    )
    if (!entity) add('invalid_sync_metadata', 'sync_metadata')
    else if (entity.userId !== row.userId)
      add('invalid_ownership', 'sync_metadata')
  }

  const mutationsById = new Map(
    (mutations.valid as LocalMutationRecord[]).map((row) => [
      row.mutationId,
      row,
    ]),
  )
  const causalEdges = new Map<string, Set<string>>()
  for (const mutation of mutations.valid as LocalMutationRecord[]) {
    const expectedAckKeys = new Set(
      mutation.changes.map((change) =>
        mutationEntityKey(change.entityType, change.entityId),
      ),
    )
    if (
      mutation.status === 'acknowledged' &&
      (mutation.acknowledgedAt === null ||
        mutation.entityResults.length !== expectedAckKeys.size ||
        mutation.entityResults.some(
          (result) =>
            !expectedAckKeys.has(
              mutationEntityKey(result.entityType, result.entityId),
            ),
        ))
    ) {
      add('invalid_acknowledgement', 'local_mutations')
    }
    for (const change of mutation.changes) {
      const entityKey = `${mutation.userId}:${mutationEntityKey(
        change.entityType,
        change.entityId,
      )}`
      if (!allEntities.has(entityKey)) add('orphan_mutation', 'local_mutations')
      if (change.entitySnapshot.userId !== mutation.userId) {
        add('invalid_ownership', 'local_mutations')
      }
      if (change.predecessorMutationId) {
        if (!mutationsById.has(change.predecessorMutationId)) {
          add('orphan_mutation', 'local_mutations')
        } else {
          const edges = causalEdges.get(mutation.mutationId) ?? new Set()
          edges.add(change.predecessorMutationId)
          causalEdges.set(mutation.mutationId, edges)
        }
      }
    }
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const hasCycle = (id: string): boolean => {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    const cycle = [...(causalEdges.get(id) ?? [])].some(hasCycle)
    visiting.delete(id)
    visited.add(id)
    return cycle
  }
  if ([...causalEdges.keys()].some(hasCycle)) {
    add('causal_cycle', 'local_mutations')
  }

  const deviceKeys = (deviceStates.valid as SyncDeviceState[]).map(
    (row) => `${row.userId}:${row.deviceId}`,
  )
  add('cursor_regression', 'sync_device_state', duplicateCount(deviceKeys))

  for (const conflict of conflicts.valid as PersistedSyncConflict[]) {
    if (
      conflict.mutationId &&
      mutationsById.get(conflict.mutationId)?.userId !== conflict.userId
    ) {
      add('orphan_conflict', 'sync_conflicts')
    }
  }

  const sorted = [...issues.values()].sort(
    (left, right) =>
      left.severity.localeCompare(right.severity) ||
      left.code.localeCompare(right.code) ||
      left.storeName.localeCompare(right.storeName),
  )
  return {
    ok: sorted.every((issue) => issue.severity !== 'error'),
    checkedAt: now(),
    issueCount: sorted.reduce((total, issue) => total + issue.count, 0),
    issues: sorted,
  }
}
