import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { MorningReviewAction, MorningReviewData } from './contracts'
import { useTranslations } from '@/features/settings/language/useTranslations'

interface MorningReviewFlowProps {
  data: MorningReviewData
  onApply: (taskId: string, action: MorningReviewAction) => Promise<void>
  onMoveAll: () => Promise<void>
  onSkip: () => Promise<void>
}

export function MorningReviewFlow({
  data,
  onApply,
  onMoveAll,
  onSkip,
}: MorningReviewFlowProps) {
  const { t } = useTranslations()
  const dialogRef = useRef<HTMLElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => dialogRef.current?.focus(), [])

  const run = async (command: () => Promise<void>) => {
    setBusy(true)
    setError(false)
    try {
      await command()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      void run(onSkip)
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const controls = [
      ...dialogRef.current.querySelectorAll<HTMLButtonElement>(
        'button:not([disabled])',
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

  return (
    <div className="morning-review-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="morning-review-flow"
        role="dialog"
        aria-modal="true"
        aria-labelledby="morning-review-title"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header>
          <div>
            <p className="eyebrow">{t('morningReview.eyebrow')}</p>
            <h2 id="morning-review-title">{t('morningReview.title')}</h2>
            <p>
              {t('morningReview.description').replace(
                '{count}',
                String(data.tasks.length),
              )}
            </p>
          </div>
        </header>
        <ul className="morning-review-list">
          {data.tasks.map((task) => (
            <li key={task.id}>
              <strong>{task.title}</strong>
              <div>
                {(
                  [
                    ['today', 'morningReview.moveToday'],
                    ['later', 'morningReview.later'],
                    ['done', 'morningReview.done'],
                    ['delete', 'morningReview.delete'],
                  ] as const
                ).map(([action, key]) => (
                  <button
                    key={action}
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => onApply(task.id, action))}
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        {error && <p role="alert">{t('morningReview.error')}</p>}
        <footer>
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => void run(onSkip)}
          >
            {t('morningReview.skip')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(onMoveAll)}
          >
            {t('morningReview.moveAll')}
          </button>
        </footer>
      </section>
    </div>
  )
}
