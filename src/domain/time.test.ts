import { describe, expect, it } from 'vitest'
import {
  addLocalDateDays,
  compareLocalDates,
  instantToLocalDate,
  isIanaTimezone,
  isLocalDate,
  isUtcInstant,
} from './time'

describe('Date Policy', () => {
  it('converts one Instant explicitly across UTC-12 and UTC+14', () => {
    const instant = '2026-01-01T10:30:00.000Z'
    expect(instantToLocalDate(instant, 'Etc/GMT+12')).toBe('2025-12-31')
    expect(instantToLocalDate(instant, 'Pacific/Kiritimati')).toBe('2026-01-02')
  })

  it('adds LocalDate days without device timezone or DST parsing', () => {
    expect(addLocalDateDays('2026-03-07', 1)).toBe('2026-03-08')
    expect(addLocalDateDays('2026-03-08', 1)).toBe('2026-03-09')
    expect(addLocalDateDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(compareLocalDates('2026-03-08', '2026-03-09')).toBeLessThan(0)
  })

  it('strictly validates Instant, LocalDate, and IANA timezone values', () => {
    expect(isUtcInstant('2026-08-25T23:59:59.000Z')).toBe(true)
    expect(isUtcInstant('2026-08-25T23:59:59+08:00')).toBe(false)
    expect(isLocalDate('2026-02-29')).toBe(false)
    expect(isLocalDate('2024-02-29')).toBe(true)
    expect(isIanaTimezone('Asia/Shanghai')).toBe(true)
    expect(isIanaTimezone('Mars/Olympus')).toBe(false)
  })
})
