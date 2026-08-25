import { describe, expect, it } from 'vitest'
import { InMemoryMemoRepository } from '@/repositories/inMemory/InMemoryMemoRepository'
import { MemoService } from './MemoService'

describe('MemoService', () => {
  it('creates, edits, pins, unpins, and soft deletes with versions', async () => {
    const repository = new InMemoryMemoRepository()
    let tick = 0
    const service = new MemoService(repository, {
      createId: () => 'memo-1',
      now: () => `2026-08-24T10:00:0${tick++}.000Z`,
    })

    const created = await service.create({
      userId: 'user-1',
      content: ' 用户原文 Memo text ',
      projectId: 'project-1',
    })
    expect(created).toMatchObject({
      content: '用户原文 Memo text',
      projectId: 'project-1',
      pinned: false,
      version: 1,
    })

    await expect(
      service.edit('user-1', created.id, { content: 'Edited memo' }),
    ).resolves.toMatchObject({ content: 'Edited memo', version: 2 })
    await expect(service.pin('user-1', created.id)).resolves.toMatchObject({
      pinned: true,
      version: 3,
    })
    await expect(service.unpin('user-1', created.id)).resolves.toMatchObject({
      pinned: false,
      version: 4,
    })
    const deleted = await service.delete('user-1', created.id)
    expect(deleted).toMatchObject({ version: 5 })
    expect(deleted.deletedAt).not.toBeNull()
    await expect(repository.getById('user-1', created.id)).resolves.toBeNull()
    await expect(repository.find('user-1', {})).resolves.toEqual([])
  })
})
