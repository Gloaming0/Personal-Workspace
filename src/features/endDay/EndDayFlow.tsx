import { X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { EndDayOverview, UnfinishedTaskAction } from './contracts'
import { useTranslations } from '@/features/settings/language/useTranslations'

interface EndDayFlowProps {
  onClose: () => void
  onLoad: () => Promise<EndDayOverview>
  onFinalize: (
    summary: string,
    actions: Record<string, UnfinishedTaskAction>,
  ) => Promise<unknown>
}

export function EndDayFlow({ onClose, onLoad, onFinalize }: EndDayFlowProps) {
  const { t } = useTranslations()
  const [step, setStep] = useState(1)
  const [overview, setOverview] = useState<EndDayOverview | null>(null)
  const [actions, setActions] = useState<Record<string, UnfinishedTaskAction>>(
    {},
  )
  const [summary, setSummary] = useState('')
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    let active = true
    void onLoad()
      .then((data) => {
        if (!active) return
        setOverview(data)
        setActions(
          Object.fromEntries(data.openTasks.map((task) => [task.id, 'keep'])),
        )
      })
      .catch(() => active && setError(true))
    return () => {
      active = false
    }
  }, [onLoad])

  useEffect(() => dialogRef.current?.focus(), [])

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const controls = [
      ...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
      ),
    ].filter((element) => element.offsetParent !== null)
    const first = controls[0]
    const last = controls.at(-1)
    if (!first || !last) return
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === dialogRef.current)
    ) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const finalize = async () => {
    setSaving(true)
    setError(false)
    try {
      await onFinalize(summary, actions)
      onClose()
    } catch {
      setError(true)
      setSaving(false)
    }
  }

  return (
    <div className="end-day-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="end-day-flow"
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-day-title"
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
      >
        <header>
          <div>
            <p className="eyebrow">
              {t('endDay.step').replace('{step}', String(step))}
            </p>
            <h2 id="end-day-title">{t('endDay.title')}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label={t('endDay.close')}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        {!overview && !error && <p role="status">{t('endDay.loading')}</p>}
        {error && <p role="alert">{t('endDay.error')}</p>}
        {overview?.finalizedLog && (
          <div className="end-day-content">
            <h3>{t('endDay.finalizedTitle')}</h3>
            <dl className="end-day-stats">
              <div>
                <dt>{t('endDay.completed')}</dt>
                <dd>{overview.finalizedLog.snapshot.completedTasks.length}</dd>
              </div>
              <div>
                <dt>{t('endDay.openTasks')}</dt>
                <dd>{overview.finalizedLog.snapshot.openTasks.length}</dd>
              </div>
              <div>
                <dt>{t('endDay.waiting')}</dt>
                <dd>{overview.finalizedLog.snapshot.waiting.length}</dd>
              </div>
              <div>
                <dt>{t('endDay.checkIns')}</dt>
                <dd>
                  {
                    overview.finalizedLog.snapshot.routines.filter(
                      (routine) => routine.completed,
                    ).length
                  }
                  /{overview.finalizedLog.snapshot.routines.length}
                </dd>
              </div>
            </dl>
            {overview.finalizedLog.summary && (
              <p>{overview.finalizedLog.summary}</p>
            )}
            <p className="end-day-finalized-at">
              {t('endDay.finalizedAt')}{' '}
              {new Date(overview.finalizedLog.finalizedAt).toLocaleString()}
            </p>
          </div>
        )}
        {overview && !overview.finalizedLog && step === 1 && (
          <div className="end-day-content">
            <h3>{t('endDay.overview')}</h3>
            <dl className="end-day-stats">
              <div>
                <dt>{t('endDay.completed')}</dt>
                <dd>{overview.completedTasks.length}</dd>
              </div>
              <div>
                <dt>{t('endDay.openTasks')}</dt>
                <dd>{overview.openTasks.length}</dd>
              </div>
              <div>
                <dt>{t('endDay.waiting')}</dt>
                <dd>{overview.waiting.length}</dd>
              </div>
              <div>
                <dt>{t('endDay.checkIns')}</dt>
                <dd>
                  {overview.routineLogs.length}/{overview.routines.length}
                </dd>
              </div>
              <div>
                <dt>{t('endDay.notes')}</dt>
                <dd>{overview.memos.length}</dd>
              </div>
            </dl>
          </div>
        )}
        {overview && !overview.finalizedLog && step === 2 && (
          <div className="end-day-content">
            <h3>{t('endDay.handleOpen')}</h3>
            {overview.openTasks.length === 0 ? (
              <p>{t('endDay.noOpen')}</p>
            ) : (
              <ul className="end-day-task-list">
                {overview.openTasks.map((task) => (
                  <li key={task.id}>
                    <span>{task.title}</span>
                    <select
                      value={actions[task.id]}
                      onChange={(event) =>
                        setActions((current) => ({
                          ...current,
                          [task.id]: event.target.value as UnfinishedTaskAction,
                        }))
                      }
                      aria-label={`${task.title} ${t('endDay.action')}`}
                    >
                      <option value="tomorrow">{t('endDay.tomorrow')}</option>
                      <option value="later">{t('endDay.later')}</option>
                      <option value="keep">{t('endDay.keep')}</option>
                      <option value="delete">{t('endDay.delete')}</option>
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {overview && !overview.finalizedLog && step === 3 && (
          <div className="end-day-content">
            <label htmlFor="end-day-summary">{t('endDay.summary')}</label>
            <textarea
              id="end-day-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder={t('endDay.summaryPlaceholder')}
              autoFocus
            />
          </div>
        )}
        {overview && !overview.finalizedLog && step === 4 && (
          <div className="end-day-content">
            <h3>{t('endDay.ready')}</h3>
            <p>{t('endDay.readyDescription')}</p>
          </div>
        )}
        {overview?.finalizedLog ? (
          <footer>
            <button type="button" onClick={onClose}>
              {t('endDay.close')}
            </button>
          </footer>
        ) : (
          overview && (
            <footer>
              <button
                type="button"
                className="secondary-button"
                onClick={
                  step === 1 ? onClose : () => setStep((value) => value - 1)
                }
              >
                {step === 1 ? t('endDay.cancel') : t('endDay.back')}
              </button>
              {step < 4 ? (
                <button
                  type="button"
                  onClick={() => setStep((value) => value + 1)}
                >
                  {t('endDay.next')}
                </button>
              ) : (
                <button type="button" onClick={finalize} disabled={saving}>
                  {saving ? t('endDay.saving') : t('endDay.finalize')}
                </button>
              )}
            </footer>
          )
        )}
      </section>
    </div>
  )
}
