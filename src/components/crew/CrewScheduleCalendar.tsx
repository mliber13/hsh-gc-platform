import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DrywallPortfolioCalendar } from '@/components/drywall/schedule/portfolio/DrywallPortfolioCalendar'
import {
  computePortfolioRange,
  formatPortfolioRangeLabel,
  shiftPortfolioAnchor,
  type PortfolioViewWindow,
} from '@/components/drywall/schedule/portfolio/portfolioScheduleRange'
import {
  phaseForScheduleItem,
  SCHEDULE_PHASE_LABELS,
  SCHEDULE_PHASE_ORDER,
  type SchedulePhase,
} from '@/components/drywall/schedule/scheduleItemStatusStyles'
import {
  fetchCrossProjectScheduleItems,
  type CrossProjectScheduleItem,
} from '@/services/drywallScheduleAggregateService'
import { fetchForemanTeamRoster } from '@/services/foremanScheduleService'
import {
  fetchPersonUnavailability,
  type ScheduleUnavailability,
} from '@/services/personUnavailabilityService'

const VIEW_WINDOW: PortfolioViewWindow = 'month'
const FILTER_ALL = 'all'

type Props = {
  onItemClick: (item: CrossProjectScheduleItem) => void
  /** Bump to force a re-fetch (e.g. after an edit saved from the parent). */
  refreshKey?: number
}

/**
 * Foreman schedule calendar for /crew — reuses the operator portfolio calendar
 * (color-coded by job, desktop grid + mobile dot-grid) with month navigation
 * and job / phase / person filters.
 */
export function CrewScheduleCalendar({ onItemClick, refreshKey = 0 }: Props) {
  const [items, setItems] = useState<CrossProjectScheduleItem[]>([])
  const [unavailability, setUnavailability] = useState<ScheduleUnavailability[]>([])
  const [personNames, setPersonNames] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [anchorDate, setAnchorDate] = useState(() => new Date())

  const [jobFilter, setJobFilter] = useState(FILTER_ALL)
  const [phaseFilter, setPhaseFilter] = useState(FILTER_ALL)
  const [personFilter, setPersonFilter] = useState(FILTER_ALL)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      fetchCrossProjectScheduleItems(),
      fetchForemanTeamRoster().catch(() => []),
      fetchPersonUnavailability().catch(() => []),
    ])
      .then(([rows, roster, timeOff]) => {
        if (cancelled) return
        setItems(rows)
        setPersonNames(new Map(roster.map((r) => [r.id, r.name])))
        setUnavailability(timeOff)
        setError(null)
      })
      .catch((e) => {
        if (cancelled) return
        console.error('CrewScheduleCalendar:', e)
        setError('Could not load the schedule')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const { rangeStart, rangeEnd, referenceMonth } = useMemo(
    () => computePortfolioRange(anchorDate, VIEW_WINDOW),
    [anchorDate],
  )
  const rangeLabel = useMemo(
    () => formatPortfolioRangeLabel(rangeStart, rangeEnd, VIEW_WINDOW, referenceMonth),
    [rangeStart, rangeEnd, referenceMonth],
  )

  const jobOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const item of items) {
      if (!byId.has(item.projectId)) byId.set(item.projectId, item.projectName)
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [items])

  const phaseOptions = useMemo(() => {
    const present = new Set<SchedulePhase>()
    for (const item of items) present.add(phaseForScheduleItem(item))
    return SCHEDULE_PHASE_ORDER.filter((p) => present.has(p))
  }, [items])

  const personOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const item of items) {
      for (const id of item.assignedPersons) if (id) ids.add(id)
    }
    return [...ids]
      .map((id) => ({ id, name: personNames.get(id) ?? 'Crew member' }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [items, personNames])

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      if (jobFilter !== FILTER_ALL && item.projectId !== jobFilter) return false
      if (phaseFilter !== FILTER_ALL && phaseForScheduleItem(item) !== phaseFilter) return false
      if (personFilter !== FILTER_ALL && !item.assignedPersons.includes(personFilter)) return false
      if (
        q &&
        !item.projectAddress.toLowerCase().includes(q) &&
        !item.projectName.toLowerCase().includes(q)
      ) {
        return false
      }
      return true
    })
  }, [items, jobFilter, phaseFilter, personFilter, search])

  const filtersActive =
    jobFilter !== FILTER_ALL ||
    phaseFilter !== FILTER_ALL ||
    personFilter !== FILTER_ALL ||
    search.trim() !== ''

  const clearFilters = () => {
    setJobFilter(FILTER_ALL)
    setPhaseFilter(FILTER_ALL)
    setPersonFilter(FILTER_ALL)
    setSearch('')
  }

  const selectClassName =
    'h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground'

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {error}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-base font-semibold">{rangeLabel}</p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Previous month"
            onClick={() => setAnchorDate((d) => shiftPortfolioAnchor(d, VIEW_WINDOW, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setAnchorDate(new Date())}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Next month"
            onClick={() => setAnchorDate((d) => shiftPortfolioAnchor(d, VIEW_WINDOW, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2 rounded-lg border bg-muted/30 p-2">
        <input
          type="search"
          inputMode="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by address or job name…"
          aria-label="Search by address or job name"
          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
        />
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="cal-filter-job">
            Job
          </label>
          <select
            id="cal-filter-job"
            className={selectClassName}
            value={jobFilter}
            onChange={(e) => setJobFilter(e.target.value)}
          >
            <option value={FILTER_ALL}>All jobs</option>
            {jobOptions.map((job) => (
              <option key={job.id} value={job.id}>
                {job.name}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="cal-filter-phase">
            Phase
          </label>
          <select
            id="cal-filter-phase"
            className={selectClassName}
            value={phaseFilter}
            onChange={(e) => setPhaseFilter(e.target.value)}
          >
            <option value={FILTER_ALL}>All phases</option>
            {phaseOptions.map((phase) => (
              <option key={phase} value={phase}>
                {SCHEDULE_PHASE_LABELS[phase]}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="cal-filter-person">
            Person
          </label>
          <select
            id="cal-filter-person"
            className={selectClassName}
            value={personFilter}
            onChange={(e) => setPersonFilter(e.target.value)}
          >
            <option value={FILTER_ALL}>All people</option>
            {personOptions.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </div>
        {filtersActive ? (
          <div className="flex items-center justify-between gap-2 px-0.5">
            <p className="text-xs text-muted-foreground">
              {filteredItems.length} of {items.length} items
            </p>
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          </div>
        ) : null}
      </div>

      <DrywallPortfolioCalendar
        items={filteredItems}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        viewWindow={VIEW_WINDOW}
        referenceMonth={referenceMonth}
        rangeLabel={rangeLabel}
        expandAll={false}
        onItemClick={onItemClick}
        unavailability={unavailability}
      />
    </div>
  )
}
