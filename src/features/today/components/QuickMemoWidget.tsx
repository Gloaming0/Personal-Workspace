import { StickyNote } from 'lucide-react'
import { DashboardWidget } from './DashboardWidget'
import { EmptyWidgetState, WidgetSkeleton } from './WidgetState'
import { useTranslations } from '@/features/settings/language/useTranslations'
import type { DashboardStatus, QuickMemo } from '../types'
import { localize } from '../types'

interface QuickMemoWidgetProps {
  memo: QuickMemo | null
  status?: DashboardStatus
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
          <p>{localize(memo.content, language)}</p>
          <span>{localize(memo.updatedAt, language)}</span>
        </div>
      )}
    </DashboardWidget>
  )
}
