import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarRange, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { projectColorClass } from '@/lib/drywall/projectColor'
import { cn } from '@/lib/utils'
import {
  fetchCrossProjectScheduleItems,
  type CrossProjectScheduleItem,
} from '@/services/drywallScheduleAggregateService'
import {
  fetchScheduleItemsForDrywallProject,
  type DrywallProjectScheduleItem,
} from '@/services/scheduleService'
import { fetchTeam } from '@/services/hrTeamService'
import { isDrywallProjectClosed } from '@/types/drywall'
import {
  phaseForScheduleItem,
  SCHEDULE_PHASE_LABELS,
  type SchedulePhase,
} from '@/components/drywall/schedule/scheduleItemStatusStyles'
import { ScheduleItemDialog } from '../ScheduleItemDialog'
import { DrywallPortfolioCalendar } from './DrywallPortfolioCalendar'
import {
  computePortfolioRange,
  filterPortfolioItemsInRange,
  formatPortfolioRangeLabel,
  shiftPortfolioAnchor,
  toggleSetMembership,
  type PortfolioViewWindow,
} from './portfolioScheduleRange'

type DialogState =
  | { open: false }
  | {
      open: true
      projectId: string
      siblings: DrywallProjectScheduleItem[]
      editing: DrywallProjectScheduleItem | null
    }

type ScopeFilter = 'active' | 'all'

const VIEW_WINDOW_OPTIONS: { value: PortfolioViewWindow; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'twoWeek', label: '2 Weeks' },
  { value: 'month', label: 'Month' },
]

export function DrywallSchedulePortfolioPage() {
  usePageTitle('Drywall — Schedule')

  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<CrossProjectScheduleItem[]>([])
  const [scope, setScope] = useState<ScopeFilter>('active')
  const [viewWindow, setViewWindow] = useState<PortfolioViewWindow>('month')
  const [anchorDate, setAnchorDate] = useState(() => new Date())
  const [dialog, setDialog] = useState<DialogState>({ open: false })
  const [personNames, setPersonNames] = useState<Map<string, string>>(new Map())
  const [excludedProjectIds, setExcludedProjectIds] = useState<Set<string>>(() => new Set())
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(() => new Set())
  const [selectedPhases, setSelectedPhases] = useState<Set<SchedulePhase>>(() => new Set())
  const [filtersOpen, setFiltersOpen] = useState(true)

  const { rangeStart, rangeEnd, referenceMonth } = useMemo(
    () => computePortfolioRange(anchorDate, viewWindow),
    [anchorDate, viewWindow],
  )
  const rangeLabel = useMemo(
    () => formatPortfolioRangeLabel(rangeStart, rangeEnd, viewWindow),
    [rangeStart, rangeEnd, viewWindow],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchCrossProjectScheduleItems()
      setItems(rows)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load schedule')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    let cancelled = false
    void fetchTeam()
      .then((team) => {
        if (cancelled) return
        const names = new Map<string, string>()
        for (const e of team.employees) names.set(e.id, e.name)
        for (const c of team.contractors1099) names.set(c.id, c.name)
        setPersonNames(names)
      })
      .catch((e) => {
        console.warn('fetchTeam for schedule filters:', e)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const scopedItems = useMemo(() => {
    if (scope === 'all') return items
    return items.filter((item) => !isDrywallProjectClosed(item.projectStatus))
  }, [items, scope])

  const itemsInRange = useMemo(
    () => filterPortfolioItemsInRange(scopedItems, rangeStart, rangeEnd),
    [scopedItems, rangeStart, rangeEnd],
  )

  const legendProjects = useMemo(() => {
    const byId = new Map<string, string>()
    for (const item of itemsInRange) {
      if (!byId.has(item.projectId)) byId.set(item.projectId, item.projectName)
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [itemsInRange])

  const personOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const item of itemsInRange) {
      for (const id of item.assignedPersons) ids.add(id)
    }
    return [...ids]
      .map((id) => ({ id, name: personNames.get(id) ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [itemsInRange, personNames])

  const phaseOptions = useMemo(() => {
    const phases = new Set<SchedulePhase>()
    for (const item of itemsInRange) phases.add(phaseForScheduleItem(item))
    return [...phases].sort((a, b) =>
      SCHEDULE_PHASE_LABELS[a].localeCompare(SCHEDULE_PHASE_LABELS[b]),
    )
  }, [itemsInRange])

  const filteredItems = useMemo(() => {
    return itemsInRange.filter((item) => {
      if (excludedProjectIds.has(item.projectId)) return false
      if (
        selectedPersonIds.size > 0 &&
        !item.assignedPersons.some((id) => selectedPersonIds.has(id))
      ) {
        return false
      }
      if (selectedPhases.size > 0 && !selectedPhases.has(phaseForScheduleItem(item))) {
        return false
      }
      return true
    })
  }, [itemsInRange, excludedProjectIds, selectedPersonIds, selectedPhases])

  const toggleProject = (projectId: string) => {
    setExcludedProjectIds((current) => toggleSetMembership(current, projectId))
  }

  const handleItemClick = async (item: CrossProjectScheduleItem) => {
    try {
      const siblings = await fetchScheduleItemsForDrywallProject(item.projectId)
      const editing = siblings.find((s) => s.id === item.id) ?? null
      if (!editing) {
        toast.error('Schedule item no longer exists. Refresh the calendar.')
        return
      }
      setDialog({
        open: true,
        projectId: item.projectId,
        siblings,
        editing,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to open schedule item')
    }
  }

  const handleDialogSaved = () => {
    setDialog({ open: false })
    void load()
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <CalendarRange className="size-7" />
            Drywall — Schedule
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            All drywall jobs on one calendar — click a bar to open that project&apos;s schedule.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border/60 bg-muted/30 p-0.5">
            {VIEW_WINDOW_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setViewWindow(opt.value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  viewWindow === opt.value
                    ? 'bg-card text-foreground shadow'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex rounded-lg border border-border/60 bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => setScope('active')}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                scope === 'active'
                  ? 'bg-card text-foreground shadow'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setScope('all')}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                scope === 'all'
                  ? 'bg-card text-foreground shadow'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              All
            </button>
          </div>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setAnchorDate((d) => shiftPortfolioAnchor(d, viewWindow, -1))}
              aria-label="Previous range"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[10rem] text-center text-sm font-semibold">{rangeLabel}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAnchorDate(new Date())}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setAnchorDate((d) => shiftPortfolioAnchor(d, viewWindow, 1))}
              aria-label="Next range"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <Button type="button" variant="outline" size="icon" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
            <span className="sr-only">Refresh</span>
          </Button>
        </div>
      </div>

      {(legendProjects.length > 0 || personOptions.length > 0 || phaseOptions.length > 0) && (
        <div className="rounded-lg border border-border/60 bg-muted/10">
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <span>Filters</span>
            <span>{filtersOpen ? '−' : '+'}</span>
          </button>
          {filtersOpen && (
            <div className="space-y-2 border-t border-border/60 px-3 pb-3 pt-2">
              {legendProjects.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Projects
                  </span>
                  {legendProjects.map((project) => {
                    const colors = projectColorClass(project.id)
                    const included = !excludedProjectIds.has(project.id)
                    return (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => toggleProject(project.id)}
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                          included
                            ? 'border-border bg-card text-foreground'
                            : 'border-border/60 bg-muted/40 text-muted-foreground opacity-60',
                        )}
                      >
                        <span
                          className={cn('size-2.5 shrink-0 rounded-sm border', colors.bg, colors.border)}
                          aria-hidden
                        />
                        <span className="max-w-[12rem] truncate font-medium">{project.name}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {personOptions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    People
                  </span>
                  {personOptions.map((person) => {
                    const active =
                      selectedPersonIds.size === 0 || selectedPersonIds.has(person.id)
                    return (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() =>
                          setSelectedPersonIds((current) =>
                            toggleSetMembership(current, person.id),
                          )
                        }
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                          active
                            ? 'border-border bg-card text-foreground'
                            : 'border-border/60 bg-muted/40 text-muted-foreground opacity-60',
                        )}
                      >
                        {person.name}
                      </button>
                    )
                  })}
                </div>
              )}

              {phaseOptions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Phase
                  </span>
                  {phaseOptions.map((phase) => {
                    const active = selectedPhases.size === 0 || selectedPhases.has(phase)
                    return (
                      <button
                        key={phase}
                        type="button"
                        onClick={() =>
                          setSelectedPhases((current) => toggleSetMembership(current, phase))
                        }
                        className={cn(
                          'rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
                          active
                            ? 'border-border bg-card text-foreground'
                            : 'border-border/60 bg-muted/40 text-muted-foreground opacity-60',
                        )}
                      >
                        {SCHEDULE_PHASE_LABELS[phase]}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <DrywallPortfolioCalendar
        items={filteredItems}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        viewWindow={viewWindow}
        referenceMonth={referenceMonth}
        rangeLabel={rangeLabel}
        onItemClick={handleItemClick}
      />

      {dialog.open && (
        <ScheduleItemDialog
          open={dialog.open}
          onOpenChange={(open) => {
            if (!open) setDialog({ open: false })
          }}
          projectId={dialog.projectId}
          siblingItems={dialog.siblings}
          editing={dialog.editing}
          onSaved={handleDialogSaved}
        />
      )}
    </div>
  )
}
