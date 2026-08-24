import { StickyNote } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { enUS, zhCN } from 'date-fns/locale'
import { DashboardWidget } from './DashboardWidget'
import { EmptyWidgetState, WidgetSkeleton } from './WidgetState'
import { useTranslations } from '@/features/settings/language/useTranslations'
import type { TodayQuickMemoViewModel, TodayWidgetStatus } from '../viewModel'

interface QuickMemoWidgetProps {
  memo: TodayQuickMemoViewModel | null
  status?: TodayWidgetStatus
}

export function QuickMemoWidget({
  memo,
  status = 'ready',
}: QuickMemoWidgetProps) {
  const { language, t } = useTranslations()

  return (
    <DashboardWidget
      className="utility-widget memo-widget"
      title={t('today.memoTitle')}
      icon={<StickyNote aria-hidden="true" size={17} />}
    >
      {status === 'loading' ? (
        <WidgetSkeleton rows={2} />
      ) : status === 'empty' || memo === null ? (
        <EmptyWidgetState
          title={t('today.memoEmptyTitle')}
          description={t('today.memoEmptyDescription')}
        />
      ) : (
        <div className="memo-preview">
          <p>{memo.content}</p>
          <span>
            {t('today.updated')}{' '}
            {formatDistanceToNow(parseISO(memo.updatedAt), {
              addSuffix: true,
              locale: language === 'zh-CN' ? zhCN : enUS,
            })}
          </span>
        </div>
      )}
    </DashboardWidget>
  )
}
