import { CalendarCheck2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { DashboardWidget } from './DashboardWidget'
import { EmptyWidgetState, WidgetSkeleton } from './WidgetState'
import { useTranslations } from '@/features/settings/language/useTranslations'
import type { RoutineSchedule } from '@/domain/entities'
import type { TodayCheckInItemViewModel, TodayWidgetStatus } from '../viewModel'

const routineDayMessageKeys = [
  'today.routineDay0',
  'today.routineDay1',
  'today.routineDay2',
  'today.routineDay3',
  'today.routineDay4',
  'today.routineDay5',
  'today.routineDay6',
] as const

export interface RoutineFormValues {
  title: string
  schedule: RoutineSchedule
}

interface DailyCheckInWidgetProps {
  items: TodayCheckInItemViewModel[]
  status?: TodayWidgetStatus
  actionError?: string | null
  onCreate?: (values: RoutineFormValues) => Promise<unknown>
  onToggle?: (
    routineId: string,
    completed: boolean,
    date: string,
    routineVersion: number,
  ) => Promise<unknown>
  onPause?: (routineId: string, routineVersion: number) => Promise<unknown>
  onArchive?: (routineId: string, routineVersion: number) => Promise<unknown>
}

export function DailyCheckInWidget({
  items,
  status = 'ready',
  actionError,
  onCreate,
  onToggle,
  onPause,
  onArchive,
}: DailyCheckInWidgetProps) {
  const { t } = useTranslations()
  const [title, setTitle] = useState('')
  const [frequency, setFrequency] =
    useState<RoutineSchedule['frequency']>('daily')
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!onCreate || !title.trim()) return
    const schedule: RoutineSchedule =
      frequency === 'weekly' ? { frequency, daysOfWeek } : { frequency }
    await onCreate({ title, schedule })
    setTitle('')
  }

  const toggleDay = (day: number) =>
    setDaysOfWeek((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day],
    )

  return (
    <DashboardWidget
      className="utility-widget check-in-widget"
      title={t('today.checkInTitle')}
      count={items.filter((item) => item.completed).length}
      icon={<CalendarCheck2 aria-hidden="true" size={17} />}
    >
      {onCreate && (
        <form className="routine-capture" onSubmit={submit}>
          <label>
            <span>{t('today.routineTitle')}</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('today.routinePlaceholder')}
            />
          </label>
          <label>
            <span>{t('today.routineSchedule')}</span>
            <select
              value={frequency}
              onChange={(event) =>
                setFrequency(event.target.value as RoutineSchedule['frequency'])
              }
            >
              <option value="daily">{t('today.routineDaily')}</option>
              <option value="weekdays">{t('today.routineWeekdays')}</option>
              <option value="weekly">{t('today.routineWeekly')}</option>
            </select>
          </label>
          {frequency === 'weekly' && (
            <fieldset className="routine-days">
              <legend>{t('today.routineDays')}</legend>
              {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                <label key={day}>
                  <input
                    type="checkbox"
                    checked={daysOfWeek.includes(day)}
                    onChange={() => toggleDay(day)}
                  />
                  <span>{t(routineDayMessageKeys[day]!)}</span>
                </label>
              ))}
            </fieldset>
          )}
          <button
            type="submit"
            disabled={
              !title.trim() ||
              (frequency === 'weekly' && daysOfWeek.length === 0)
            }
          >
            {t('today.routineCreate')}
          </button>
          {actionError && <p role="alert">{actionError}</p>}
        </form>
      )}

      {status === 'loading' ? (
        <WidgetSkeleton />
      ) : items.length === 0 ? (
        <EmptyWidgetState
          title={t('today.checkInEmptyTitle')}
          description={t('today.checkInEmptyDescription')}
        />
      ) : (
        <ul className="check-in-list">
          {items.map((item) => (
            <li key={item.routineId} data-completed={item.completed}>
              <input
                aria-label={item.title}
                type="checkbox"
                checked={item.completed}
                onChange={() =>
                  onToggle?.(
                    item.routineId,
                    item.completed,
                    item.date,
                    item.routineVersion,
                  )
                }
                disabled={!onToggle}
              />
              <span>{item.title}</span>
              <div className="routine-actions">
                {onPause && (
                  <button
                    type="button"
                    onClick={() => onPause(item.routineId, item.routineVersion)}
                  >
                    {t('today.routinePause')}
                  </button>
                )}
                {onArchive && (
                  <button
                    type="button"
                    onClick={() =>
                      onArchive(item.routineId, item.routineVersion)
                    }
                  >
                    {t('today.routineArchive')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashboardWidget>
  )
}
