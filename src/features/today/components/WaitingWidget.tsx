import { Hourglass } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { enUS, zhCN } from 'date-fns/locale'
import { DashboardWidget } from './DashboardWidget'
import { EmptyWidgetState, WidgetSkeleton } from './WidgetState'
import { useTranslations } from '@/features/settings/language/useTranslations'
import type { TodayWaitingItemViewModel, TodayWidgetStatus } from '../viewModel'

interface WaitingWidgetProps {
  items: TodayWaitingItemViewModel[]
  status?: TodayWidgetStatus
}

export function WaitingWidget({ items, status = 'ready' }: WaitingWidgetProps) {
  const { language, t } = useTranslations()

  return (
    <DashboardWidget
      className="waiting-widget"
      title={t('today.waitingTitle')}
      count={items.length}
      icon={<Hourglass aria-hidden="true" size={18} />}
    >
      {status === 'loading' ? (
        <WidgetSkeleton rows={2} />
      ) : status === 'empty' || items.length === 0 ? (
        <EmptyWidgetState
          title={t('today.waitingEmptyTitle')}
          description={t('today.waitingEmptyDescription')}
        />
      ) : (
        <ul className="waiting-list">
          {items.map((item) => (
            <li key={item.waitingId}>
              <span className="waiting-status" aria-hidden="true">
                <Hourglass size={15} />
              </span>
              <div>
                <strong>{item.title}</strong>
                <span>{item.person}</span>
              </div>
              <small>
                {item.needsFollowUp
                  ? t('today.needsFollowUp')
                  : item.followUpDate
                    ? formatDistanceToNow(parseISO(item.followUpDate), {
                        addSuffix: true,
                        locale: language === 'zh-CN' ? zhCN : enUS,
                      })
                    : t('today.waitingDays').replace(
                        '{count}',
                        String(item.daysWaiting),
                      )}
              </small>
            </li>
          ))}
        </ul>
      )}
    </DashboardWidget>
  )
}
