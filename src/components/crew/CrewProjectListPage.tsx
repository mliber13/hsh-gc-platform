import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import {
  CalendarDays,
  CalendarRange,
  ChevronRight,
  List,
  MapPin,
  Plus,
  RefreshCw,
  Users,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { usePermissions } from '@/hooks/usePermissions'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { isCrewRole } from '@/lib/rbac'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  CrewProfileNotLinkedError,
  fetchCrewProjectList,
  personIsForeman,
  type CrewListScope,
} from '@/services/crewWorkspaceService'
import { fetchTeam } from '@/services/hrTeamService'
import type { CrewProjectListItem } from '@/types/crew'
import {
  CrewForemanScheduleAddSheet,
  type ForemanAddSheetProject,
} from '@/components/crew/CrewForemanScheduleAddSheet'
import { CrewScheduleCalendar } from '@/components/crew/CrewScheduleCalendar'
import { drywallStatusLabel, drywallStatusPillClass } from '@/lib/drywall/crewStatusStyles'
import {
  crewMeasureStatusLabel,
  crewMeasureStatusPillClass,
} from '@/lib/drywall/crewMeasureStatus'
import {
  SCHEDULE_PHASE_LABELS,
  SCHEDULE_PHASE_ORDER,
  type SchedulePhase,
} from '@/components/drywall/schedule/scheduleItemStatusStyles'

const FILTER_ALL = 'all'

function parseScope(raw: string | null): CrewListScope {
  return raw === 'all' ? 'all' : 'mine'
}

function displayAssigneeNames(item: CrewProjectListItem): string {
  const names = item.assignedPersonNames.filter(Boolean)
  return names.length > 0 ? names.join(', ') : 'Unassigned'
}

export function CrewProjectListPage() {
  const { isFieldForeman, effectiveRole } = usePermissions()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isOperator = !isCrewRole(effectiveRole)
  const viewAsPersonId = isOperator ? searchParams.get('as') : null
  const scope = parseScope(searchParams.get('scope'))

  const [items, setItems] = useState<CrewProjectListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewIsForeman, setPreviewIsForeman] = useState(false)
  const [previewFirstName, setPreviewFirstName] = useState<string | null>(null)

  const [phaseFilter, setPhaseFilter] = useState(FILTER_ALL)
  const [jobFilter, setJobFilter] = useState(FILTER_ALL)
  const [personFilter, setPersonFilter] = useState(FILTER_ALL)

  const [addOpen, setAddOpen] = useState(false)
  const [pickerProjects, setPickerProjects] = useState<ForemanAddSheetProject[]>([])
  const [displayMode, setDisplayMode] = useState<'list' | 'calendar'>('list')
  const displayModeTouched = useRef(false)

  const isForemanView = isFieldForeman || previewIsForeman
  // Only a real field foreman (not an operator preview) can write.
  const canAddSchedule = isFieldForeman && !isOperator

  // Foremen get the schedule calendar by default; others only ever see the list.
  useEffect(() => {
    if (!displayModeTouched.current) {
      setDisplayMode(isForemanView ? 'calendar' : 'list')
    }
  }, [isForemanView])

  const chooseDisplayMode = (mode: 'list' | 'calendar') => {
    displayModeTouched.current = true
    setDisplayMode(mode)
  }

  const jobsLabel = (() => {
    const base = scope === 'all' ? 'All jobs' : 'My jobs'
    if (viewAsPersonId && previewIsForeman && previewFirstName) {
      return `${base} (${previewFirstName} — foreman preview)`
    }
    return base
  })()
  usePageTitle(jobsLabel)

  useEffect(() => {
    if (!viewAsPersonId) {
      setPreviewIsForeman(false)
      setPreviewFirstName(null)
      return
    }
    let cancelled = false
    void Promise.all([personIsForeman(viewAsPersonId), fetchTeam().catch(() => null)]).then(
      ([isForeman, team]) => {
        if (cancelled) return
        setPreviewIsForeman(isForeman)
        if (isForeman && team) {
          const member =
            team.employees.find((e) => e.id === viewAsPersonId) ??
            team.contractors1099.find((c) => c.id === viewAsPersonId)
          setPreviewFirstName(member?.name?.trim().split(/\s+/)[0] ?? 'crew')
        } else {
          setPreviewFirstName(null)
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [viewAsPersonId])

  // Reset filters when scope / view-as changes.
  useEffect(() => {
    setPhaseFilter(FILTER_ALL)
    setJobFilter(FILTER_ALL)
    setPersonFilter(FILTER_ALL)
  }, [scope, viewAsPersonId, isForemanView])

  const setScope = (next: CrewListScope) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'mine') params.delete('scope')
    else params.set('scope', 'all')
    setSearchParams(params, { replace: true })
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchCrewProjectList({
        viewAsPersonId: viewAsPersonId ?? undefined,
        scope,
      })
      setItems(data)
    } catch (e) {
      if (e instanceof CrewProfileNotLinkedError) {
        setError(e.message)
      } else {
        console.error('fetchCrewProjectList failed:', e)
        setError('Could not load your jobs. Try again or contact the office.')
      }
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [viewAsPersonId, scope])

  useEffect(() => {
    void load()
  }, [load])

  const { pullDistance, refreshing } = usePullToRefresh(load)

  const phaseOptions = useMemo(() => {
    const present = new Set<SchedulePhase>()
    for (const item of items) {
      if (item.phase) present.add(item.phase)
    }
    return SCHEDULE_PHASE_ORDER.filter((p) => present.has(p))
  }, [items])

  const jobOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const item of items) {
      if (!byId.has(item.projectId)) byId.set(item.projectId, item.projectName)
    }
    return [...byId.entries()]
      .map(([projectId, projectName]) => ({ projectId, projectName }))
      .sort((a, b) => a.projectName.localeCompare(b.projectName))
  }, [items])

  const personOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const item of items) {
      for (let i = 0; i < item.assignedPersonIds.length; i++) {
        const id = item.assignedPersonIds[i]
        if (!id || byId.has(id)) continue
        const name = item.assignedPersonNames[i]?.trim()
        byId.set(id, name || 'Crew member')
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [items])

  const filtersActive =
    phaseFilter !== FILTER_ALL || jobFilter !== FILTER_ALL || personFilter !== FILTER_ALL

  const filteredItems = useMemo(() => {
    if (!isForemanView) return items
    return items.filter((item) => {
      if (phaseFilter !== FILTER_ALL && item.phase !== phaseFilter) return false
      if (jobFilter !== FILTER_ALL && item.projectId !== jobFilter) return false
      if (
        personFilter !== FILTER_ALL &&
        !item.assignedPersonIds.includes(personFilter)
      ) {
        return false
      }
      return true
    })
  }, [items, isForemanView, phaseFilter, jobFilter, personFilter])

  const clearFilters = () => {
    setPhaseFilter(FILTER_ALL)
    setJobFilter(FILTER_ALL)
    setPersonFilter(FILTER_ALL)
  }

  const selectClassName =
    'h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground'

  const filterBar =
    isForemanView && items.length > 0 ? (
      <div className="space-y-2 rounded-lg border bg-muted/30 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="crew-filter-phase">
            Phase
          </label>
          <select
            id="crew-filter-phase"
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
          <label className="sr-only" htmlFor="crew-filter-job">
            Job
          </label>
          <select
            id="crew-filter-job"
            className={selectClassName}
            value={jobFilter}
            onChange={(e) => setJobFilter(e.target.value)}
          >
            <option value={FILTER_ALL}>All jobs</option>
            {jobOptions.map((job) => (
              <option key={job.projectId} value={job.projectId}>
                {job.projectName}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="crew-filter-person">
            Person
          </label>
          <select
            id="crew-filter-person"
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
              Showing {filteredItems.length} of {items.length}
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
    ) : null

  const scopeToggle =
    isForemanView ? (
      <div
        className="flex rounded-lg border bg-muted/40 p-0.5"
        role="group"
        aria-label="Job list scope"
      >
        <button
          type="button"
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            scope === 'mine'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          aria-pressed={scope === 'mine'}
          onClick={() => setScope('mine')}
        >
          My jobs
        </button>
        <button
          type="button"
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            scope === 'all'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
          aria-pressed={scope === 'all'}
          onClick={() => setScope('all')}
        >
          All jobs
        </button>
      </div>
    ) : null

  const viewToggle = isForemanView ? (
    <div
      className="flex rounded-lg border bg-muted/40 p-0.5"
      role="group"
      aria-label="View mode"
    >
      <button
        type="button"
        className={cn(
          'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
          displayMode === 'calendar'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
        aria-pressed={displayMode === 'calendar'}
        onClick={() => chooseDisplayMode('calendar')}
      >
        <CalendarRange className="size-4" />
        Calendar
      </button>
      <button
        type="button"
        className={cn(
          'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
          displayMode === 'list'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
        aria-pressed={displayMode === 'list'}
        onClick={() => chooseDisplayMode('list')}
      >
        <List className="size-4" />
        List
      </button>
    </div>
  ) : null

  const openProject = (projectId: string) => {
    const params = new URLSearchParams()
    if (viewAsPersonId) params.set('as', viewAsPersonId)
    if (scope === 'all') params.set('scope', 'all')
    const q = params.toString()
    navigate(`/crew/projects/${projectId}${q ? `?${q}` : ''}`)
  }

  const openAdd = async () => {
    setAddOpen(true)
    try {
      // All foreman-visible jobs for the picker, independent of current scope/filters.
      const all = await fetchCrewProjectList({ scope: 'all' })
      const byId = new Map<string, string>()
      for (const it of all) {
        if (!byId.has(it.projectId)) byId.set(it.projectId, it.projectName)
      }
      setPickerProjects(
        [...byId.entries()]
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      )
    } catch {
      setPickerProjects(jobOptions.map((j) => ({ id: j.projectId, name: j.projectName })))
    }
  }

  const addButton = canAddSchedule ? (
    <Button type="button" className="w-full gap-1.5" onClick={() => void openAdd()}>
      <Plus className="size-4" />
      Add schedule item
    </Button>
  ) : null

  const addSheet = canAddSchedule ? (
    <CrewForemanScheduleAddSheet
      open={addOpen}
      onOpenChange={setAddOpen}
      projects={pickerProjects}
      onSaved={() => void load()}
    />
  ) : null

  // Foreman calendar view — self-contained (loads its own cross-project data),
  // so it renders independently of the task-list load/empty states.
  if (isForemanView && displayMode === 'calendar') {
    return (
      <div className="space-y-3 pb-8">
        {scopeToggle}
        {viewToggle}
        {addButton}
        {addSheet}
        <CrewScheduleCalendar onItemClick={(item) => openProject(item.projectId)} />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {scopeToggle}
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      </div>
    )
  }

  if (error) {
    const isOperatorExplainer =
      !viewAsPersonId && error.includes('not linked') && isOperator
    return (
      <div className="space-y-3">
        {scopeToggle}
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="max-w-sm text-sm text-muted-foreground">
            {isOperatorExplainer
              ? 'Operator preview: use View as to see a crew member’s assigned jobs, or assign team members on schedule items in the Schedule workspace.'
              : error}
          </p>
          {!isOperatorExplainer ? (
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw className="mr-2 size-4" />
              Retry
            </Button>
          ) : null}
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="space-y-3">
        {scopeToggle}
        {viewToggle}
        {addButton}
        {addSheet}
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 px-4 text-center">
          <CalendarDays className="size-10 text-muted-foreground/50" />
          <h2 className="text-lg font-semibold">
            {scope === 'all' && isForemanView ? 'No jobs right now' : 'No assigned jobs'}
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            {viewAsPersonId
              ? scope === 'all'
                ? 'No current or upcoming drywall schedule items.'
                : 'This crew member has no schedule assignments in the current workspace.'
              : scope === 'all' && isForemanView
                ? 'No current or upcoming drywall schedule items.'
                : 'Check with your office about scheduling.'}
          </p>
        </div>
      </div>
    )
  }

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const openTask = (item: CrewProjectListItem) => {
    const params = new URLSearchParams()
    if (viewAsPersonId) params.set('as', viewAsPersonId)
    if (scope === 'all') params.set('scope', 'all')
    params.set('item', item.scheduleItemId)
    navigate(`/crew/projects/${item.projectId}?${params.toString()}`)
  }

  return (
    <div
      className="space-y-3 pb-8"
      style={{
        transform: `translateY(${pullDistance}px)`,
        transition: pullDistance === 0 ? 'transform 200ms' : 'none',
      }}
    >
      {pullDistance > 0 || refreshing ? (
        <div
          className="pointer-events-none fixed left-0 right-0 top-14 flex justify-center"
          style={{ opacity: Math.min(1, pullDistance / 70) }}
        >
          <div className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow">
            {refreshing ? 'Refreshing…' : pullDistance >= 70 ? 'Release to refresh' : 'Pull to refresh'}
          </div>
        </div>
      ) : null}

      {scopeToggle}
      {viewToggle}
      {addButton}
      {addSheet}
      {filterBar}

      <p className="text-sm text-muted-foreground">
        {filtersActive
          ? `${filteredItems.length} of ${items.length} task${items.length === 1 ? '' : 's'}`
          : `${items.length} upcoming task${items.length === 1 ? '' : 's'}`}
        {!filtersActive && scope === 'mine' && !viewAsPersonId ? ' for you' : ''}
        {!filtersActive && scope === 'all' ? ' across all jobs' : ''}
      </p>

      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">No tasks match these filters.</p>
          <button
            type="button"
            className="text-sm font-medium text-primary hover:underline"
            onClick={clearFilters}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
          const startLabel = format(parseISO(item.scheduleItemDate), 'EEE MMM d')
          const isRange = item.scheduleItemEndDate !== item.scheduleItemDate
          const dateLabel = isRange
            ? `${startLabel} – ${format(parseISO(item.scheduleItemEndDate), 'EEE MMM d')}`
            : startLabel
          const isToday =
            todayStr >= item.scheduleItemDate && todayStr <= item.scheduleItemEndDate

          return (
            <Card
              key={item.scheduleItemId}
              className="cursor-pointer transition-colors hover:bg-muted/30 active:bg-muted/50"
              onClick={() => openTask(item)}
            >
              <CardContent className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-base font-semibold leading-snug">{item.projectName}</h3>
                    <div className="flex flex-wrap items-start justify-end gap-2">
                      {item.measureWorkflowStatus ? (
                        <span className={crewMeasureStatusPillClass(item.measureWorkflowStatus)}>
                          Measure: {crewMeasureStatusLabel(item.measureWorkflowStatus)}
                        </span>
                      ) : null}
                      <span className={drywallStatusPillClass(item.status)}>
                        {drywallStatusLabel(item.status)}
                      </span>
                    </div>
                  </div>
                  {item.client ? (
                    <p className="text-sm text-muted-foreground">{item.client}</p>
                  ) : null}
                  {item.address ? (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" />
                      <span className="truncate">{item.address}</span>
                    </p>
                  ) : null}
                  <p className="text-sm font-medium text-foreground">{item.scheduleItemName}</p>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarDays className="size-3.5 shrink-0" />
                    {isToday ? (
                      <span className="font-semibold text-primary">Today · {dateLabel}</span>
                    ) : (
                      dateLabel
                    )}
                  </p>
                  {isForemanView ? (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Users className="size-3.5 shrink-0" />
                      <span className="truncate">{displayAssigneeNames(item)}</span>
                    </p>
                  ) : null}
                  {item.scheduleItemNotes ? (
                    <p className="whitespace-pre-line rounded-md bg-muted/40 p-2 text-xs leading-snug text-muted-foreground">
                      {item.scheduleItemNotes}
                    </p>
                  ) : null}
                </div>
                <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          )
          })}
        </div>
      )}
    </div>
  )
}
