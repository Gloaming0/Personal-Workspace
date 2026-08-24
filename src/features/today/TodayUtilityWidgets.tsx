import { DailyCheckInWidget } from './components/DailyCheckInWidget'
import { QuickMemoWidget } from './components/QuickMemoWidget'
import { RecentActivityWidget } from './components/RecentActivityWidget'
import { createTodayDashboardMock } from './mockData'
import type { TodayDashboardViewModel, TodayWidgetStatus } from './viewModel'
import { useTranslations } from '@/features/settings/language/useTranslations'

interface TodayUtilityWidgetsProps {
  data?: TodayDashboardViewModel
  status?: TodayWidgetStatus
}

export function TodayUtilityWidgets({
  data,
  status = 'ready',
}: TodayUtilityWidgetsProps) {
  const { language } = useTranslations()
  const viewModel = data ?? createTodayDashboardMock(language)

  return (
    <div className="today-utility-widgets">
      <div className="today-utility-primary-widgets">
        <DailyCheckInWidget items={viewModel.checkIns} status={status} />
        <QuickMemoWidget memo={viewModel.quickMemo} status={status} />
      </div>
      <RecentActivityWidget items={viewModel.recentActivity} status={status} />
    </div>
  )
}
