import { format } from 'date-fns'
import { enUS, zhCN } from 'date-fns/locale'
import { FocusWidget } from './components/FocusWidget'
import { TodayTasksWidget } from './components/TodayTasksWidget'
import { WaitingWidget } from './components/WaitingWidget'
import { todayDashboardMock } from './mockData'
import type { DashboardStatus, TodayDashboardData } from './types'
import { useTranslations } from '@/features/settings/language/useTranslations'

interface TodayDashboardProps {
  data?: TodayDashboardData
  status?: DashboardStatus
}

export function TodayDashboard({
  data = todayDashboardMock,
  status = 'ready',
}: TodayDashboardProps) {
  const { language, t } = useTranslations()
  const date = format(
    new Date(),
    language === 'zh-CN' ? 'M月d日 EEEE' : 'EEEE · MMMM d',
    { locale: language === 'zh-CN' ? zhCN : enUS },
  )
  const openTasks = data.tasks.filter((item) => !item.completed).length

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
            <dd>{openTasks}</dd>
          </div>
          <div>
            <dt>{t('today.waitingStat')}</dt>
            <dd>{data.waiting.length}</dd>
          </div>
          <div>
            <dt>{t('today.checkInsStat')}</dt>
            <dd>{data.checkIns.filter((item) => item.completed).length}</dd>
          </div>
        </dl>
      </header>

      <div className="today-workspace-grid">
        <FocusWidget items={data.focus} status={status} />
        <TodayTasksWidget items={data.tasks} status={status} />
        <WaitingWidget items={data.waiting} status={status} />
      </div>
    </div>
  )
}
