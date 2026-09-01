import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useTranslations } from '@/features/settings/language/useTranslations'
import type { ConflictResolutionAction, SyncConflictView } from './contracts'

export function ConflictCenter({
  conflicts,
  onClose,
  onResolve,
}: {
  conflicts: SyncConflictView[]
  onClose(): void
  onResolve(
    conflictId: string,
    action: ConflictResolutionAction,
    focusTaskIds?: string[],
  ): Promise<void>
}) {
  const { t } = useTranslations()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [focusSelections, setFocusSelections] = useState<
    Record<string, string[]>
  >(() =>
    Object.fromEntries(
      conflicts.map((conflict) => [
        conflict.id,
        conflict.selectionCandidates
          .filter((candidate) => candidate.selected)
          .sort((left, right) => (left.order ?? 99) - (right.order ?? 99))
          .slice(0, 3)
          .map((candidate) => candidate.id),
      ]),
    ),
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onClose])

  const resolve = async (
    conflict: SyncConflictView,
    action: ConflictResolutionAction,
  ) => {
    setBusy(conflict.id)
    setError(null)
    try {
      const focusTaskIds =
        action === 'repair_focus' ? focusSelections[conflict.id] : undefined
      await onResolve(conflict.id, action, focusTaskIds)
    } catch {
      setError(t('sync.resolutionFailed'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="conflict-center-backdrop" role="presentation">
      <section
        className="conflict-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-center-title"
      >
        <header>
          <div>
            <p className="eyebrow">{t('sync.conflictEyebrow')}</p>
            <h2 id="conflict-center-title">{t('sync.conflictCenter')}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t('sync.close')}>
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <p>{t('sync.conflictIntro')}</p>
        {error && (
          <p role="alert" className="conflict-error">
            {error}
          </p>
        )}
        <ul className="conflict-center-list">
          {conflicts.map((conflict) => (
            <li key={conflict.id}>
              <div>
                <strong>{conflict.title}</strong>
                <span>
                  {t(`sync.entity.${conflict.entityType}`)} ·{' '}
                  {t(`sync.conflict.${conflict.conflictType}`)}
                </span>
              </div>
              {conflict.differences.length > 0 && (
                <dl>
                  {conflict.differences.map((difference) => (
                    <div key={difference.field}>
                      <dt>{difference.field}</dt>
                      <dd>
                        <span>
                          {t('sync.localCandidate')}:{' '}
                          {difference.localValue ?? '—'}
                        </span>
                        <span>
                          {t('sync.remoteCandidate')}:{' '}
                          {difference.remoteValue ?? '—'}
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {conflict.selectionCandidates.length > 0 && (
                <fieldset className="focus-conflict-selection">
                  <legend>{t('sync.focusSelection')}</legend>
                  {conflict.selectionCandidates.map((candidate) => {
                    const selected = focusSelections[conflict.id] ?? []
                    const order = selected.indexOf(candidate.id)
                    return (
                      <label key={candidate.id}>
                        <input
                          type="checkbox"
                          checked={order >= 0}
                          disabled={order < 0 && selected.length >= 3}
                          onChange={(event) =>
                            setFocusSelections((current) => {
                              const value = current[conflict.id] ?? []
                              return {
                                ...current,
                                [conflict.id]: event.target.checked
                                  ? [...value, candidate.id].slice(0, 3)
                                  : value.filter((id) => id !== candidate.id),
                              }
                            })
                          }
                        />
                        <span>
                          {order >= 0 ? `${order + 1}. ` : ''}
                          {candidate.label}
                        </span>
                      </label>
                    )
                  })}
                </fieldset>
              )}
              {conflict.conflictType === 'OwnershipConflict' ? (
                <p>{t('sync.ownershipBlocked')}</p>
              ) : (
                <div className="conflict-actions">
                  {conflict.availableActions.map((action) => (
                    <button
                      key={action}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void resolve(conflict, action)}
                    >
                      {t(`sync.action.${action}`)}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
