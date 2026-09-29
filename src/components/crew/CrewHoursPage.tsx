import { useCallback, useEffect, useMemo, useState } from 'react'
import { addDays, format, parseISO, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchEntriesForRange, roundHoursToQuarter } from '@/services/hrTimeService'
import { todayKey, toDateKey } from '@/lib/dateFormat'
import type { TimeEntry } from '@/types/hr'

/** Hours between two stamps, quarter-rounded the way payroll rounds them. */
function entryHours(entry: TimeEntry): number | null {
  if (!entry.clock_out) return null
  const ms = new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return roundHoursToQuarter(ms / 3_600_000)
}

function formatHours(hours: number): string {
  return `${hours.toLocaleString(undefined, { maximumFractionDigits: 2 })} hr${hours === 1 ? '' : 's'}`
}

/**
 * A crew member's own punches for one week.
 *
 * The clock has been in their pocket since July and they have never been able to see what
 * it recorded — the one question they had to ring the office to ask. RLS already limits
 * time_entries to the caller's own rows (`time_entries_hr_select` →
 * `time_entry_matches_linked_person`), so this is the ordinary range query; nothing here
 * grants anything.
 *
 * Hours only. Pay needs the piece-progress work in Phase 3, and showing a number that
 * later moves would be worse than showing none.
 */
export function CrewHoursPage() {
  const [weekStart, setWeekStart] = useState(() =>
    toDateKey(startOfWeek(parseISO(todayKey()), { weekStartsOn: 1 })),
  )
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [loading, setLoading] = useState(true)

  const weekEnd = useMemo(() => toDateKey(addDays(parseISO(weekStart), 6)), [weekStart])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setEntries(await fetchEntriesForRange({ from: weekStart, to: weekEnd }))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load your hours')
    } finally {
      setLoading(false)
    }
  }, [weekStart, weekEnd])

  useEffect(() => {
    void load()
  }, [load])

  const byDay = useMemo(() => {
    const map = new Map<string, TimeEntry[]>()
    for (const entry of entries) {
      const key = toDateKey(new Date(entry.clock_in))
      const list = map.get(key)
      if (list) list.push(entry)
      else map.set(key, [entry])
    }
    return map
  }, [entries])

  const total = useMemo(
    () => entries.reduce((sum, entry) => sum + (entryHours(entry) ?? 0), 0),
    [entries],
  )
  const openPunches = entries.filter((e) => !e.clock_out).length
  const isThisWeek = weekStart === toDateKey(startOfWeek(parseISO(todayKey()), { weekStartsOn: 1 }))

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Previous week"
          onClick={() => setWeekStart(toDateKey(addDays(parseISO(weekStart), -7)))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="text-center">
          <p className="text-sm font-semibold">
            {format(parseISO(weekStart), 'MMM d')} – {format(parseISO(weekEnd), 'MMM d')}
          </p>
          {isThisWeek ? <p className="text-xs text-muted-foreground">This week</p> : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Next week"
          disabled={isThisWeek}
          onClick={() => setWeekStart(toDateKey(addDays(parseISO(weekStart), 7)))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <Clock className="size-4" />
              My hours
            </span>
            <span className="tabular-nums">{formatHours(total)}</span>
          </CardTitle>
          {openPunches > 0 ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {openPunches} punch{openPunches === 1 ? '' : 'es'} still running — not counted in
              the total until you clock out.
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {loading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-muted-foreground">No hours clocked this week.</p>
          ) : (
            [...byDay.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([day, dayEntries]) => {
                const dayTotal = dayEntries.reduce((s, e) => s + (entryHours(e) ?? 0), 0)
                return (
                  <div key={day} className="space-y-1.5">
                    <div className="flex items-baseline justify-between border-b pb-1">
                      <span className="font-medium">{format(parseISO(day), 'EEEE, MMM d')}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatHours(dayTotal)}
                      </span>
                    </div>
                    {dayEntries.map((entry) => {
                      const hours = entryHours(entry)
                      return (
                        <div key={entry.id} className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate">
                            {entry.project_name || 'No job recorded'}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {format(new Date(entry.clock_in), 'h:mm a')}
                            {' – '}
                            {entry.clock_out
                              ? format(new Date(entry.clock_out), 'h:mm a')
                              : 'running'}
                            {hours != null ? ` · ${formatHours(hours)}` : ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )
              })
          )}
        </CardContent>
      </Card>

      <p className="px-1 text-xs text-muted-foreground">
        Hours as the clock recorded them, rounded to the quarter hour. Pay is worked out by
        the office — if something here looks wrong, message them on the job.
      </p>
    </div>
  )
}
