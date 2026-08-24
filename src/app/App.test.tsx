import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import { PreferencesProvider } from '@/features/settings/preferences/PreferencesProvider'
import {
  getDefaultPreferences,
  preferencesStorageKey,
  usePreferencesStore,
} from '@/features/settings/preferences/preferencesStore'
import { themeOptions } from '@/features/settings/theme/types'

function renderApplication() {
  return render(
    <PreferencesProvider>
      <App />
    </PreferencesProvider>,
  )
}

describe('Daily Work OS application shell', () => {
  beforeEach(() => {
    window.localStorage.clear()
    usePreferencesStore.setState({
      ...getDefaultPreferences(),
      language: 'en',
    })
  })

  it('renders Today as the default workspace without enabling CRUD modules', () => {
    renderApplication()

    expect(
      screen.getByRole('heading', {
        name: 'Today',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Phase 1.1')).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Today focus' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Today tasks' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Waiting' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Inbox' })).toHaveLength(2)
    expect(
      screen
        .getAllByRole('button', { name: 'Inbox' })
        .every((item) => item.hasAttribute('disabled')),
    ).toBe(true)
    expect(
      screen.getByRole('complementary', { name: 'Utility panel' }),
    ).toBeInTheDocument()
  })

  it('exposes the extensible settings skeleton', async () => {
    const user = userEvent.setup()
    renderApplication()

    await user.click(screen.getByRole('button', { name: 'Settings' }))

    expect(
      screen.getByRole('heading', { name: 'Settings' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeEnabled()
    expect(screen.getByRole('combobox', { name: 'Theme' })).toBeEnabled()
    expect(screen.getByRole('combobox', { name: 'Density' })).toBeEnabled()
    expect(screen.getByRole('combobox', { name: 'Sidebar' })).toBeEnabled()
    expect(screen.getByText('Account')).toBeInTheDocument()
    expect(screen.getAllByText('Available in a later phase')).toHaveLength(4)
  })

  it('applies and persists preferences through the shared model', async () => {
    const user = userEvent.setup()
    renderApplication()

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Theme' }), [
      'forest',
    ])
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Density' }),
      ['compact'],
    )
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Language' }),
      ['zh-CN'],
    )

    expect(document.documentElement).toHaveAttribute('data-theme', 'forest')
    expect(document.documentElement).toHaveAttribute('data-density', 'compact')
    expect(document.documentElement).toHaveAttribute('lang', 'zh-CN')
    expect(screen.getByRole('heading', { name: '设置' })).toBeInTheDocument()

    const persistedPreferences = JSON.parse(
      window.localStorage.getItem(preferencesStorageKey) ?? '{}',
    ) as {
      state?: { density?: string; language?: string; theme?: string }
      version?: number
    }
    expect(persistedPreferences.version).toBe(1)
    expect(persistedPreferences.state).toMatchObject({
      density: 'compact',
      language: 'zh-CN',
      theme: 'forest',
    })
  })

  it('keeps collapsed navigation accessible', async () => {
    const user = userEvent.setup()
    renderApplication()

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }))

    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeEnabled()
  })

  it('applies every built-in named theme to the Today workspace', async () => {
    const user = userEvent.setup()
    renderApplication()
    await user.click(screen.getByRole('button', { name: 'Settings' }))
    const themeSelect = screen.getByRole('combobox', { name: 'Theme' })

    for (const theme of themeOptions) {
      if (theme.value === 'system') continue
      await user.selectOptions(themeSelect, theme.value)
      expect(document.documentElement).toHaveAttribute(
        'data-theme',
        theme.value,
      )
    }
  })
})
