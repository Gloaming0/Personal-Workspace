import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WaitingWidget } from './WaitingWidget'
import {
  getDefaultPreferences,
  usePreferencesStore,
} from '@/features/settings/preferences/preferencesStore'

describe('Waiting Widget date input', () => {
  it('persists a follow-up value delivered through the native input event', async () => {
    usePreferencesStore.setState({ ...getDefaultPreferences(), language: 'en' })
    const user = userEvent.setup()
    const onEdit = vi.fn().mockResolvedValue(undefined)
    render(
      <WaitingWidget
        items={[
          {
            waitingId: 'waiting-1',
            title: 'Approval',
            person: 'Alex',
            notes: null,
            status: 'waiting',
            projectName: null,
            sourceTaskId: null,
            followUpDate: null,
            daysWaiting: 1,
            needsFollowUp: false,
          },
        ]}
        onEdit={onEdit}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.input(screen.getByLabelText('Follow-up date'), {
      target: { value: '2026-08-26' },
    })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onEdit).toHaveBeenCalledWith(
      'waiting-1',
      expect.objectContaining({ followUpDate: '2026-08-26' }),
    )
  })
})
