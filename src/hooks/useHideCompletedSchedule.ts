import { useCallback, useState } from 'react'

/**
 * "Hide completed" on the schedule — remembered across visits.
 *
 * One key for every schedule surface (the per-project editor and the cross-project portfolio,
 * and the calendar and list inside each), because a preference that applies in one view and
 * not another is worse than no preference at all.
 *
 * **Why completed and not past**, since the two were weighed: completion is marked on only
 * 12% of past items (45 of 370) — the rest were never ticked off — so this hides far less
 * than a date filter would. Mark's call, 2026-10-06, knowing that: he would rather the habit
 * of marking items complete pull its own weight than hide work on a date nobody confirmed.
 * Completions are also climbing (10 in August, 24 in September, 14 in the first six days of
 * October), so the filter gets more useful on its own.
 *
 * Per-browser only. localStorage can throw or come back empty — private window, cleared site
 * data — so every access is guarded and the default is to show everything.
 */
const HIDE_COMPLETED_KEY = 'hsh.schedule.hideCompleted'

function readStored(): boolean {
  try {
    return window.localStorage.getItem(HIDE_COMPLETED_KEY) === '1'
  } catch {
    return false
  }
}

export function useHideCompletedSchedule(): {
  hideCompleted: boolean
  toggleHideCompleted: () => void
} {
  const [hideCompleted, setHideCompleted] = useState(readStored)

  const toggleHideCompleted = useCallback(() => {
    setHideCompleted((current) => {
      const next = !current
      try {
        window.localStorage.setItem(HIDE_COMPLETED_KEY, next ? '1' : '0')
      } catch {
        // non-fatal: the toggle just won't be remembered next time
      }
      return next
    })
  }, [])

  return { hideCompleted, toggleHideCompleted }
}

/**
 * Drop completed items when the filter is on.
 *
 * Deliberately only `complete` — `delayed` and `in-progress` are both still live work, and
 * hiding a delayed item is how a job goes quiet.
 */
export function applyHideCompleted<T extends { status?: string | null }>(
  items: T[],
  hideCompleted: boolean,
): T[] {
  if (!hideCompleted) return items
  return items.filter((item) => item.status !== 'complete')
}
