/**
 * Pure helpers for schedule calendar: one logical item → one bar (week segments).
 * Used so we can test bar span logic without rendering the full UI.
 */

import { addDays, isWithinInterval } from 'date-fns'
import type { ScheduleItem } from '@/types'

/** Parse date-only ISO string (YYYY-MM-DD) as local date; otherwise use Date's local date parts */
function parseLocalDate(value: Date | string): Date {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) {
      const [, y, m, d] = match.map(Number)
      return new Date(y, m - 1, d)
    }
    const d = new Date(value)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

/** Normalize to local midnight so ISO date-only strings don't shift to previous day in UTC */
export function toLocalDate(value: Date | string): Date {
  return parseLocalDate(value)
}

export function toLocalEndOfDay(value: Date | string): Date {
  const d = parseLocalDate(value)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

/**
 * Which day-of-week columns (0–6) does this item cover in this week?
 * calendarStart = Sunday of the first week shown (startOfWeek(startOfMonth(month))).
 */
export function getItemColsForWeek(
  calendarStart: Date,
  item: { startDate: Date | string; endDate: Date | string },
  weekIdx: number
): number[] {
  const start = toLocalDate(item.startDate)
  const end = toLocalEndOfDay(item.endDate)
  const weekStart = addDays(calendarStart, weekIdx * 7)
  const weekEnd = addDays(weekStart, 6)
  const rangeStart = start <= weekStart ? weekStart : start
  const rangeEnd = end >= weekEnd ? weekEnd : end
  if (rangeStart > rangeEnd) return []
  const cols: number[] = []
  for (let d = 0; d <= 6; d++) {
    const day = addDays(weekStart, d)
    if (isWithinInterval(day, { start: rangeStart, end: rangeEnd })) cols.push(d)
  }
  return cols
}

/** Total number of calendar days this item spans (inclusive). For tests. */
export function getItemSpanDays(item: { startDate: Date | string; endDate: Date | string }): number {
  const start = toLocalDate(item.startDate)
  const end = toLocalDate(item.endDate)
  const ms = end.getTime() - start.getTime()
  return Math.round(ms / (24 * 60 * 60 * 1000)) + 1
}
