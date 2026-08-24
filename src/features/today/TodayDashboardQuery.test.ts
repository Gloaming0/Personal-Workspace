import { describe, expect, it } from 'vitest'
import { InMemoryTaskRepository } from '@/repositories/inMemory/InMemoryTaskRepository'
import { InMemoryWaitingRepository } from '@/repositories/inMemory/InMemoryWaitingRepository'
import { TaskService } from '@/features/tasks/TaskService'
import { DefaultTodayDashboardQuery } from './TodayDashboardQuery'
import { DefaultTodayDashboardViewModelAssembler } from './TodayDashboardViewModelAssembler'
import { MockTodaySupportingViewModelSource } from './MockTodaySupportingViewModelSource'
import { MockTodayProjectNameResolver } from './MockTodayProjectNameResolver'

describe('TodayDashboardQuery aggregation', () => {
  it('projects repository Tasks while retaining only unfinished supporting mocks', async () => {
    const repository = new InMemoryTaskRepository()
    let id = 0
    const service = new TaskService(repository, {
      createId: () => `task-${++id}`,
      now: () => '2026-08-24T09:00:00.000Z',
    })
    const first = await service.create({
      userId: 'user-1',
      title: 'User-authored task',
      plannedDate: '2026-08-24',
      priority: 'P1',
    })
    await service.setFocus(first.id, '2026-08-24')
    const completed = await service.create({
      userId: 'user-1',
      title: 'Completed task',
      plannedDate: '2026-08-24',
    })
    await service.complete(completed.id)
    await service.create({
      userId: 'user-1',
      title: 'Tomorrow task',
      plannedDate: '2026-08-25',
    })

    const query = new DefaultTodayDashboardQuery({
      tasks: repository,
      waiting: new InMemoryWaitingRepository(),
      projectNames: new MockTodayProjectNameResolver(),
      supportingData: new MockTodaySupportingViewModelSource('zh-CN'),
      assembler: new DefaultTodayDashboardViewModelAssembler(),
    })
    const result = await query.execute({
      date: '2026-08-24',
      timezone: 'Asia/Shanghai',
    })

    expect(result.tasks.map((task) => task.title)).toEqual([
      'User-authored task',
      'Completed task',
    ])
    expect(result.focus).toHaveLength(1)
    expect(result.focus[0]?.taskId).toBe(first.id)
    expect(result.summary.openTaskCount).toBe(1)
    expect(result.waiting).toHaveLength(0)
    expect(result.checkIns).not.toHaveLength(0)
  })
})
