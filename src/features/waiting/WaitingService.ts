import type { Waiting } from '@/domain/entities'
import type { EntityId, Instant, LocalDate } from '@/domain/shared'
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
    dependencies: WaitingServiceDependencies = {},
    private readonly activities?: ActivityService,
  ) {
    this.now = dependencies.now ?? (() => new Date().toISOString())
    this.createId = dependencies.createId ?? (() => crypto.randomUUID())
  }

  async create(input: CreateWaitingInput): Promise<Waiting> {
    const entity = createWaiting(input, {
      id: this.createId(),
      now: this.now(),
    })
    await this.waiting.save(entity)
    await this.record(entity, 'waiting_created')
    return entity
  }

  async edit(id: EntityId, input: EditWaitingInput): Promise<Waiting> {
    return this.change(
      id,
      (entity) => editWaiting(entity, input, this.now()),
      'followUpDate' in input ? 'waiting_followup_changed' : undefined,
      (previous, next) => previous.followUpDate !== next.followUpDate,
    )
  }

  async confirm(id: EntityId): Promise<Waiting> {
    return this.change(
      id,
      (entity) => confirmWaiting(entity, this.now()),
      'waiting_confirmed',
    )
  }

  async close(id: EntityId): Promise<Waiting> {
    return this.change(
      id,
      (entity) => closeWaiting(entity, this.now()),
      'waiting_closed',
    )
  }

  async reopen(id: EntityId): Promise<Waiting> {
    return this.change(
      id,
      (entity) => reopenWaiting(entity, this.now()),
      'waiting_reopened',
    )
  }

  async setFollowUpDate(
    id: EntityId,
    followUpDate: LocalDate | null,
  ): Promise<Waiting> {
    return this.change(
      id,
      (entity) => setWaitingFollowUpDate(entity, followUpDate, this.now()),
      'waiting_followup_changed',
      (previous, next) => previous.followUpDate !== next.followUpDate,
    )
  }

  private async change(
    id: EntityId,
    update: (waiting: Waiting) => Waiting,
    eventType?:
      | 'waiting_confirmed'
      | 'waiting_closed'
      | 'waiting_reopened'
      | 'waiting_followup_changed',
    shouldRecord: (previous: Waiting, next: Waiting) => boolean = () => true,
  ): Promise<Waiting> {
    const entity = await this.requireWaiting(id)
    const updated = update(entity)
    await this.waiting.save(updated, { expectedVersion: entity.version })
    if (eventType && shouldRecord(entity, updated)) {
      await this.record(updated, eventType)
    }
    return updated
  }

  private async requireWaiting(id: EntityId): Promise<Waiting> {
    const waiting = await this.waiting.getById(id)
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
  ): Promise<void> {
    await this.activities?.record({
      userId: waiting.userId,
      eventType,
      entityType: 'waiting',
      entityId: waiting.id,
      title: waiting.title,
      projectId: waiting.projectId,
    })
  }
}
