import type { SyncEntity } from '@/domain/shared'
import type {
  LocalMutationChange,
  SyncConflict,
  SyncEntityType,
} from './contracts'

export function detectConcurrentMutationConflict(
  first: LocalMutationChange,
  second: LocalMutationChange,
): SyncConflict | null {
  if (
    first.userId !== second.userId ||
    first.entityType !== second.entityType ||
    first.entityId !== second.entityId ||
    first.mutationId === second.mutationId ||
    first.baseVersion !== second.baseVersion
  ) {
    return null
  }
  if (first.operation === 'delete' || second.operation === 'delete') {
    return {
      type: 'DeleteVsUpdate',
      entityType: first.entityType,
      entityId: first.entityId,
    }
  }
  return {
    type: 'SameBaseConcurrentEdit',
    entityType: first.entityType,
    entityId: first.entityId,
  }
}

export function validateRemoteUniqueInvariants(
  entityType: SyncEntityType,
  incoming: SyncEntity,
  effectivePeers: readonly SyncEntity[],
): SyncConflict | null {
  if (incoming.deletedAt !== null) return null
  if (entityType === 'task') {
    const task = incoming as SyncEntity & {
      focusDate: string | null
      focusOrder: number | null
      status: string
    }
    if (task.focusDate === null || task.focusOrder === null) return null
    const focused = effectivePeers.filter((peer) => {
      const candidate = peer as typeof task
      return (
        candidate.id !== task.id &&
        candidate.deletedAt === null &&
        candidate.focusDate === task.focusDate &&
        candidate.focusOrder !== null &&
        (candidate.status === 'todo' || candidate.status === 'doing')
      )
    }) as Array<typeof task>
    if (
      focused.length >= 3 ||
      focused.some((peer) => peer.focusOrder === task.focusOrder)
    ) {
      return { type: 'DuplicateUniqueInvariant', invariant: 'focus' }
    }
  }
  if (entityType === 'routine_log') {
    const log = incoming as SyncEntity & { routineId: string; date: string }
    if (
      effectivePeers.some((peer) => {
        const candidate = peer as typeof log
        return (
          candidate.id !== log.id &&
          candidate.deletedAt === null &&
          candidate.routineId === log.routineId &&
          candidate.date === log.date
        )
      })
    ) {
      return { type: 'DuplicateUniqueInvariant', invariant: 'routine_log' }
    }
  }
  if (entityType === 'daily_log') {
    const log = incoming as SyncEntity & { date: string }
    if (
      effectivePeers.some((peer) => {
        const candidate = peer as typeof log
        return (
          candidate.id !== log.id &&
          candidate.deletedAt === null &&
          candidate.date === log.date
        )
      })
    ) {
      return { type: 'DuplicateUniqueInvariant', invariant: 'daily_log' }
    }
  }
  return null
}
