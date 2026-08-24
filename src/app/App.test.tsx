import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from './App'
import { ThemeProvider } from '@/features/settings/theme/ThemeProvider'
import { useThemeStore } from '@/features/settings/theme/themeStore'

describe('Phase 0 application foundation', () => {
  beforeEach(() => {
    window.localStorage.clear()
    useThemeStore.setState({ theme: 'system' })
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
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    )

    await user.selectOptions(screen.getByRole('combobox', { name: 'Theme' }), [
      'forest',
    ])

    expect(document.documentElement).toHaveAttribute('data-theme', 'forest')
  })
})
