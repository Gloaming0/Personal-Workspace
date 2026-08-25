import type { Waiting } from '@/domain/entities'
import type { EntityId, Instant, LocalDate, UserId } from '@/domain/shared'
import {
  closeWaiting,
  confirmWaiting,
  createWaiting,
  editWaiting,
  reopenWaiting,
  setWaitingFollowUpDate,
  type CreateWaitingInput,
  type EditWaitingInput,
} from '@/domain/waiting'
import type { WaitingRepository } from '@/repositories/contracts'
import { ActivityService } from '@/features/activity/ActivityService'
import {
  executeAtomic,
  type UnitOfWork,
  type UnitOfWorkTransaction,
} from '@/unitOfWork/contracts'

export class WaitingNotFoundError extends Error {
  constructor(id: EntityId) {
    super(`Waiting ${id} was not found.`)
    this.name = 'WaitingNotFoundError'
  }
}

export interface WaitingServiceDependencies {
  now?: () => Instant
  createId?: () => EntityId
}

export class WaitingService {
  private readonly now: () => Instant
  private readonly createId: () => EntityId

  constructor(
    private readonly waiting: WaitingRepository,
    private readonly unitOfWork: UnitOfWork,
    dependencies: WaitingServiceDependencies = {},
    private readonly activities?: ActivityService,
  ) {
    this.now = dependencies.now ?? (() => new Date().toISOString())
    this.createId = dependencies.createId ?? (() => crypto.randomUUID())
  }

  async create(input: CreateWaitingInput): Promise<Waiting> {
    return executeAtomic(
      this.unitOfWork,
      this.stores(true),
      async (transaction) => {
        const waiting = transaction.repository('waiting')
        const entity = createWaiting(input, {
          id: this.createId(),
          now: this.now(),
        })
        await waiting.save(input.userId, entity)
        await this.record(entity, 'waiting_created', transaction)
        return entity
      },
    )
  }

  async edit(
    userId: UserId,
    id: EntityId,
    input: EditWaitingInput,
  ): Promise<Waiting> {
    return this.change(
      userId,
      id,
      (entity) => editWaiting(entity, input, this.now()),
      'followUpDate' in input ? 'waiting_followup_changed' : undefined,
      (previous, next) => previous.followUpDate !== next.followUpDate,
    )
  }

  async confirm(userId: UserId, id: EntityId): Promise<Waiting> {
    return this.change(
      userId,
      id,
      (entity) => confirmWaiting(entity, this.now()),
      'waiting_confirmed',
    )
  }

  async close(userId: UserId, id: EntityId): Promise<Waiting> {
    return this.change(
      userId,
      id,
      (entity) => closeWaiting(entity, this.now()),
      'waiting_closed',
    )
  }

  async reopen(userId: UserId, id: EntityId): Promise<Waiting> {
    return this.change(
      userId,
      id,
      (entity) => reopenWaiting(entity, this.now()),
      'waiting_reopened',
    )
  }

  async setFollowUpDate(
    userId: UserId,
    id: EntityId,
    followUpDate: LocalDate | null,
  ): Promise<Waiting> {
    return this.change(
      userId,
      id,
      (entity) => setWaitingFollowUpDate(entity, followUpDate, this.now()),
      'waiting_followup_changed',
      (previous, next) => previous.followUpDate !== next.followUpDate,
    )
  }

  private async change(
    userId: UserId,
    id: EntityId,
    update: (waiting: Waiting) => Waiting,
    eventType?:
      | 'waiting_confirmed'
      | 'waiting_closed'
      | 'waiting_reopened'
      | 'waiting_followup_changed',
    shouldRecord: (previous: Waiting, next: Waiting) => boolean = () => true,
  ): Promise<Waiting> {
    return executeAtomic(
      this.unitOfWork,
      this.stores(Boolean(eventType)),
      async (transaction) => {
        const waiting = transaction.repository('waiting')
        const entity = await this.requireWaiting(waiting, userId, id)
        const updated = update(entity)
        await waiting.save(userId, updated, {
          expectedVersion: entity.version,
        })
        if (eventType && shouldRecord(entity, updated)) {
          await this.record(updated, eventType, transaction)
        }
        return updated
      },
    )
  }

  private stores(includeActivity: boolean) {
    return includeActivity && this.activities
      ? (['waiting', 'activities'] as const)
      : (['waiting'] as const)
  }

  private async requireWaiting(
    repository: WaitingRepository,
    userId: UserId,
    id: EntityId,
  ): Promise<Waiting> {
    const waiting = await repository.getById(userId, id)
    if (!waiting) throw new WaitingNotFoundError(id)
    return waiting
  }

  private async record(
    waiting: Waiting,
    eventType:
      | 'waiting_created'
      | 'waiting_confirmed'
      | 'waiting_closed'
      | 'waiting_reopened'
      | 'waiting_followup_changed',
    transaction: UnitOfWorkTransaction,
  ): Promise<void> {
    if (this.activities)
      await this.activities.record(
        {
          userId: waiting.userId,
          eventType,
          entityType: 'waiting',
          entityId: waiting.id,
          title: waiting.title,
          projectId: waiting.projectId,
        },
        transaction.repository('activities'),
      )
  }
}
