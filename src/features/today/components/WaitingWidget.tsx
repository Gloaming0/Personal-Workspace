import { Ellipsis, Hourglass } from 'lucide-react'
import { formatDistanceToNow, parseISO } from 'date-fns'
import { enUS, zhCN } from 'date-fns/locale'
import { useState, type FormEvent } from 'react'
import { DashboardWidget } from './DashboardWidget'
import { EmptyWidgetState, WidgetSkeleton } from './WidgetState'
import { useTranslations } from '@/features/settings/language/useTranslations'
import type { LocalDate } from '@/domain/shared'
import type { TodayWaitingItemViewModel, TodayWidgetStatus } from '../viewModel'

export interface WaitingFormValues {
  title: string
  person: string | null
  notes: string | null
  followUpDate: LocalDate | null
  sourceTaskId: string | null
}

export type WaitingTransitionAction = 'confirm' | 'close' | 'reopen'

interface WaitingWidgetProps {
  items: TodayWaitingItemViewModel[]
  status?: TodayWidgetStatus
  actionError?: string | null
  onCreate?: (values: WaitingFormValues) => Promise<unknown>
  onEdit?: (
    waitingId: string,
    values: WaitingFormValues,
    entityVersion: number,
  ) => Promise<unknown>
  onTransition?: (
    waitingId: string,
    action: WaitingTransitionAction,
    entityVersion: number,
  ) => Promise<unknown>
}

const emptyForm: WaitingFormValues = {
  title: '',
  person: null,
  notes: null,
  followUpDate: null,
  sourceTaskId: null,
}

function toInputValue(value: string | null) {
  return value ?? ''
}

export function WaitingWidget({
  items,
  status = 'ready',
  actionError,
  onCreate,
  onEdit,
  onTransition,
}: WaitingWidgetProps) {
  const { language, t } = useTranslations()
  const [createValues, setCreateValues] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingVersion, setEditingVersion] = useState<number | null>(null)
  const [editValues, setEditValues] = useState(emptyForm)

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!onCreate || !createValues.title.trim()) return
    await onCreate(createValues)
    setCreateValues(emptyForm)
  }

  const startEditing = (item: TodayWaitingItemViewModel) => {
    setEditingId(item.waitingId)
    setEditingVersion(item.entityVersion)
    setEditValues({
      title: item.title,
      person: item.person,
      notes: item.notes,
      followUpDate: item.followUpDate,
      sourceTaskId: item.sourceTaskId,
    })
  }

  const submitEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (
      !onEdit ||
      !editingId ||
      editingVersion === null ||
      !editValues.title.trim()
    )
      return
    await onEdit(editingId, editValues, editingVersion)
    setEditingId(null)
  }

  const updateCreate = (fields: Partial<WaitingFormValues>) =>
    setCreateValues((current) => ({ ...current, ...fields }))
  const updateEdit = (fields: Partial<WaitingFormValues>) =>
    setEditValues((current) => ({ ...current, ...fields }))

  return (
    <DashboardWidget
      className="waiting-widget"
      title={t('today.waitingTitle')}
      count={items.length}
      icon={<Hourglass aria-hidden="true" size={18} />}
    >
      {onCreate && (
        <form className="waiting-capture" onSubmit={submitCreate}>
          <label>
            <span>{t('today.waitingCreateTitle')}</span>
            <input
              value={createValues.title}
              onChange={(event) => updateCreate({ title: event.target.value })}
              placeholder={t('today.waitingTitlePlaceholder')}
              required
            />
          </label>
          <label>
            <span>{t('today.waitingPerson')}</span>
            <input
              value={toInputValue(createValues.person)}
              onChange={(event) => updateCreate({ person: event.target.value })}
              placeholder={t('today.waitingPersonPlaceholder')}
            />
          </label>
          <label>
            <span>{t('today.waitingFollowUpDate')}</span>
            <input
              type="date"
              value={toInputValue(createValues.followUpDate)}
              onInput={(event) =>
                updateCreate({
                  followUpDate: event.currentTarget.value || null,
                })
              }
              onChange={(event) =>
                updateCreate({ followUpDate: event.target.value || null })
              }
            />
          </label>
          <button type="submit" disabled={!createValues.title.trim()}>
            {t('today.waitingCreateAction')}
          </button>
          {actionError && <p role="alert">{actionError}</p>}
        </form>
      )}

      {status === 'loading' ? (
        <WidgetSkeleton rows={2} />
      ) : items.length === 0 ? (
        <EmptyWidgetState
          title={t('today.waitingEmptyTitle')}
          description={t('today.waitingEmptyDescription')}
        />
      ) : (
        <ul className="waiting-list">
          {items.map((item) => (
            <li key={item.waitingId}>
              {editingId === item.waitingId ? (
                <form className="waiting-edit-form" onSubmit={submitEdit}>
                  <label>
                    <span>{t('today.waitingCreateTitle')}</span>
                    <input
                      value={editValues.title}
                      onChange={(event) =>
                        updateEdit({ title: event.target.value })
                      }
                      required
                    />
                  </label>
                  <label>
                    <span>{t('today.waitingPerson')}</span>
                    <input
                      value={toInputValue(editValues.person)}
                      onChange={(event) =>
                        updateEdit({ person: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>{t('today.waitingNotes')}</span>
                    <input
                      value={toInputValue(editValues.notes)}
                      onChange={(event) =>
                        updateEdit({ notes: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span>{t('today.waitingFollowUpDate')}</span>
                    <input
                      type="date"
                      value={toInputValue(editValues.followUpDate)}
                      onInput={(event) =>
                        updateEdit({
                          followUpDate: event.currentTarget.value || null,
                        })
                      }
                      onChange={(event) =>
                        updateEdit({ followUpDate: event.target.value || null })
                      }
                    />
                  </label>
                  <div className="waiting-actions">
                    <button type="submit">{t('today.waitingSave')}</button>
                    <button type="button" onClick={() => setEditingId(null)}>
                      {t('today.waitingCancel')}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="waiting-item-main">
                    <span className="waiting-status" aria-hidden="true">
                      <Hourglass size={15} />
                    </span>
                    <div className="waiting-item-copy">
                      <strong>{item.title}</strong>
                      {(item.person || item.projectName) && (
                        <span>
                          {[item.person, item.projectName]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
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
                    </div>
                  </div>
                  <div className="waiting-item-footer">
                    <span className="waiting-state-label">
                      {item.status === 'confirmed'
                        ? t('today.waitingConfirmed')
                        : t('today.waitingOpen')}
                    </span>
                    {(onEdit || onTransition) && (
                      <div className="waiting-actions">
                        {onEdit && (
                          <button
                            className="waiting-primary-action"
                            type="button"
                            onClick={() => startEditing(item)}
                          >
                            {t('today.waitingEdit')}
                          </button>
                        )}
                        {onTransition && (
                          <details className="waiting-action-menu">
                            <summary aria-label={t('today.waitingMore')}>
                              <Ellipsis aria-hidden="true" size={18} />
                              <span className="visually-hidden">
                                {t('today.waitingMore')}
                              </span>
                            </summary>
                            <div>
                              {item.status === 'waiting' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void onTransition(
                                      item.waitingId,
                                      'confirm',
                                      item.entityVersion,
                                    )
                                  }
                                >
                                  {t('today.waitingConfirm')}
                                </button>
                              )}
                              {item.status === 'confirmed' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void onTransition(
                                      item.waitingId,
                                      'reopen',
                                      item.entityVersion,
                                    )
                                  }
                                >
                                  {t('today.waitingReopen')}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  void onTransition(
                                    item.waitingId,
                                    'close',
                                    item.entityVersion,
                                  )
                                }
                              >
                                {t('today.waitingClose')}
                              </button>
                            </div>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </DashboardWidget>
  )
}
