import { StickyNote } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { enUS, zhCN } from 'date-fns/locale'
import { useState, type FormEvent } from 'react'
import { DashboardWidget } from './DashboardWidget'
import { EmptyWidgetState, WidgetSkeleton } from './WidgetState'
import { useTranslations } from '@/features/settings/language/useTranslations'
import type { TodayQuickMemoViewModel, TodayWidgetStatus } from '../viewModel'

export interface MemoFormValues {
  content: string
  projectId: string | null
}

interface QuickMemoWidgetProps {
  memo: TodayQuickMemoViewModel | null
  status?: TodayWidgetStatus
  actionError?: string | null
  onCreate?: (values: MemoFormValues) => Promise<unknown>
  onEdit?: (memoId: string, values: MemoFormValues) => Promise<unknown>
  onDelete?: (memoId: string) => Promise<unknown>
  onTogglePin?: (memoId: string, pinned: boolean) => Promise<unknown>
}

export function QuickMemoWidget({
  memo,
  status = 'ready',
  actionError,
  onCreate,
  onEdit,
  onDelete,
  onTogglePin,
}: QuickMemoWidgetProps) {
  const { language, t } = useTranslations()
  const [content, setContent] = useState('')
  const [projectId, setProjectId] = useState('')
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [editProjectId, setEditProjectId] = useState('')

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!onCreate || !content.trim()) return
    await onCreate({ content, projectId: projectId.trim() || null })
    setContent('')
    setProjectId('')
  }

  const startEdit = () => {
    if (!memo) return
    setEditContent(memo.content)
    setEditProjectId(memo.projectId ?? '')
    setEditing(true)
  }

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!memo || !onEdit || !editContent.trim()) return
    await onEdit(memo.memoId, {
      content: editContent,
      projectId: editProjectId.trim() || null,
    })
    setEditing(false)
  }

  return (
    <DashboardWidget
      className="utility-widget memo-widget"
      title={t('today.memoTitle')}
      icon={<StickyNote aria-hidden="true" size={17} />}
    >
      {onCreate && (
        <form className="memo-capture" onSubmit={submitCreate}>
          <label>
            <span>{t('today.memoContent')}</span>
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={t('today.memoPlaceholder')}
              rows={2}
            />
          </label>
          <label>
            <span>{t('today.memoProject')}</span>
            <input
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              placeholder={t('today.memoProjectPlaceholder')}
            />
          </label>
          <button type="submit" disabled={!content.trim()}>
            {t('today.memoCreate')}
          </button>
          {actionError && <p role="alert">{actionError}</p>}
        </form>
      )}

      {status === 'loading' ? (
        <WidgetSkeleton rows={2} />
      ) : memo === null ? (
        <EmptyWidgetState
          title={t('today.memoEmptyTitle')}
          description={t('today.memoEmptyDescription')}
        />
      ) : editing ? (
        <form className="memo-edit-form" onSubmit={submitEdit}>
          <label>
            <span>{t('today.memoContent')}</span>
            <textarea
              value={editContent}
              onChange={(event) => setEditContent(event.target.value)}
              rows={3}
            />
          </label>
          <label>
            <span>{t('today.memoProject')}</span>
            <input
              value={editProjectId}
              onChange={(event) => setEditProjectId(event.target.value)}
            />
          </label>
          <div className="memo-actions">
            <button type="submit">{t('today.memoSave')}</button>
            <button type="button" onClick={() => setEditing(false)}>
              {t('today.memoCancel')}
            </button>
          </div>
        </form>
      ) : (
        <div className="memo-preview">
          <p>{memo.content}</p>
          {memo.projectName && <small>{memo.projectName}</small>}
          <span>
            {t('today.updated')}{' '}
            {formatDistanceToNow(parseISO(memo.updatedAt), {
              addSuffix: true,
              locale: language === 'zh-CN' ? zhCN : enUS,
            })}
          </span>
          <div className="memo-actions">
            {onTogglePin && (
              <button
                type="button"
                onClick={() => onTogglePin(memo.memoId, memo.pinned)}
              >
                {memo.pinned ? t('today.memoUnpin') : t('today.memoPin')}
              </button>
            )}
            {onEdit && (
              <button type="button" onClick={startEdit}>
                {t('today.memoEdit')}
              </button>
            )}
            {onDelete && (
              <button type="button" onClick={() => onDelete(memo.memoId)}>
                {t('today.memoDelete')}
              </button>
            )}
          </div>
        </div>
      )}
    </DashboardWidget>
  )
}
