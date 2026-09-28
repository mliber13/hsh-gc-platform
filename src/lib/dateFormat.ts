import { toLocalDate } from './scheduleCalendarUtils'

/** The company's calendar. "Today" and punch dates follow this zone, not UTC and not the browser. */
export const ORG_TIME_ZONE = 'America/New_York'

function zoneParts(instant: Date, timeZone: string): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const bag: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== 'literal') bag[part.type] = part.value
  }
  // Some engines report midnight as hour 24.
  let hour = Number(bag.hour)
  if (hour === 24) hour = 0
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
  }
}

function formatInstantInZone(instant: Date, timeZone: string): string {
  const p = zoneParts(instant, timeZone)
  const m = String(p.month).padStart(2, '0')
  const d = String(p.day).padStart(2, '0')
  return `${p.year}-${m}-${d}`
}

/**
 * Today's calendar day in America/New_York.
 * `new Date().toISOString().slice(0, 10)` is tomorrow after 8pm Eastern.
 */
export function todayKey(now: Date = new Date()): string {
  return formatInstantInZone(now, ORG_TIME_ZONE)
}

/**
 * Calendar day of a date-only `Date`.
 *
 * Schedule math builds these as local midnight (`new Date('YYYY-MM-DDT00:00:00')`,
 * date-fns `parseISO` of a date-only string). `toISOString().slice(0, 10)` then
 * returns the previous UTC day in any positive UTC offset — correct in Ohio,
 * wrong in Europe, wrong under `TZ=Europe/Berlin`.
 *
 * Local year/month/day is the day that Date was built to name, in every zone.
 * Do not use this for a real instant ("now", a punch). Those go through
 * `todayKey` / `orgDateKey`, which resolve in the org zone.
 */
export function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Org-zone calendar day of a real instant (a punch, a timestamp). */
export function orgDateKey(instant: Date): string {
  return formatInstantInZone(instant, ORG_TIME_ZONE)
}

/** Add calendar days to a `YYYY-MM-DD` key. The key is a date, not an instant. */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) return dateKey
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days))
  const y = utc.getUTCFullYear()
  const m = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const d = String(utc.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const p = zoneParts(instant, timeZone)
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  const instantSeconds = Math.floor(instant.getTime() / 1000) * 1000
  return wallAsUtc - instantSeconds
}

function orgWallTimeToUtc(dateKey: string, hour: number, minute: number, second: number, ms: number): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) throw new Error(`Invalid date key: ${dateKey}`)
  const wallAsUtc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    hour,
    minute,
    second,
    ms,
  )
  const first = zoneOffsetMs(new Date(wallAsUtc), ORG_TIME_ZONE)
  let utc = wallAsUtc - first
  const secondOffset = zoneOffsetMs(new Date(utc), ORG_TIME_ZONE)
  if (secondOffset !== first) utc = wallAsUtc - secondOffset
  return new Date(utc)
}

/**
 * Inclusive America/New_York day bounds as UTC instants.
 *
 * A bare `'YYYY-MM-DDT00:00:00'` against `timestamptz` is midnight UTC, so a
 * punch after 8pm Eastern falls into the next calendar day. These bounds are
 * the org day's real start and end, DST included (EDT −4, EST −5).
 */
export function orgDateRangeBounds(from: string, to: string): { startIso: string; endIso: string } {
  return {
    startIso: orgWallTimeToUtc(from, 0, 0, 0, 0).toISOString(),
    endIso: orgWallTimeToUtc(to, 23, 59, 59, 999).toISOString(),
  }
}

/** True when `instant` falls on an org calendar day in `[from, to]` (inclusive). */
export function instantFallsOnOrgDate(instant: Date, from: string, to: string): boolean {
  const key = orgDateKey(instant)
  return key >= from && key <= to
}

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
