/**
 * Test harness: one schedule item = one logical element, spanning 6 days.
 * Run: npx vitest run src/lib/scheduleCalendarUtils.test.ts
 */

import { describe, it, expect } from 'vitest'
import { startOfMonth, startOfWeek } from 'date-fns'
import {
  getItemColsForWeek,
  getItemSpanDays,
  toLocalDate,
} from './scheduleCalendarUtils'

describe('scheduleCalendarUtils', () => {
  // March 2026: calendar starts Sunday Mar 1. Week 0 = Mar 1-7, Week 1 = Mar 8-14.
  const march2026 = new Date(2026, 2, 1)
  const calendarStart = startOfWeek(startOfMonth(march2026), { weekStartsOn: 0 })

  it('Architectural Plans start=2026-03-09 end=2026-03-14 appears once, spans 6 days', () => {
    const item = {
      startDate: new Date(2026, 2, 9),  // Mon Mar 9
      endDate: new Date(2026, 2, 14),   // Sat Mar 14
    }

    // One logical item → span is 6 days (inclusive)
    expect(getItemSpanDays(item)).toBe(6)

    // Week 0 (Mar 1-7): item does not run
    expect(getItemColsForWeek(calendarStart, item, 0)).toEqual([])

    // Week 1 (Mar 8-14): item runs Mon 9 through Sat 14 → columns 1,2,3,4,5,6 (Sun=0)
    const week1Cols = getItemColsForWeek(calendarStart, item, 1)
    expect(week1Cols).toEqual([1, 2, 3, 4, 5, 6])
    expect(week1Cols.length).toBe(6)

    // Week 2+: no more
    expect(getItemColsForWeek(calendarStart, item, 2)).toEqual([])
  })

  it('toLocalDate preserves local calendar day from Date', () => {
    const localDate = new Date(2026, 2, 9) // Mar 9 local
    const d = toLocalDate(localDate)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(2)
    expect(d.getDate()).toBe(9)
  })

  it('toLocalDate parses ISO date-only string as local (no UTC shift)', () => {
    const d = toLocalDate('2026-03-09')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(2)
    expect(d.getDate()).toBe(9)
  })

  it('item with string start/end gets correct week columns (placement)', () => {
    const item = { startDate: '2026-03-09', endDate: '2026-03-14' }
    expect(getItemColsForWeek(calendarStart, item, 0)).toEqual([])
    expect(getItemColsForWeek(calendarStart, item, 1)).toEqual([1, 2, 3, 4, 5, 6])
  })
})
