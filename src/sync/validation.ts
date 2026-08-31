import { isUtcInstant } from '@/domain/time'
import { InvalidPersistedEntityError } from '@/repositories/errors'
import { syncEntityTypes } from './contracts'
import type {
  LocalMutationChange,
  LocalMutationRecord,
  MutationEntityChange,
  PersistedSyncConflict,
  SyncBootstrapRecord,
  SyncDeviceState,
  SyncMetadata,
} from './contracts'
import { isUuid, mutationEntityKey, syncMetadataId } from './journal'
import {
  validateActivity,
  validateDailyLog,
  validateMemo,
  validateRoutine,
  validateRoutineLog,
  validateTask,
  validateWaiting,
} from '@/repositories/validation'

function invalid(entity: string, field: string): never {
  throw new InvalidPersistedEntityError(entity, field)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const entityValidators = {
  task: validateTask,
  waiting: validateWaiting,
  memo: validateMemo,
  routine: validateRoutine,
  routine_log: validateRoutineLog,
  activity: validateActivity,
  daily_log: validateDailyLog,
} as const

export function validateLocalMutationChange(
  value: unknown,
): LocalMutationChange {
  if (!isRecord(value)) invalid('LocalMutationChange', 'entity')
  if (!isUuid(value.id)) invalid('LocalMutationChange', 'id')
  if (!isUuid(value.mutationId)) invalid('LocalMutationChange', 'mutationId')
  if (!isUuid(value.deviceId)) invalid('LocalMutationChange', 'deviceId')
  if (typeof value.userId !== 'string' || !value.userId) {
    invalid('LocalMutationChange', 'userId')
  }
  if (!isUtcInstant(value.occurredAt)) {
    invalid('LocalMutationChange', 'occurredAt')
  }
  if (!Number.isInteger(value.sequence) || (value.sequence as number) < 1) {
    invalid('LocalMutationChange', 'sequence')
  }
  if (!syncEntityTypes.includes(value.entityType as never)) {
    invalid('LocalMutationChange', 'entityType')
  }
  if (typeof value.entityId !== 'string' || !value.entityId) {
    invalid('LocalMutationChange', 'entityId')
  }
  if (!['create', 'update', 'delete'].includes(value.operation as string)) {
    invalid('LocalMutationChange', 'operation')
  }
  if (
    !Number.isInteger(value.baseVersion) ||
    (value.baseVersion as number) < 0 ||
    !Number.isInteger(value.resultingVersion) ||
    (value.resultingVersion as number) !== (value.baseVersion as number) + 1
  ) {
    invalid('LocalMutationChange', 'version')
  }
  if (
    value.baseServerRevision !== null &&
    (typeof value.baseServerRevision !== 'number' ||
      !Number.isInteger(value.baseServerRevision) ||
      value.baseServerRevision < 1)
  ) {
    invalid('LocalMutationChange', 'baseServerRevision')
  }
  if (!['pending', 'acknowledged'].includes(value.status as string)) {
    invalid('LocalMutationChange', 'status')
  }
  if (value.acknowledgedAt !== null && !isUtcInstant(value.acknowledgedAt)) {
    invalid('LocalMutationChange', 'acknowledgedAt')
  }
  if (value.status === 'pending' && value.acknowledgedAt !== null) {
    invalid('LocalMutationChange', 'acknowledgedAt')
  }
  return value as unknown as LocalMutationChange
}

export function validateSyncMetadata(value: unknown): SyncMetadata {
  if (!isRecord(value)) invalid('SyncMetadata', 'entity')
  if (typeof value.userId !== 'string' || !value.userId) {
    invalid('SyncMetadata', 'userId')
  }
  if (!syncEntityTypes.includes(value.entityType as never)) {
    invalid('SyncMetadata', 'entityType')
  }
  if (typeof value.entityId !== 'string' || !value.entityId) {
    invalid('SyncMetadata', 'entityId')
  }
  if (
    value.id !==
    syncMetadataId(value.userId, value.entityType as string, value.entityId)
  ) {
    invalid('SyncMetadata', 'id')
  }
  if (
    !Number.isInteger(value.localVersion) ||
    (value.localVersion as number) < 1
  ) {
    invalid('SyncMetadata', 'localVersion')
  }
  for (const field of ['baseServerRevision', 'serverRevision'] as const) {
    const revision = value[field]
    if (
      revision !== null &&
      (typeof revision !== 'number' ||
        !Number.isInteger(revision) ||
        revision < 1)
    ) {
      invalid('SyncMetadata', field)
    }
  }
  if (
    value.serverVersion !== null &&
    (!Number.isInteger(value.serverVersion) ||
      (value.serverVersion as number) < 1)
  ) {
    invalid('SyncMetadata', 'serverVersion')
  }
  if (!isUuid(value.lastMutationId)) {
    invalid('SyncMetadata', 'lastMutationId')
  }
  if (
    value.lastAcknowledgedMutationId !== null &&
    !isUuid(value.lastAcknowledgedMutationId)
  ) {
    invalid('SyncMetadata', 'lastAcknowledgedMutationId')
  }
  if (!isUuid(value.lastModifiedByDeviceId)) {
    invalid('SyncMetadata', 'lastModifiedByDeviceId')
  }
  if (!isUtcInstant(value.updatedAt)) invalid('SyncMetadata', 'updatedAt')
  return value as unknown as SyncMetadata
}

function validateMutationEntityChange(
  value: unknown,
  userId: string,
): MutationEntityChange {
  if (!isRecord(value)) invalid('MutationEntityChange', 'entity')
  if (!Number.isInteger(value.sequence) || (value.sequence as number) < 1)
    invalid('MutationEntityChange', 'sequence')
  if (!syncEntityTypes.includes(value.entityType as never))
    invalid('MutationEntityChange', 'entityType')
  if (typeof value.entityId !== 'string' || !value.entityId)
    invalid('MutationEntityChange', 'entityId')
  if (!['create', 'update', 'delete'].includes(value.operation as string))
    invalid('MutationEntityChange', 'operation')
  if (
    !Number.isInteger(value.baseLocalVersion) ||
    (value.baseLocalVersion as number) < 0 ||
    !Number.isInteger(value.resultingLocalVersion) ||
    (value.resultingLocalVersion as number) <=
      (value.baseLocalVersion as number)
  )
    invalid('MutationEntityChange', 'localVersion')
  if (
    value.baseServerRevision !== null &&
    (!Number.isInteger(value.baseServerRevision) ||
      (value.baseServerRevision as number) < 1)
  )
    invalid('MutationEntityChange', 'baseServerRevision')
  if (
    value.predecessorMutationId !== null &&
    !isUuid(value.predecessorMutationId)
  )
    invalid('MutationEntityChange', 'predecessorMutationId')
  const type = value.entityType as keyof typeof entityValidators
  const entity = entityValidators[type](value.entitySnapshot)
  if (
    entity.userId !== userId ||
    entity.id !== value.entityId ||
    entity.version !== value.resultingLocalVersion ||
    (value.operation === 'delete' && entity.deletedAt === null)
  )
    invalid('MutationEntityChange', 'entitySnapshot')
  return value as unknown as MutationEntityChange
}

export function validateLocalMutationRecord(
  value: unknown,
): LocalMutationRecord {
  if (!isRecord(value)) invalid('LocalMutationRecord', 'entity')
  if (!isUuid(value.mutationId)) invalid('LocalMutationRecord', 'mutationId')
  if (!isUuid(value.deviceId)) invalid('LocalMutationRecord', 'deviceId')
  if (typeof value.userId !== 'string' || !value.userId)
    invalid('LocalMutationRecord', 'userId')
  if (!Number.isInteger(value.commitOrder) || (value.commitOrder as number) < 1)
    invalid('LocalMutationRecord', 'commitOrder')
  if (!isUtcInstant(value.occurredAt))
    invalid('LocalMutationRecord', 'occurredAt')
  if (
    ![
      'pending',
      'in_flight',
      'acknowledged',
      'conflicted',
      'failed_permanent',
    ].includes(value.status as string)
  )
    invalid('LocalMutationRecord', 'status')
  if (!Array.isArray(value.changes) || value.changes.length === 0)
    invalid('LocalMutationRecord', 'changes')
  const changes = value.changes.map((change) =>
    validateMutationEntityChange(change, value.userId as string),
  )
  if (!Array.isArray(value.entityKeys))
    invalid('LocalMutationRecord', 'entityKeys')
  const entityKeys = value.entityKeys
  if (
    changes.some((change, index) => change.sequence !== index + 1) ||
    entityKeys.length !== changes.length ||
    changes.some(
      (change, index) =>
        entityKeys[index] !==
        mutationEntityKey(change.entityType, change.entityId),
    )
  )
    invalid('LocalMutationRecord', 'sequence')
  if (value.acknowledgedAt !== null && !isUtcInstant(value.acknowledgedAt))
    invalid('LocalMutationRecord', 'acknowledgedAt')
  if (!Array.isArray(value.entityResults))
    invalid('LocalMutationRecord', 'entityResults')
  if (
    value.entityResults.some(
      (result) =>
        !isRecord(result) ||
        !syncEntityTypes.includes(result.entityType as never) ||
        typeof result.entityId !== 'string' ||
        !Number.isInteger(result.serverRevision) ||
        (result.serverRevision as number) < 1 ||
        !Number.isInteger(result.serverVersion) ||
        (result.serverVersion as number) < 1,
    )
  )
    invalid('LocalMutationRecord', 'entityResults')
  if (
    (value.status === 'acknowledged') !==
    (value.acknowledgedAt !== null &&
      value.entityResults.length === changes.length)
  )
    invalid('LocalMutationRecord', 'acknowledgement')
  if (value.failureCode !== null && typeof value.failureCode !== 'string')
    invalid('LocalMutationRecord', 'failureCode')
  return value as unknown as LocalMutationRecord
}

export function validateSyncDeviceState(value: unknown): SyncDeviceState {
  if (!isRecord(value)) invalid('SyncDeviceState', 'entity')
  if (typeof value.userId !== 'string' || !value.userId)
    invalid('SyncDeviceState', 'userId')
  if (!isUuid(value.deviceId)) invalid('SyncDeviceState', 'deviceId')
  if (value.id !== `${value.userId}:${value.deviceId}`)
    invalid('SyncDeviceState', 'id')
  for (const field of ['lastCommitOrder', 'lastPulledRevision'] as const) {
    if (!Number.isInteger(value[field]) || (value[field] as number) < 0)
      invalid('SyncDeviceState', field)
  }
  if (!isUtcInstant(value.updatedAt)) invalid('SyncDeviceState', 'updatedAt')
  return value as unknown as SyncDeviceState
}

export function validateSyncBootstrapRecord(
  value: unknown,
): SyncBootstrapRecord {
  if (!isRecord(value)) invalid('SyncBootstrapRecord', 'entity')
  if (typeof value.userId !== 'string' || !value.userId)
    invalid('SyncBootstrapRecord', 'userId')
  if (
    !['clean', 'requires_bootstrap', 'bootstrapped'].includes(
      value.state as string,
    )
  )
    invalid('SyncBootstrapRecord', 'state')
  if (!isUtcInstant(value.updatedAt))
    invalid('SyncBootstrapRecord', 'updatedAt')
  return value as unknown as SyncBootstrapRecord
}

export function validatePersistedSyncConflict(
  value: unknown,
): PersistedSyncConflict {
  if (!isRecord(value)) invalid('PersistedSyncConflict', 'entity')
  if (typeof value.id !== 'string' || !value.id)
    invalid('PersistedSyncConflict', 'id')
  if (typeof value.userId !== 'string' || !value.userId)
    invalid('PersistedSyncConflict', 'userId')
  if (!syncEntityTypes.includes(value.entityType as never))
    invalid('PersistedSyncConflict', 'entityType')
  if (typeof value.entityId !== 'string' || !value.entityId)
    invalid('PersistedSyncConflict', 'entityId')
  if (!['open', 'resolved'].includes(value.status as string))
    invalid('PersistedSyncConflict', 'status')
  if (!isUtcInstant(value.createdAt))
    invalid('PersistedSyncConflict', 'createdAt')
  if (!isRecord(value.remoteChange))
    invalid('PersistedSyncConflict', 'remoteChange')
  const remote = value.remoteChange
  if (
    remote.userId !== value.userId ||
    remote.entityType !== value.entityType ||
    !isUuid(remote.mutationId) ||
    !isUuid(remote.deviceId) ||
    !isUtcInstant(remote.occurredAt) ||
    !Number.isInteger(remote.serverRevision) ||
    (remote.serverRevision as number) < 1
  )
    invalid('PersistedSyncConflict', 'remoteChange')
  return value as unknown as PersistedSyncConflict
}
