import { beforeEach, describe, expect, it } from 'vitest'
import { deriveNeedsFollowUp } from '@/domain/waiting'
import { InMemoryWaitingRepository } from '@/repositories/inMemory/InMemoryWaitingRepository'
import { WaitingService } from './WaitingService'

describe('Waiting vertical slice domain rules', () => {
  let repository: InMemoryWaitingRepository
  let service: WaitingService
  let timeSequence: number

  beforeEach(() => {
    repository = new InMemoryWaitingRepository()
    timeSequence = 0
    service = new WaitingService(repository, {
      createId: () => 'waiting-1',
      now: () => `2026-08-24T10:00:0${timeSequence++}.000Z`,
    })
  })

  it('creates and edits raw Waiting fields while preserving Task origin', async () => {
    const created = await service.create({
      userId: 'user-1',
      title: '  API approval  ',
      person: '  Mina  ',
      followUpDate: '2026-08-24',
      sourceTaskId: 'task-source',
    })
    expect(created).toMatchObject({
      title: 'API approval',
      person: 'Mina',
      status: 'waiting',
      sourceTaskId: 'task-source',
      confirmedAt: null,
      closedAt: null,
      version: 1,
    })

    const edited = await service.edit(created.id, {
      title: 'API approval updated',
      notes: 'Bring the final spec',
      person: 'Alex',
    })
    expect(edited).toMatchObject({
      title: 'API approval updated',
      notes: 'Bring the final spec',
      person: 'Alex',
      sourceTaskId: 'task-source',
      version: 2,
    })
  })

  it('writes lifecycle timestamps and clears them on reopen', async () => {
    const created = await service.create({
      userId: 'user-1',
      title: 'Lifecycle',
    })
    const confirmed = await service.confirm(created.id)
    expect(confirmed).toMatchObject({
      status: 'confirmed',
      confirmedAt: confirmed.updatedAt,
      closedAt: null,
      version: 2,
    })

    const closed = await service.close(created.id)
    expect(closed).toMatchObject({
      status: 'closed',
      confirmedAt: confirmed.confirmedAt,
      closedAt: closed.updatedAt,
      version: 3,
    })

    const reopened = await service.reopen(created.id)
    expect(reopened).toMatchObject({
      status: 'waiting',
      confirmedAt: null,
      closedAt: null,
      version: 4,
    })
  })

  it('sets follow-up dates and derives attention only for due waiting items', async () => {
    const created = await service.create({
      userId: 'user-1',
      title: 'Follow-up',
    })
    const due = await service.setFollowUpDate(created.id, '2026-08-24')
    expect(due).toMatchObject({ followUpDate: '2026-08-24', version: 2 })
    expect(deriveNeedsFollowUp(due, '2026-08-24')).toBe(true)
    expect(deriveNeedsFollowUp(due, '2026-08-23')).toBe(false)

    const confirmed = await service.confirm(created.id)
    expect(deriveNeedsFollowUp(confirmed, '2026-08-25')).toBe(false)
  })
})
