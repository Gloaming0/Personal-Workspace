import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createTask } from '@/domain/task'
import {
  getDefaultPreferences,
  usePreferencesStore,
} from '@/features/settings/preferences/preferencesStore'
import { MorningReviewFlow } from './MorningReviewFlow'

describe('Morning Review UI', () => {
  it('supports bilingual raw content, touch-sized actions, Move All, and keyboard Skip', async () => {
    usePreferencesStore.setState({
      ...getDefaultPreferences(),
      language: 'zh-CN',
    })
    const user = userEvent.setup()
    const skip = vi.fn().mockResolvedValue(undefined)
    const moveAll = vi.fn().mockResolvedValue(undefined)
    const apply = vi.fn().mockResolvedValue(undefined)
    render(
      <MorningReviewFlow
        data={{
          userId: 'user-1',
          date: '2026-08-25',
          previousDate: '2026-08-24',
          timezone: 'Asia/Shanghai',
          tasks: [
            createTask(
              {
                userId: 'user-1',
                title: '原始 Carry-over',
                plannedDate: '2026-08-24',
              },
              { id: 'task-1', now: '2026-08-24T08:00:00.000Z' },
            ),
          ],
        }}
        onApply={apply}
        onMoveAll={moveAll}
        onSkip={skip}
      />,
    )
    expect(screen.getByText('原始 Carry-over')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '移到今天' }))
    expect(apply).toHaveBeenCalledWith('task-1', 'today')
    await user.click(screen.getByRole('button', { name: '全部移到今天' }))
    expect(moveAll).toHaveBeenCalled()
    usePreferencesStore.setState({ language: 'en' })
    expect(
      await screen.findByRole('heading', { name: 'Morning review' }),
    ).toBeInTheDocument()
    expect(screen.getByText('原始 Carry-over')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(skip).toHaveBeenCalled()
  })

  it('keeps Skip available when an action fails', async () => {
    usePreferencesStore.setState({
      ...getDefaultPreferences(),
      language: 'en',
    })
    const user = userEvent.setup()
    const skip = vi.fn().mockResolvedValue(undefined)
    render(
      <MorningReviewFlow
        data={{
          userId: 'user-1',
          date: '2026-08-25',
          previousDate: '2026-08-24',
          timezone: 'UTC',
          tasks: [
            createTask(
              {
                userId: 'user-1',
                title: 'Retry task',
                plannedDate: '2026-08-24',
              },
              { id: 'task-1', now: '2026-08-24T08:00:00.000Z' },
            ),
          ],
        }}
        onApply={vi.fn().mockRejectedValue(new Error('failed'))}
        onMoveAll={vi.fn().mockRejectedValue(new Error('failed'))}
        onSkip={skip}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Move to today' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That action failed',
    )
    expect(screen.getByRole('button', { name: 'Skip' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Skip' }))
    expect(skip).toHaveBeenCalled()
  })
})
