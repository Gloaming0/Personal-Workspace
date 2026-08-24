import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { InMemoryTaskRepository } from '@/repositories/inMemory/InMemoryTaskRepository'
import { TaskService } from '@/features/tasks/TaskService'
import type { TaskRuntime } from '@/features/tasks/taskRuntime'
import {
  getDefaultPreferences,
  usePreferencesStore,
} from '@/features/settings/preferences/preferencesStore'
import { TaskTodayWorkspace } from './TaskTodayWorkspace'

describe('Task Today UI boundary', () => {
  beforeEach(() => {
    usePreferencesStore.setState({
      ...getDefaultPreferences(),
      language: 'en',
    })
  })

  it('keeps user-authored content unchanged when UI language changes', async () => {
    const user = userEvent.setup()
    const repository = new InMemoryTaskRepository()
    const runtime: TaskRuntime = {
      repository,
      service: new TaskService(repository, {
        createId: () => 'task-user-input',
        now: () => '2026-08-24T10:00:00.000Z',
      }),
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
})
