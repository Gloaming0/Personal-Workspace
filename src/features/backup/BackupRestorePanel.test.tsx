import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getDefaultPreferences,
  usePreferencesStore,
} from '@/features/settings/preferences/preferencesStore'
import type { BackupRepository } from './contracts'
import { BackupService } from './BackupService'
import { BackupRestorePanel } from './BackupRestorePanel'
import type { BrowserBackupFileGateway } from './BrowserBackupFileGateway'
import { createCompleteBackupData } from './testFixtures'

function fileWithText(json: string) {
  const file = new File([json], 'backup.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', { value: async () => json })
  return file
}

describe('Backup & Restore Settings UX', () => {
  beforeEach(() => {
    localStorage.clear()
    usePreferencesStore.setState({
      ...getDefaultPreferences(),
      language: 'en',
    })
  })

  it('validates, summarizes, and requires two explicit restore actions', async () => {
    const user = userEvent.setup()
    const data = createCompleteBackupData()
    const repository: BackupRepository = {
      readAll: vi.fn(async () => structuredClone(data)),
      replaceAll: vi.fn(async () => undefined),
    }
    const service = new BackupService(repository, {
      now: () => '2026-08-25T10:00:00.000Z',
    })
    const prepared = await service.createBackup('local-user', 'UTC')
    const gateway = {
      download: vi.fn(),
      save: vi.fn(async () => undefined),
    } as unknown as BrowserBackupFileGateway
    render(
      <BackupRestorePanel
        runtime={{ service, ready: Promise.resolve() }}
        fileGateway={gateway}
        timezone="UTC"
      />,
    )

    fireEvent.change(screen.getByLabelText('Select backup file'), {
      target: { files: [fileWithText(prepared.json)] },
    })
    expect(await screen.findByText('Backup is valid')).toBeInTheDocument()
    expect(screen.getByText('2', { selector: 'dd' })).toBeInTheDocument()
    expect(repository.replaceAll).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole('button', { name: 'Continue to restore' }),
    )
    expect(screen.getByText('Replace current local data?')).toBeInTheDocument()
    expect(repository.replaceAll).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole('button', { name: 'Confirm and replace' }),
    )
    await waitFor(() => expect(repository.replaceAll).toHaveBeenCalledTimes(1))
    expect(gateway.save).toHaveBeenCalledTimes(1)
    expect(
      await screen.findByText(
        'Backup restored successfully. Local views are refreshing.',
      ),
    ).toBeInTheDocument()
  })

  it('exports UTF-8 JSON and records the last successful export only after download', async () => {
    const user = userEvent.setup()
    const service = new BackupService(
      {
        readAll: vi.fn(async () => createCompleteBackupData()),
        replaceAll: vi.fn(),
      },
      { now: () => '2026-08-25T10:00:00.000Z' },
    )
    const gateway = {
      download: vi.fn(),
      save: vi.fn(),
    } as unknown as BrowserBackupFileGateway
    render(
      <BackupRestorePanel
        runtime={{ service, ready: Promise.resolve() }}
        fileGateway={gateway}
        timezone="Asia/Shanghai"
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Export backup' }))

    await waitFor(() => expect(gateway.download).toHaveBeenCalledTimes(1))
    expect(gateway.download).toHaveBeenCalledWith(
      expect.stringContaining('备忘：明天继续 🌙'),
      'daily-work-os-backup-2026-08-25.json',
    )
    expect(
      localStorage.getItem('daily-work-os:last-successful-backup-export'),
    ).toBe('2026-08-25T10:00:00.000Z')
  })

  it('shows safe validation errors and never begins restore', async () => {
    const repository: BackupRepository = {
      readAll: vi.fn(async () => createCompleteBackupData()),
      replaceAll: vi.fn(),
    }
    const gateway = {
      download: vi.fn(),
      save: vi.fn(),
    } as unknown as BrowserBackupFileGateway
    render(
      <BackupRestorePanel
        runtime={{
          service: new BackupService(repository),
          ready: Promise.resolve(),
        }}
        fileGateway={gateway}
      />,
    )

    fireEvent.change(screen.getByLabelText('Select backup file'), {
      target: { files: [fileWithText('{bad json')] },
    })

    expect(
      await screen.findByText(
        'This file is not a valid Daily Work OS backup. No data was changed.',
      ),
    ).toBeInTheDocument()
    expect(repository.replaceAll).not.toHaveBeenCalled()
    expect(gateway.save).not.toHaveBeenCalled()
  })
})
