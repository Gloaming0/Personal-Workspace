import type { PersistedChange } from '@/repositories/dexie/changeNotification'
import type {
  LocalMutationChange,
  LocalMutationRecord,
  MutationEntityChange,
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
    serverVersion: current?.serverVersion ?? null,
    lastMutationId: mutation.mutationId,
    lastAcknowledgedMutationId: current?.lastAcknowledgedMutationId ?? null,
    lastModifiedByDeviceId: mutation.deviceId,
    updatedAt: mutation.occurredAt,
  }
}

export function mutationEntityKey(
  entityType: string,
  entityId: string,
): string {
  return `${entityType}:${entityId}`
}

export function toMutationEntityChange(
  persisted: PersistedChange,
  sequence: number,
  current?: SyncMetadata,
): MutationEntityChange {
  return {
    sequence,
    entityType: persisted.entityType,
    entityId: persisted.entityId,
    operation: persisted.operation,
    baseServerRevision: current?.serverRevision ?? null,
    baseLocalVersion: persisted.baseVersion,
    resultingLocalVersion: persisted.entityVersion,
    predecessorMutationId: current?.lastMutationId ?? null,
    entitySnapshot: structuredClone(persisted.entitySnapshot),
  }
}

export function toLocalMutationRecord(
  persistedChanges: readonly PersistedChange[],
  mutation: MutationMetadata,
  commitOrder: number,
  currentMetadata: ReadonlyMap<string, SyncMetadata | undefined>,
): LocalMutationRecord {
  const changes = persistedChanges.map((persisted, index) =>
    toMutationEntityChange(
      persisted,
      index + 1,
      currentMetadata.get(
        syncMetadataId(
          mutation.userId,
          persisted.entityType,
          persisted.entityId,
        ),
      ),
    ),
  )
  return {
    ...mutation,
    commitOrder,
    entityKeys: changes.map((change) =>
      mutationEntityKey(change.entityType, change.entityId),
    ),
    changes,
    status: 'pending',
    acknowledgedAt: null,
    entityResults: [],
    failureCode: null,
  }
}

export function syncDeviceStateId(userId: string, deviceId: string): string {
  return `${userId}:${deviceId}`
}
