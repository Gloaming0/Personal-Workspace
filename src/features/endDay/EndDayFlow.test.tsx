import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createTask } from '@/domain/task'
import {
  getDefaultPreferences,
  usePreferencesStore,
} from '@/features/settings/preferences/preferencesStore'
import { EndDayFlow } from './EndDayFlow'

describe('End Day responsive flow contract', () => {
  it('walks through overview, unfinished actions, summary, and finalize with raw user text', async () => {
    usePreferencesStore.setState({
      ...getDefaultPreferences(),
      language: 'zh-CN',
    })
    const user = userEvent.setup()
    const task = createTask(
      { userId: 'user-1', title: '原始 Task title', plannedDate: '2026-08-25' },
      { id: 'task-1', now: '2026-08-25T08:00:00.000Z' },
    )
    const finalize = vi.fn().mockResolvedValue(undefined)
    const close = vi.fn()
    render(
      <EndDayFlow
        onClose={close}
        onLoad={async () => ({
          userId: 'user-1',
          date: '2026-08-25',
          timezone: 'Asia/Shanghai',
          completedTasks: [],
          openTasks: [task],
          waiting: [],
          memos: [],
          routines: [],
          routineLogs: [],
          projectNames: new Map(),
          finalizedLog: null,
        })}
        onFinalize={finalize}
      />,
    )
    await screen.findByText('今日概览')
    expect(screen.queryByText('原始 Task title')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByText('原始 Task title')).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox'), 'tomorrow')
    await user.click(screen.getByRole('button', { name: '下一步' }))
    await user.type(
      screen.getByLabelText('今天过得怎么样？（可选）'),
      '原始总结',
    )
    await user.click(screen.getByRole('button', { name: '下一步' }))
    await user.click(screen.getByRole('button', { name: '完成今日记录' }))
    expect(finalize).toHaveBeenCalledWith('原始总结', { 'task-1': 'tomorrow' })
    expect(close).toHaveBeenCalled()
  })
})
