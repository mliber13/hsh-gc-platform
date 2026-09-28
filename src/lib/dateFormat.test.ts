import { describe, expect, it } from 'vitest'
import {
  formatDateOnly,
  instantFallsOnOrgDate,
  orgDateKey,
  orgDateRangeBounds,
  toDateKey,
  todayKey,
} from './dateFormat'

describe('formatDateOnly', () => {
  it('keeps a date-only string on its calendar day (no UTC-midnight off-by-one)', () => {
    // These parts are timezone-independent because the date is parsed as local midnight.
    expect(formatDateOnly('2026-07-27', { day: 'numeric' })).toBe('27')
    expect(formatDateOnly('2026-07-27', { month: 'numeric' })).toBe('7')
    expect(formatDateOnly('2026-01-01', { day: 'numeric' })).toBe('1')
    expect(formatDateOnly('2026-12-31', { day: 'numeric' })).toBe('31')
  })

  it('accepts a Date and uses its local calendar parts', () => {
    expect(formatDateOnly(new Date(2026, 6, 27), { day: 'numeric' })).toBe('27')
  })

  it('returns the fallback for null/empty', () => {
    expect(formatDateOnly(null)).toBe('')
    expect(formatDateOnly(undefined)).toBe('')
    expect(formatDateOnly('', {}, '—')).toBe('—')
  })
})

describe('org calendar day', () => {
  it('calls 1am UTC the previous Eastern evening, in any process zone', () => {
    // 2026-09-28 01:00 UTC is 2026-09-27 21:00 EDT.
    const instant = new Date('2026-09-28T01:00:00.000Z')
    expect(todayKey(instant)).toBe('2026-09-27')
    expect(orgDateKey(instant)).toBe('2026-09-27')
  })

  it('round-trips a local-midnight schedule date', () => {
    const date = new Date('2026-05-08T00:00:00')
    expect(toDateKey(date)).toBe('2026-05-08')
    expect(toDateKey(new Date(`${toDateKey(date)}T00:00:00`))).toBe('2026-05-08')
    // The old conversion. Positive offsets (Berlin) shift to the previous UTC day.
    const utcKey = date.toISOString().slice(0, 10)
    if (date.getTimezoneOffset() < 0) expect(utcKey).toBe('2026-05-07')
    else expect(utcKey).toBe('2026-05-08')
  })

  it('keeps a Sunday 8:30pm Eastern punch on Sunday, in daylight and standard time', () => {
    // Sep 27 2026 is Sunday. 20:30 EDT = 00:30 UTC Monday.
    const daylight = new Date('2026-09-28T00:30:00.000Z')
    expect(orgDateKey(daylight)).toBe('2026-09-27')
    const week = orgDateRangeBounds('2026-09-21', '2026-09-27')
    expect(daylight.getTime()).toBeGreaterThanOrEqual(new Date(week.startIso).getTime())
    expect(daylight.getTime()).toBeLessThanOrEqual(new Date(week.endIso).getTime())
    expect(instantFallsOnOrgDate(daylight, '2026-09-21', '2026-09-27')).toBe(true)
    const nextWeek = orgDateRangeBounds('2026-09-28', '2026-10-04')
    expect(daylight.getTime()).toBeLessThan(new Date(nextWeek.startIso).getTime())
    expect(instantFallsOnOrgDate(daylight, '2026-09-28', '2026-10-04')).toBe(false)

    // Jan 11 2026 is Sunday. 20:30 EST = 01:30 UTC Monday (UTC−5, not −4).
    const standard = new Date('2026-01-12T01:30:00.000Z')
    expect(orgDateKey(standard)).toBe('2026-01-11')
    const winterWeek = orgDateRangeBounds('2026-01-05', '2026-01-11')
    expect(standard.getTime()).toBeLessThanOrEqual(new Date(winterWeek.endIso).getTime())
    expect(instantFallsOnOrgDate(standard, '2026-01-05', '2026-01-11')).toBe(true)
    expect(instantFallsOnOrgDate(standard, '2026-01-12', '2026-01-18')).toBe(false)
  })
})
