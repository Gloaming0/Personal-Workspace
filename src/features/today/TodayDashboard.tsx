import { format, parseISO } from 'date-fns'
import { enUS, zhCN } from 'date-fns/locale'
import { FocusWidget } from './components/FocusWidget'
import { TodayTasksWidget } from './components/TodayTasksWidget'
import { WaitingWidget } from './components/WaitingWidget'
import { DailyCheckInWidget } from './components/DailyCheckInWidget'
import { QuickMemoWidget } from './components/QuickMemoWidget'
import { createTodayDashboardMock } from './mockData'
import type { TodayDashboardViewModel, TodayWidgetStatus } from './viewModel'
import { useTranslations } from '@/features/settings/language/useTranslations'

interface TodayDashboardProps {
  data?: TodayDashboardViewModel
  status?: TodayWidgetStatus
}

export function TodayDashboard({
  data,
  status = 'ready',
}: TodayDashboardProps) {
  const { language, t } = useTranslations()
  const viewModel = data ?? createTodayDashboardMock(language)
  const date = format(
    parseISO(viewModel.date),
    language === 'zh-CN' ? 'M月d日 EEEE' : 'EEEE · MMMM d',
    { locale: language === 'zh-CN' ? zhCN : enUS },
  )

  return (
    <div className="today-dashboard">
      <header className="today-header">
        <div>
          <p className="eyebrow">{date}</p>
          <h1>{t('today.title')}</h1>
          <p>{t('today.greeting')}</p>
        </div>
        <dl className="today-summary" aria-label={t('today.summary')}>
          <div>
            <dt>{t('today.tasksStat')}</dt>
            <dd>{viewModel.summary.openTaskCount}</dd>
          </div>
          <div>
            <dt>{t('today.waitingStat')}</dt>
            <dd>{viewModel.summary.waitingCount}</dd>
          </div>
          <div>
            <dt>{t('today.checkInsStat')}</dt>
            <dd>
              {viewModel.summary.completedCheckInCount}/
              {viewModel.summary.totalCheckInCount}
            </dd>
          </div>
        </dl>
      </header>

      <div className="today-workspace-grid">
        <FocusWidget items={viewModel.focus} status={status} />
        <TodayTasksWidget items={viewModel.tasks} status={status} />
        <WaitingWidget items={viewModel.waiting} status={status} />
        <div className="today-mobile-core-widgets">
          <DailyCheckInWidget items={viewModel.checkIns} status={status} />
          <QuickMemoWidget memo={viewModel.quickMemo} status={status} />
        </div>
      </div>
    </div>
  )
}
