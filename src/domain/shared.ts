export type EntityId = string
export type UserId = string
export type LocalDate = string
export type Instant = string

export interface SyncEntity {
  id: EntityId
  userId: UserId
  createdAt: Instant
  updatedAt: Instant
  deletedAt: Instant | null
  version: number
}

export interface EntityReference {
  entityType: ActivityEntityType
  entityId: EntityId
}

export type ActivityEntityType =
  'task' | 'waiting' | 'routine' | 'memo' | 'project' | 'daily_log'
