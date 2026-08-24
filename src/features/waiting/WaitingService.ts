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
    return entity
  }

  async edit(id: EntityId, input: EditWaitingInput): Promise<Waiting> {
    return this.change(id, (entity) => editWaiting(entity, input, this.now()))
  }

  async confirm(id: EntityId): Promise<Waiting> {
    return this.change(id, (entity) => confirmWaiting(entity, this.now()))
  }

  async close(id: EntityId): Promise<Waiting> {
    return this.change(id, (entity) => closeWaiting(entity, this.now()))
  }

  async reopen(id: EntityId): Promise<Waiting> {
    return this.change(id, (entity) => reopenWaiting(entity, this.now()))
  }

  async setFollowUpDate(
    id: EntityId,
    followUpDate: LocalDate | null,
  ): Promise<Waiting> {
    return this.change(id, (entity) =>
      setWaitingFollowUpDate(entity, followUpDate, this.now()),
    )
  }

  private async change(
    id: EntityId,
    update: (waiting: Waiting) => Waiting,
  ): Promise<Waiting> {
    const entity = await this.requireWaiting(id)
    const updated = update(entity)
    await this.waiting.save(updated, { expectedVersion: entity.version })
    return updated
  }

  private async requireWaiting(id: EntityId): Promise<Waiting> {
    const waiting = await this.waiting.getById(id)
    if (!waiting) throw new WaitingNotFoundError(id)
    return waiting
  }
}
