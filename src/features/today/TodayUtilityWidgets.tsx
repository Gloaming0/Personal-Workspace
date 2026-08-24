import { DailyCheckInWidget } from './components/DailyCheckInWidget'
import { QuickMemoWidget } from './components/QuickMemoWidget'
import { RecentActivityWidget } from './components/RecentActivityWidget'
import { todayDashboardMock } from './mockData'
import type { DashboardStatus, TodayDashboardData } from './types'

interface TodayUtilityWidgetsProps {
  data?: TodayDashboardData
  status?: DashboardStatus
}

export function TodayUtilityWidgets({
  data = todayDashboardMock,
  status = 'ready',
}: TodayUtilityWidgetsProps) {
  return (
    <div className="today-utility-widgets">
      <DailyCheckInWidget items={data.checkIns} status={status} />
      <QuickMemoWidget memo={data.memo} status={status} />
      <RecentActivityWidget items={data.activity} status={status} />
    </div>
  )
}
