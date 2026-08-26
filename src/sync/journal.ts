import type { PersistedChange } from '@/repositories/dexie/changeNotification'
import type {
  LocalMutationChange,
  MutationIntent,
  MutationMetadata,
  SyncMetadata,
} from './contracts'
import type { DeviceIdentityProvider } from './DeviceIdentityStore'

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && uuidPattern.test(value)
}

export function createMutationMetadata(
  userId: string,
  deviceIdentity: DeviceIdentityProvider,
  intent: MutationIntent | undefined,
  createId: () => string,
  now: () => string,
): MutationMetadata {
  if (!userId || (intent && intent.userId !== userId)) {
    throw new Error('Mutation ownership does not match the command owner.')
  }
  const mutationId = intent?.mutationId ?? createId()
  const deviceId = deviceIdentity.getDeviceId()
  if (!isUuid(mutationId) || !isUuid(deviceId)) {
    throw new Error('Mutation and device identifiers must be UUIDs.')
  }
  return {
    mutationId,
    deviceId,
    userId,
    occurredAt: intent?.occurredAt ?? now(),
  }
}

export function syncMetadataId(
  userId: string,
  entityType: string,
  entityId: string,
): string {
  return `${userId}:${entityType}:${entityId}`
}

export function toLocalMutationChange(
  persisted: PersistedChange,
  metadata: MutationMetadata,
  sequence: number,
  createId: () => string,
  baseServerRevision: number | null,
): LocalMutationChange {
  return {
    id: createId(),
    ...metadata,
    sequence,
    entityType: persisted.entityType,
    entityId: persisted.entityId,
    operation: persisted.operation,
    baseVersion: persisted.baseVersion,
    resultingVersion: persisted.entityVersion,
    baseServerRevision,
    status: 'pending',
    acknowledgedAt: null,
  }
}

export function toSyncMetadata(
  persisted: PersistedChange,
  mutation: MutationMetadata,
  current?: SyncMetadata,
): SyncMetadata {
  return {
    id: syncMetadataId(
      mutation.userId,
      persisted.entityType,
      persisted.entityId,
    ),
    userId: mutation.userId,
    entityType: persisted.entityType,
    entityId: persisted.entityId,
    localVersion: persisted.entityVersion,
    baseServerRevision: current?.baseServerRevision ?? null,
    serverRevision: current?.serverRevision ?? null,
    lastMutationId: mutation.mutationId,
    lastModifiedByDeviceId: mutation.deviceId,
    updatedAt: mutation.occurredAt,
  }
}
