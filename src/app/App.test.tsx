import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import { PreferencesProvider } from '@/features/settings/preferences/PreferencesProvider'
import {
  preferencesStorageKey,
  usePreferencesStore,
} from '@/features/settings/preferences/preferencesStore'

describe('Phase 0 application foundation', () => {
  beforeEach(() => {
    window.localStorage.clear()
    usePreferencesStore.setState({ language: 'en', theme: 'system' })
  })

  it('describes the current project phase', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', {
        name: 'Your personal work desk is taking shape.',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Phase 0 · Project foundation')).toBeInTheDocument()
  })

  it('switches and applies a named theme', async () => {
    const user = userEvent.setup()
    render(
      <PreferencesProvider>
        <App />
      </PreferencesProvider>,
    )

    await user.selectOptions(screen.getByRole('combobox', { name: 'Theme' }), [
      'forest',
    ])

    expect(document.documentElement).toHaveAttribute('data-theme', 'forest')
  })

  it('switches to Chinese and persists the language preference', async () => {
    const user = userEvent.setup()
    render(
      <PreferencesProvider>
        <App />
      </PreferencesProvider>,
    )

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Language' }),
      ['zh-CN'],
    )

    expect(
      screen.getByRole('heading', { name: '你的个人工作台正在成形。' }),
    ).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('lang', 'zh-CN')

    const persistedPreferences = JSON.parse(
      window.localStorage.getItem(preferencesStorageKey) ?? '{}',
    ) as { state?: { language?: string } }
    expect(persistedPreferences.state?.language).toBe('zh-CN')
  })
})
