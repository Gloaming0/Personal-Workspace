import type { Activity, ActivityEventType } from './entities'
import type { ActivityEntityType, EntityId, Instant, UserId } from './shared'

export interface RecordActivityInput {
  userId: UserId
  eventType: ActivityEventType
  entityType: ActivityEntityType
  entityId: EntityId
  title: string
  projectId?: EntityId | null
  deviceId?: string | null
}

export function createActivity(
  input: RecordActivityInput,
  context: { id: EntityId; now: Instant },
): Activity {
  const payload: Readonly<Record<string, unknown>> = {
    title: input.title,
    entityId: input.entityId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
  }
  return {
    id: context.id,
    userId: input.userId,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    payload,
    deviceId: input.deviceId ?? null,
    occurredAt: context.now,
    createdAt: context.now,
    updatedAt: context.now,
    deletedAt: null,
    version: 1,
  }
}
