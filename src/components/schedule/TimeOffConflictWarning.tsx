import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  fetchPersonUnavailability,
  findTimeOffConflicts,
  type ScheduleUnavailability,
} from '@/services/personUnavailabilityService'

type Props = {
  assignedPersonIds: string[]
  startDate: string
  endDate: string
}

function fmt(d: string): string {
  const parsed = new Date(`${d}T00:00:00`)
  return Number.isNaN(parsed.getTime())
    ? d
    : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/**
 * Non-blocking warning shown when any assigned person has time off overlapping
 * the item's dates. Self-contained: loads org time off once on mount.
 */
export function TimeOffConflictWarning({ assignedPersonIds, startDate, endDate }: Props) {
  const [unavailability, setUnavailability] = useState<ScheduleUnavailability[]>([])

  useEffect(() => {
    let cancelled = false
    void fetchPersonUnavailability()
      .then((rows) => {
        if (!cancelled) setUnavailability(rows)
      })
      .catch(() => {
        if (!cancelled) setUnavailability([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const conflicts = findTimeOffConflicts(
    unavailability,
    assignedPersonIds,
    startDate,
    endDate || startDate,
  )
  if (conflicts.length === 0) return null

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
      <p className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-200">
        <AlertTriangle className="size-4 shrink-0" />
        Time-off conflict
      </p>
      <ul className="mt-1 space-y-0.5 text-amber-800/90 dark:text-amber-200/90">
        {conflicts.map((c) => (
          <li key={c.id}>
            <span className="font-medium">{c.personName}</span> is off {fmt(c.startDate)}–
            {fmt(c.endDate)}
            {c.reason ? ` (${c.reason})` : ''}
          </li>
        ))}
      </ul>
    </div>
  )
}
