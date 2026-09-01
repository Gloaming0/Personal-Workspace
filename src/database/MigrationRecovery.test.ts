import Dexie, { type EntityTable } from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import type { Task } from '@/domain/entities'
import { createTask } from '@/domain/task'
import {
  DailyWorkDatabase,
  initializeLocalDatabase,
  taskStoreSchema,
} from './DailyWorkDatabase'

class Version1Database extends Dexie {
  tasks!: EntityTable<Task, 'id'>
  constructor(name: string) {
    super(name)
    this.version(1).stores({ tasks: taskStoreSchema })
  }
}

class FailedUpgradeDatabase extends Dexie {
  constructor(name: string) {
    super(name)
    this.version(1).stores({ tasks: taskStoreSchema })
    this.version(2)
      .stores({ tasks: taskStoreSchema })
      .upgrade(() => {
        throw new Error('injected migration failure')
      })
  }
}

let sequence = 0
describe('migration and connection recovery', () => {
  const connections: Array<{ close(): void }> = []
  let name = ''

  afterEach(async () => {
    connections.forEach((connection) => connection.close())
    if (name) await Dexie.delete(name)
  })

  it('aborts a failed upgrade and leaves the old database readable', async () => {
    name = `failed-upgrade-${++sequence}`
    const old = new Version1Database(name)
    connections.push(old)
    await old.open()
    const task = createTask(
      { userId: 'user-1', title: 'still here', plannedDate: '2026-08-25' },
      { id: 'task-before-failure', now: '2026-08-25T08:00:00.000Z' },
    )
    await old.tasks.add(task)
    old.close()

    const failed = new FailedUpgradeDatabase(name)
    connections.push(failed)
    await expect(failed.open()).rejects.toThrow('injected migration failure')
    failed.close()

    const reopened = new Version1Database(name)
    connections.push(reopened)
    await reopened.open()
    await expect(reopened.tasks.get(task.id)).resolves.toEqual(task)
  })

  it('reports blocked, then reaches ready after the old connection closes', async () => {
    name = `blocked-upgrade-${++sequence}`
    const seed = new Version1Database(name)
    connections.push(seed)
    await seed.open()
    seed.close()
    const old = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    old.onversionchange = () => undefined
    connections.push(old)

    const current = new DailyWorkDatabase(name)
    connections.push(current)
    const blocked = new Promise<void>((resolve) => {
      const unsubscribe = current.runtime.subscribe(() => {
        if (current.runtime.getSnapshot().status === 'blocked') {
          unsubscribe()
          resolve()
        }
      })
    })
    const opening = initializeLocalDatabase(current)
    await blocked
    expect(current.runtime.getSnapshot()).toMatchObject({
      status: 'blocked',
      errorCategory: 'blocked-upgrade',
      canRetry: true,
    })

    old.close()
    await opening
    expect(current.runtime.getSnapshot().status).toBe('ready')
  })

  it('closes an old managed connection safely on versionchange', async () => {
    name = `versionchange-${++sequence}`
    const current = new DailyWorkDatabase(name)
    connections.push(current)
    await initializeLocalDatabase(current)

    const future = new Dexie(name)
    connections.push(future)
    future.version(12).stores({ tasks: taskStoreSchema })
    await future.open()

    expect(current.isOpen()).toBe(false)
    expect(current.runtime.getSnapshot()).toMatchObject({
      status: 'recovery-required',
      errorCategory: 'versionchange',
      canRetry: true,
    })
  })
})
