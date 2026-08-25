import type { Instant, LocalDate } from './shared'

const localDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string') return false
  const match = localDatePattern.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export function isUtcInstant(value: unknown): value is Instant {
  if (typeof value !== 'string') return false
  const canonical =
    value.endsWith('Z') && !value.includes('.')
      ? value.replace('Z', '.000Z')
      : value
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === canonical
  )
}

export function isIanaTimezone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0)
    return true
  } catch {
    return false
  }
}

function localDateParts(date: LocalDate): [number, number, number] {
  if (!isLocalDate(date)) throw new RangeError(`Invalid LocalDate: ${date}`)
  const [year, month, day] = date.split('-').map(Number)
  return [year!, month!, day!]
}

export function addLocalDateDays(date: LocalDate, amount: number): LocalDate {
  if (!Number.isInteger(amount))
    throw new RangeError('Day amount must be an integer.')
  const [year, month, day] = localDateParts(date)
  const result = new Date(Date.UTC(year, month - 1, day + amount))
  return `${String(result.getUTCFullYear()).padStart(4, '0')}-${String(
    result.getUTCMonth() + 1,
  ).padStart(2, '0')}-${String(result.getUTCDate()).padStart(2, '0')}`
}

export function compareLocalDates(left: LocalDate, right: LocalDate): number {
  localDateParts(left)
  localDateParts(right)
  return left.localeCompare(right)
}

export function differenceInLocalDateDays(
  later: LocalDate,
  earlier: LocalDate,
): number {
  const [laterYear, laterMonth, laterDay] = localDateParts(later)
  const [earlierYear, earlierMonth, earlierDay] = localDateParts(earlier)
  return Math.round(
    (Date.UTC(laterYear, laterMonth - 1, laterDay) -
      Date.UTC(earlierYear, earlierMonth - 1, earlierDay)) /
      86_400_000,
  )
}

export function localDateDayOfWeek(date: LocalDate): number {
  const [year, month, day] = localDateParts(date)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function instantToLocalDate(
  instant: Instant,
  timezone: string,
): LocalDate {
  if (!isUtcInstant(instant)) throw new RangeError('Instant must be UTC ISO.')
  if (!isIanaTimezone(timezone)) throw new RangeError('Invalid IANA timezone.')
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}
