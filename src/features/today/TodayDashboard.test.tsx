import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useState } from 'react'
import { TodayDashboard } from './TodayDashboard'
import { TodayUtilityWidgets } from './TodayUtilityWidgets'
import { emptyTodayDashboardMock, todayDashboardMock } from './mockData'
import {
  getDefaultPreferences,
  usePreferencesStore,
} from '@/features/settings/preferences/preferencesStore'

describe('Today Dashboard presentation', () => {
  beforeEach(() => {
    usePreferencesStore.setState({
      ...getDefaultPreferences(),
      language: 'en',
    })
  })

  it('renders the complete mock workspace with at most three focus items', () => {
    render(
      <>
        <TodayDashboard data={todayDashboardMock} />
        <TodayUtilityWidgets data={todayDashboardMock} />
      </>,
    )

    const focus = screen.getByRole('region', { name: 'Today focus' })
    expect(within(focus).getAllByRole('listitem')).toHaveLength(3)
    expect(
      screen.getByRole('region', { name: 'Today tasks' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Waiting' })).toBeInTheDocument()
    expect(
      screen.getAllByRole('region', { name: 'Daily check-in' }),
    ).toHaveLength(2)
    expect(screen.getAllByRole('region', { name: 'Quick memo' })).toHaveLength(
      2,
    )
    expect(
      screen.getByRole('region', { name: 'Recent activity' }),
    ).toBeInTheDocument()
    expect(
      screen
        .getAllByRole('checkbox')
        .every((item) => item.hasAttribute('disabled')),
    ).toBe(true)
  })

  it('supports guided empty states for every widget', () => {
    render(
      <>
        <TodayDashboard data={emptyTodayDashboardMock} status="empty" />
        <TodayUtilityWidgets data={emptyTodayDashboardMock} status="empty" />
      </>,
    )

    expect(screen.getByText('Choose your focus for today.')).toBeInTheDocument()
    expect(screen.getByText('The desk is clear.')).toBeInTheDocument()
    expect(screen.getByText('Nothing waiting.')).toBeInTheDocument()
    expect(screen.getAllByText('No check-ins today.')).toHaveLength(2)
    expect(screen.getAllByText('A clear note space.')).toHaveLength(2)
    expect(screen.getByText('A quiet start.')).toBeInTheDocument()
  })

  it('supports lightweight loading states without a full-screen blocker', () => {
    render(
      <>
        <TodayDashboard status="loading" />
        <TodayUtilityWidgets status="loading" />
      </>,
    )

    expect(
      screen.getAllByRole('status', { name: 'Loading workspace' }),
    ).toHaveLength(8)
  })

  it('localizes mock content and labels in Chinese', () => {
    usePreferencesStore.setState({ language: 'zh-CN' })
    render(<TodayDashboard />)

    expect(screen.getByRole('heading', { name: '今日' })).toBeInTheDocument()
    expect(screen.getByText('完成活动方案')).toBeInTheDocument()
    expect(screen.getByText('检查玩家留存数据')).toBeInTheDocument()
  })

  it('distinguishes unavailable storage from Empty State and recovers on Retry', async () => {
    function RecoveryHarness() {
      const [ready, setReady] = useState(false)
      return (
        <TodayDashboard
          data={todayDashboardMock}
          databaseState={{
            status: ready ? 'ready' : 'unavailable',
            errorCategory: ready ? null : 'open-failure',
            canRetry: !ready,
          }}
          onRetryDatabase={async () => setReady(true)}
        />
      )
    }

    render(<RecoveryHarness />)
    expect(
      screen.getByRole('heading', {
        name: 'Your local workspace is unavailable.',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText('The desk is clear.')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('region', { name: 'Today tasks' }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry local storage' }))
    expect(
      await screen.findByRole('region', { name: 'Today tasks' }),
    ).toBeInTheDocument()
  })
})
