import { DailyCheckInWidget } from './components/DailyCheckInWidget'
import { QuickMemoWidget } from './components/QuickMemoWidget'
import { RecentActivityWidget } from './components/RecentActivityWidget'
import { createTodayDashboardMock } from './mockData'
import type { TodayDashboardViewModel, TodayWidgetStatus } from './viewModel'
import { useTranslations } from '@/features/settings/language/useTranslations'
import { useOptionalTodayWorkspace } from './TaskTodayWorkspace'

interface TodayUtilityWidgetsProps {
  data?: TodayDashboardViewModel
  status?: TodayWidgetStatus
}

export function TodayUtilityWidgets({
  data,
  status = 'ready',
}: TodayUtilityWidgetsProps) {
  const { language } = useTranslations()
  const workspace = useOptionalTodayWorkspace()
  const viewModel =
    data ?? workspace?.data ?? createTodayDashboardMock(language)
  const widgetStatus = data ? status : (workspace?.status ?? status)

  return (
    <div className="today-utility-widgets">
      <div className="today-utility-primary-widgets">
        <DailyCheckInWidget
          items={viewModel.checkIns}
          status={widgetStatus}
          actionError={workspace?.routineActionError}
          onCreate={workspace?.onCreateRoutine}
          onToggle={workspace?.onToggleRoutine}
          onPause={workspace?.onPauseRoutine}
          onArchive={workspace?.onArchiveRoutine}
        />
        <QuickMemoWidget
          memo={viewModel.quickMemo}
          status={widgetStatus}
          actionError={workspace?.memoActionError}
          onCreate={workspace?.onCreateMemo}
          onEdit={workspace?.onEditMemo}
          onDelete={workspace?.onDeleteMemo}
          onTogglePin={workspace?.onToggleMemoPin}
        />
      </div>
      <RecentActivityWidget
        items={viewModel.recentActivity}
        status={widgetStatus}
      />
    </div>
  )
}
