import { isUtcInstant } from '@/domain/time'
import { InvalidPersistedEntityError } from '@/repositories/errors'
import { syncEntityTypes } from './contracts'
import type { LocalMutationChange, SyncMetadata } from './contracts'
import { isUuid, syncMetadataId } from './journal'

function invalid(entity: string, field: string): never {
  throw new InvalidPersistedEntityError(entity, field)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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
  if (!isUuid(value.lastMutationId)) {
    invalid('SyncMetadata', 'lastMutationId')
  }
  if (!isUuid(value.lastModifiedByDeviceId)) {
    invalid('SyncMetadata', 'lastModifiedByDeviceId')
  }
  if (!isUtcInstant(value.updatedAt)) invalid('SyncMetadata', 'updatedAt')
  return value as unknown as SyncMetadata
}
