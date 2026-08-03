import { toLocalDate } from './scheduleCalendarUtils'

/**
 * Format a **date-only** value (a `YYYY-MM-DD` string, or a Date) on its LOCAL
 * calendar day.
 *
 * Use this instead of `new Date(str).toLocaleDateString(...)` for date-only
 * fields. `new Date('2026-07-27')` parses as UTC midnight, which in a negative
 * UTC offset (e.g. Eastern) is the evening of the 26th — so the naive call
 * prints the day BEFORE. This parses the calendar parts directly, so the day
 * never shifts.
 *
 * ⚠️ Only for date-only fields (schedule dates, stock/delivery dates, PO start
 * dates, etc.). Do NOT use for full timestamps (`created_at`, `*_at`,
 * ISO strings with a time) — those carry a real instant and should be formatted
 * with `new Date(ts).toLocaleDateString(...)` so they respect local time.
 */
export function formatDateOnly(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' },
  fallback = '',
): string {
  if (!value) return fallback
  return toLocalDate(value).toLocaleDateString(undefined, options)
}
