import { isUtcInstant } from '@/domain/time'
import { validateBackupData } from '@/features/backup/validation'
import {
  bootstrapFormat,
  bootstrapFormatVersion,
  type BootstrapSnapshot,
  type CloudBootstrapSnapshot,
} from './model'

export function validateBootstrapSnapshot(
  value: unknown,
  ownerId: string,
): BootstrapSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid bootstrap snapshot.')
  }
  const snapshot = value as Partial<BootstrapSnapshot>
  if (
    snapshot.format !== bootstrapFormat ||
    snapshot.formatVersion !== bootstrapFormatVersion ||
    snapshot.ownerId !== ownerId ||
    !isUtcInstant(snapshot.capturedAt)
  ) {
    throw new Error('Invalid bootstrap snapshot metadata.')
  }
  return {
    format: bootstrapFormat,
    formatVersion: bootstrapFormatVersion,
    ownerId,
    capturedAt: snapshot.capturedAt,
    data: validateBackupData(snapshot.data, ownerId),
  }
}

export function validateCloudBootstrapSnapshot(
  snapshot: CloudBootstrapSnapshot,
  ownerId: string,
): CloudBootstrapSnapshot {
  if (
    snapshot.ownerId !== ownerId ||
    !Number.isInteger(snapshot.highWatermark) ||
    snapshot.highWatermark < 0 ||
    !isUtcInstant(snapshot.capturedAt)
  ) {
    throw new Error('Invalid cloud bootstrap snapshot metadata.')
  }
  const ids = new Set<string>()
  for (const entry of snapshot.entries) {
    const key = `${entry.entityType}:${entry.entityId}`
    if (
      ids.has(key) ||
      entry.entitySnapshot.id !== entry.entityId ||
      entry.entitySnapshot.userId !== ownerId ||
      !Number.isInteger(entry.serverRevision) ||
      entry.serverRevision < 1 ||
      !Number.isInteger(entry.serverVersion) ||
      entry.serverVersion < 1 ||
      !isUtcInstant(entry.occurredAt)
    ) {
      throw new Error('Invalid cloud bootstrap entity metadata.')
    }
    ids.add(key)
  }
  validateBackupData(
    {
      tasks: snapshot.entries
        .filter((entry) => entry.entityType === 'task')
        .map((entry) => entry.entitySnapshot),
      waiting: snapshot.entries
        .filter((entry) => entry.entityType === 'waiting')
        .map((entry) => entry.entitySnapshot),
      memos: snapshot.entries
        .filter((entry) => entry.entityType === 'memo')
        .map((entry) => entry.entitySnapshot),
      routines: snapshot.entries
        .filter((entry) => entry.entityType === 'routine')
        .map((entry) => entry.entitySnapshot),
      routineLogs: snapshot.entries
        .filter((entry) => entry.entityType === 'routine_log')
        .map((entry) => entry.entitySnapshot),
      activities: snapshot.entries
        .filter((entry) => entry.entityType === 'activity')
        .map((entry) => entry.entitySnapshot),
      dailyLogs: snapshot.entries
        .filter((entry) => entry.entityType === 'daily_log')
        .map((entry) => entry.entitySnapshot),
    },
    ownerId,
  )
  return structuredClone(snapshot)
}
