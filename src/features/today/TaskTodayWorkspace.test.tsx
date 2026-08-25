import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { InMemoryTaskRepository } from '@/repositories/inMemory/InMemoryTaskRepository'
import { InMemoryWaitingRepository } from '@/repositories/inMemory/InMemoryWaitingRepository'
import { InMemoryMemoRepository } from '@/repositories/inMemory/InMemoryMemoRepository'
import { InMemoryRoutineRepository } from '@/repositories/inMemory/InMemoryRoutineRepository'
import { InMemoryRoutineLogRepository } from '@/repositories/inMemory/InMemoryRoutineLogRepository'
import { InMemoryActivityRepository } from '@/repositories/inMemory/InMemoryActivityRepository'
import { TaskService } from '@/features/tasks/TaskService'
import { WaitingService } from '@/features/waiting/WaitingService'
import { MemoService } from '@/features/memos/MemoService'
import { RoutineService } from '@/features/routines/RoutineService'
import { ActivityService } from '@/features/activity/ActivityService'
import type { TaskRuntime } from '@/features/tasks/taskRuntime'
import {
  getDefaultPreferences,
  usePreferencesStore,
} from '@/features/settings/preferences/preferencesStore'
import { TaskTodayWorkspace } from './TaskTodayWorkspace'

describe('Task Today UI boundary', () => {
  function supportingRuntime() {
    const memoRepository = new InMemoryMemoRepository()
    const routineRepository = new InMemoryRoutineRepository()
    const routineLogRepository = new InMemoryRoutineLogRepository()
    const activityRepository = new InMemoryActivityRepository()
    return {
      memoRepository,
      memoService: new MemoService(memoRepository),
      routineRepository,
      routineLogRepository,
      routineService: new RoutineService(
        routineRepository,
        routineLogRepository,
      ),
      activityRepository,
      activityService: new ActivityService(activityRepository),
    }
  }
  beforeEach(() => {
    usePreferencesStore.setState({
      ...getDefaultPreferences(),
      language: 'en',
    })
  })

  it('keeps user-authored content unchanged when UI language changes', async () => {
    const user = userEvent.setup()
    const repository = new InMemoryTaskRepository()
    const waitingRepository = new InMemoryWaitingRepository()
    const runtime: TaskRuntime = {
      repository,
      service: new TaskService(repository, {
        createId: () => 'task-user-input',
        now: () => '2026-08-24T10:00:00.000Z',
      }),
      waitingRepository,
      waitingService: new WaitingService(waitingRepository),
      ...supportingRuntime(),
      ready: Promise.resolve(),
    }
    render(<TaskTodayWorkspace runtime={runtime} />)
    await waitFor(() =>
      expect(
        screen.queryByLabelText('Loading workspace'),
      ).not.toBeInTheDocument(),
    )

    await user.type(
      screen.getByRole('textbox', { name: 'Quick task' }),
      '用户输入 User text',
    )
    await user.click(screen.getByRole('button', { name: 'Add task' }))
    expect(await screen.findByText('用户输入 User text')).toBeInTheDocument()

    usePreferencesStore.setState({ language: 'zh-CN' })
    expect(
      await screen.findByRole('textbox', { name: '快速任务' }),
    ).toBeInTheDocument()
    expect(screen.getByText('用户输入 User text')).toBeInTheDocument()
  })

  it('keeps Waiting user content and Task origin unchanged across UI languages', async () => {
    const user = userEvent.setup()
    const repository = new InMemoryTaskRepository()
    const waitingRepository = new InMemoryWaitingRepository()
    const runtime: TaskRuntime = {
      repository,
      service: new TaskService(repository),
      waitingRepository,
      waitingService: new WaitingService(waitingRepository, {
        createId: () => 'waiting-user-input',
        now: () => '2026-08-24T10:00:00.000Z',
      }),
      ...supportingRuntime(),
      ready: Promise.resolve(),
    }
    render(<TaskTodayWorkspace runtime={runtime} />)
    await waitFor(() =>
      expect(
        screen.queryByLabelText('Loading workspace'),
      ).not.toBeInTheDocument(),
    )

    await user.type(
      screen.getByRole('textbox', { name: 'Waiting title' }),
      '等待 API approval',
    )
    await user.type(
      screen.getByRole('textbox', { name: 'Source task ID' }),
      'task-origin-123',
    )
    await user.click(screen.getByRole('button', { name: 'Add waiting' }))
    expect(await screen.findByText('等待 API approval')).toBeInTheDocument()

    usePreferencesStore.setState({ language: 'zh-CN' })
    expect(
      await screen.findByRole('textbox', { name: '等待事项标题' }),
    ).toBeInTheDocument()
    expect(screen.getByText('等待 API approval')).toBeInTheDocument()
    await expect(
      waitingRepository.getById('waiting-user-input'),
    ).resolves.toMatchObject({ sourceTaskId: 'task-origin-123' })
  })

  it('keeps Memo and Routine user text unchanged across UI languages', async () => {
    const user = userEvent.setup()
    const repository = new InMemoryTaskRepository()
    const waitingRepository = new InMemoryWaitingRepository()
    const memoRepository = new InMemoryMemoRepository()
    const routineRepository = new InMemoryRoutineRepository()
    const routineLogRepository = new InMemoryRoutineLogRepository()
    const activityRepository = new InMemoryActivityRepository()
    const runtime: TaskRuntime = {
      repository,
      service: new TaskService(repository),
      waitingRepository,
      waitingService: new WaitingService(waitingRepository),
      memoRepository,
      memoService: new MemoService(memoRepository, {
        createId: () => 'memo-user-input',
        now: () => '2026-08-25T10:00:00.000Z',
      }),
      routineRepository,
      routineLogRepository,
      routineService: new RoutineService(
        routineRepository,
        routineLogRepository,
        {
          createId: () => 'routine-user-input',
          now: () => '2026-08-25T10:00:00.000Z',
        },
      ),
      activityRepository,
      activityService: new ActivityService(activityRepository),
      ready: Promise.resolve(),
    }
    render(<TaskTodayWorkspace runtime={runtime} />)
    await waitFor(() =>
      expect(
        screen.queryByLabelText('Loading workspace'),
      ).not.toBeInTheDocument(),
    )

    await user.type(
      screen.getByRole('textbox', { name: 'Memo content' }),
      '原始 Memo content',
    )
    await user.click(screen.getByRole('button', { name: 'Add memo' }))
    await user.type(
      screen.getByRole('textbox', { name: 'Routine title' }),
      '每日 Review 检查',
    )
    await user.click(screen.getByRole('button', { name: 'Add routine' }))
    expect(await screen.findByText('原始 Memo content')).toBeInTheDocument()
    expect(await screen.findByText('每日 Review 检查')).toBeInTheDocument()

    usePreferencesStore.setState({ language: 'zh-CN' })
    expect(
      await screen.findByRole('textbox', { name: '便笺内容' }),
    ).toBeInTheDocument()
    expect(screen.getByText('原始 Memo content')).toBeInTheDocument()
    expect(screen.getByText('每日 Review 检查')).toBeInTheDocument()
  })
})
