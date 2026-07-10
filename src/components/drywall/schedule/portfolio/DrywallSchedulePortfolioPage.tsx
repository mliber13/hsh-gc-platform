import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarRange, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
  SCHEDULE_PHASE_ORDER,
  type SchedulePhase,
} from '@/components/drywall/schedule/scheduleItemStatusStyles'
import { ScheduleItemDialog } from '../ScheduleItemDialog'
import { DrywallPortfolioCalendar } from './DrywallPortfolioCalendar'
import { DrywallPortfolioList } from './DrywallPortfolioList'
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
type DisplayMode = 'calendar' | 'list'

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
  const [displayMode, setDisplayMode] = useState<DisplayMode>('calendar')
  const [anchorDate, setAnchorDate] = useState(() => new Date())
  const [dialog, setDialog] = useState<DialogState>({ open: false })
  const [personNames, setPersonNames] = useState<Map<string, string>>(new Map())
  const [excludedProjectIds, setExcludedProjectIds] = useState<Set<string>>(() => new Set())
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(() => new Set())
  const [selectedPhases, setSelectedPhases] = useState<Set<SchedulePhase>>(() => new Set())
  const [expandAll, setExpandAll] = useState(false)

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
    setExpandAll(false)
  }, [rangeStart, viewWindow])

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
    return [...phases].sort(
      (a, b) => SCHEDULE_PHASE_ORDER.indexOf(a) - SCHEDULE_PHASE_ORDER.indexOf(b),
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
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <CalendarRange className="size-7" />
          Drywall — Schedule
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          All drywall jobs on one calendar — click a bar to open that project&apos;s schedule.
        </p>
      </div>

      <div className="relative flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border/60 bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => setDisplayMode('calendar')}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                displayMode === 'calendar'
                  ? 'bg-card text-foreground shadow'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Calendar
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('list')}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                displayMode === 'list'
                  ? 'bg-card text-foreground shadow'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              List
            </button>
          </div>

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

          {legendProjects.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs">
                  Projects ▾
                  {excludedProjectIds.size > 0 && (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                      {excludedProjectIds.size}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Projects
                  </span>
                  {excludedProjectIds.size > 0 && (
                    <button
                      type="button"
                      className="text-xs text-primary underline-offset-2 hover:underline"
                      onClick={() => setExcludedProjectIds(new Set())}
                    >
                      Show all
                    </button>
                  )}
                </div>
                <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                  {legendProjects.map((project) => {
                    const colors = projectColorClass(project.id)
                    const included = !excludedProjectIds.has(project.id)
                    return (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => toggleProject(project.id)}
                        className={cn(
                          'flex w-full items-center justify-start gap-1.5 rounded-md border px-2.5 py-0.5 text-xs transition-colors',
                          included
                            ? 'border-border bg-card text-foreground'
                            : 'border-border/60 bg-muted/40 text-muted-foreground opacity-60',
                        )}
                      >
                        <span
                          className={cn('size-2.5 shrink-0 rounded-sm border', colors.bg, colors.border)}
                          aria-hidden
                        />
                        <span className="truncate font-medium">{project.name}</span>
                      </button>
                    )
                  })}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {personOptions.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs">
                  People ▾
                  {selectedPersonIds.size > 0 && (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                      {selectedPersonIds.size}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    People
                  </span>
                  {selectedPersonIds.size > 0 && (
                    <button
                      type="button"
                      className="text-xs text-primary underline-offset-2 hover:underline"
                      onClick={() => setSelectedPersonIds(new Set())}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
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
                          'flex w-full justify-start rounded-md border px-2.5 py-0.5 text-left text-xs font-medium transition-colors',
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
              </PopoverContent>
            </Popover>
          )}

          {phaseOptions.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs">
                  Phase ▾
                  {selectedPhases.size > 0 && (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                      {selectedPhases.size}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Phase
                  </span>
                  {selectedPhases.size > 0 && (
                    <button
                      type="button"
                      className="text-xs text-primary underline-offset-2 hover:underline"
                      onClick={() => setSelectedPhases(new Set())}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
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
                          'flex w-full justify-start rounded-md border px-2.5 py-0.5 text-left text-xs font-medium transition-colors',
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
              </PopoverContent>
            </Popover>
          )}
        </div>

        <div className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1">
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
            size="icon"
            className="h-8 w-8"
            onClick={() => setAnchorDate((d) => shiftPortfolioAnchor(d, viewWindow, 1))}
            aria-label="Next range"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAnchorDate(new Date())}
          >
            Today
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setExpandAll((value) => !value)}
          >
            {expandAll ? 'Collapse all' : 'Expand all'}
          </Button>
          <Button type="button" variant="outline" size="icon" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" />
            <span className="sr-only">Refresh</span>
          </Button>
        </div>
      </div>

      {displayMode === 'list' ? (
        <DrywallPortfolioList
          items={filteredItems}
          personNames={personNames}
          rangeLabel={rangeLabel}
          onItemClick={handleItemClick}
        />
      ) : (
        <DrywallPortfolioCalendar
          items={filteredItems}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          viewWindow={viewWindow}
          referenceMonth={referenceMonth}
          rangeLabel={rangeLabel}
          expandAll={expandAll}
          onItemClick={handleItemClick}
        />
      )}

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
