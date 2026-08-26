import Dexie from 'dexie'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DailyWorkDatabase } from '@/database/DailyWorkDatabase'
import {
  LocalChangeCoordinator,
  type LocalChange,
} from '@/database/LocalChangeCoordinator'
import { createTask } from '@/domain/task'
import { createTaskRuntime } from '@/features/tasks/taskRuntime'
import {
  TaskTodayWorkspace,
  TodayWorkspaceProvider,
} from '@/features/today/TaskTodayWorkspace'
import { DexieBackupRepository } from './DexieBackupRepository'
import { createCompleteBackupData } from './testFixtures'

interface Envelope extends LocalChange {
  sourceId: string
}

class ChannelHub {
  private readonly listeners = new Set<
    (event: MessageEvent<Envelope>) => void
  >()

  create() {
    return {
      postMessage: (message: Envelope) =>
        this.listeners.forEach((listener) =>
          listener({
            data: structuredClone(message),
          } as MessageEvent<Envelope>),
        ),
      close: vi.fn(),
      addEventListener: (
        _type: 'message',
        listener: (event: MessageEvent<Envelope>) => void,
      ) => this.listeners.add(listener),
    }
  }
}

let sequence = 0
describe('Backup restore invalidation', () => {
  const databases: DailyWorkDatabase[] = []
  const coordinators: LocalChangeCoordinator[] = []
  let name = ''

  afterEach(async () => {
    coordinators.forEach((coordinator) => coordinator.close())
    databases.forEach((database) => database.close())
    if (name) await Dexie.delete(name)
  })

  it('refreshes Today and notifies another tab after atomic restore', async () => {
    name = `backup-invalidation-${++sequence}`
    const hub = new ChannelHub()
    const todayDatabase = new DailyWorkDatabase(name)
    const restoreDatabase = new DailyWorkDatabase(name)
    databases.push(todayDatabase, restoreDatabase)
    const todayChanges = new LocalChangeCoordinator(name, {
      sourceId: 'today-tab',
      channelFactory: () => hub.create(),
    })
    const restoreChanges = new LocalChangeCoordinator(name, {
      sourceId: 'settings-tab',
      channelFactory: () => hub.create(),
    })
    coordinators.push(todayChanges, restoreChanges)
    Object.defineProperty(todayDatabase, 'changes', { value: todayChanges })
    Object.defineProperty(restoreDatabase, 'changes', {
      value: restoreChanges,
    })
    await todayDatabase.open()
    const oldTask = createTask(
      {
        userId: 'local-user',
        title: 'Before restore',
        plannedDate: '2026-08-26',
      },
      {
        id: '00000000-0000-4000-8000-000000000098',
        now: '2026-08-25T07:00:00.000Z',
      },
    )
    await todayDatabase.tasks.add(oldTask)
    const runtime = createTaskRuntime(todayDatabase)
    const remoteInvalidation = vi.fn()
    todayChanges.subscribe(remoteInvalidation)
    render(
      <TodayWorkspaceProvider runtime={runtime}>
        <TaskTodayWorkspace />
      </TodayWorkspaceProvider>,
    )
    expect(await screen.findByText('Before restore')).toBeInTheDocument()

    await new DexieBackupRepository(restoreDatabase).replaceAll(
      'local-user',
      createCompleteBackupData(),
    )

    expect(await screen.findByText('完成提案 ✓ Привет')).toBeInTheDocument()
    await waitFor(() => expect(remoteInvalidation).toHaveBeenCalledTimes(7))
    expect(screen.queryByText('Before restore')).not.toBeInTheDocument()
  })
})
