import { useEffect, useMemo, useState } from 'react'
import {
  addDays,
  differenceInCalendarDays,
  format,
  isSameDay,
  parseISO,
  startOfWeek,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Target } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CommsLogPanel } from '@/components/CommsLogPanel'
import { LogCommsModal } from '@/components/LogCommsModal'
import { SchedulePortfolioInbox } from '@/components/SchedulePortfolioInbox'
import { SchedulePortfolioItemModal } from '@/components/SchedulePortfolioItemModal'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { projectColor } from '@/lib/projectColor'
import {
  fetchPortfolioProjects,
  fetchPortfolioScheduleItems,
  PortfolioItem,
  PortfolioProject,
  PortfolioTypeFilter,
} from '@/services/scheduleService'
import type { InboxEntry } from '@/services/communicationLogService'

const DAY_COUNT = 14
const DAY_WIDTH = 80
const BAR_HEIGHT = 40
const PROJECT_COLUMN_WIDTH = 220

type ScheduleItemLookupRow = {
  id: string
  project_id: string
  schedule_id: string
  name: string
  start_date: string
  end_date: string
  confirmation_status: PortfolioItem['confirmation_status'] | null
  confirmation_notes: string | null
  status: PortfolioItem['status'] | null
  assigned_company_id: string | null
  notes: string | null
  subcontractors?: { name: string | null } | Array<{ name: string | null }> | null
}

const TYPE_FILTERS: Array<{ label: string; value: PortfolioTypeFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'GC', value: 'gc' },
  { label: 'Drywall', value: 'drywall' },
]

function isoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

function barColor(hex: string): string {
  const normalized = hex.replace('#', '')
  const value = Number.parseInt(normalized, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r}, ${g}, ${b}, 0.6)`
}

function assignedCompanyName(
  subcontractors: ScheduleItemLookupRow['subcontractors'],
): string | null {
  if (Array.isArray(subcontractors)) return subcontractors[0]?.name ?? null
  return subcontractors?.name ?? null
}

function toPortfolioItem(row: ScheduleItemLookupRow): PortfolioItem {
  return {
    id: row.id,
    project_id: row.project_id,
    schedule_id: row.schedule_id,
    name: row.name,
    start_date: row.start_date,
    end_date: row.end_date,
    confirmation_status: row.confirmation_status ?? 'unsent',
    confirmation_notes: row.confirmation_notes,
    status: row.status ?? 'not-started',
    assigned_company_id: row.assigned_company_id,
    assigned_company_name: assignedCompanyName(row.subcontractors),
    notes: row.notes,
  }
}

function assignLanes(
  items: PortfolioItem[],
): Array<PortfolioItem & { lane: number }> {
  const sorted = [...items].sort((a, b) =>
    a.start_date.localeCompare(b.start_date),
  )
  const lanes: string[] = []
  const out: Array<PortfolioItem & { lane: number }> = []

  for (const item of sorted) {
    let placed = -1
    for (let i = 0; i < lanes.length; i += 1) {
      if (lanes[i] < item.start_date) {
        placed = i
        break
      }
    }

    if (placed === -1) {
      placed = lanes.length
      lanes.push(item.end_date)
    } else {
      lanes[placed] = item.end_date
    }

    out.push({ ...item, lane: placed })
  }

  return out
}

export function SchedulePortfolio() {
  const navigate = useNavigate()
  const [typeFilter, setTypeFilter] = useState<PortfolioTypeFilter>('all')
  const [windowStart, setWindowStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  )
  const [projects, setProjects] = useState<PortfolioProject[]>([])
  const [includedProjectIds, setIncludedProjectIds] = useState<Set<string>>(
    () => new Set(),
  )
  const [items, setItems] = useState<PortfolioItem[]>([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [itemsLoading, setItemsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modalItem, setModalItem] = useState<PortfolioItem | null>(null)
  const [modalProjectName, setModalProjectName] = useState('')
  const [inboxRefreshKey, setInboxRefreshKey] = useState(0)
  const [commsPanelState, setCommsPanelState] = useState<{
    open: boolean
    projectId: string
    scheduleItem: { id: string; name: string } | null
  }>({ open: false, projectId: '', scheduleItem: null })
  const [logModalState, setLogModalState] = useState<{
    open: boolean
    projectId: string
    scheduleItemId: string | null
  }>({ open: false, projectId: '', scheduleItemId: null })

  const windowEnd = useMemo(
    () => addDays(windowStart, DAY_COUNT - 1),
    [windowStart],
  )
  const days = useMemo(
    () => Array.from({ length: DAY_COUNT }, (_, idx) => addDays(windowStart, idx)),
    [windowStart],
  )
  const visibleProjects = useMemo(
    () => projects.filter((project) => includedProjectIds.has(project.id)),
    [projects, includedProjectIds],
  )
  const visibleProjectIds = useMemo(
    () => visibleProjects.map((project) => project.id),
    [visibleProjects],
  )
  const itemsByProject = useMemo(() => {
    const map = new Map<string, PortfolioItem[]>()
    for (const item of items) {
      if (!map.has(item.project_id)) map.set(item.project_id, [])
      map.get(item.project_id)?.push(item)
    }
    return map
  }, [items])
  const projectNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const project of projects) {
      map.set(project.id, project.name)
    }
    return map
  }, [projects])
  const totalGridWidth = PROJECT_COLUMN_WIDTH + DAY_WIDTH * DAY_COUNT
  const today = new Date()

  useEffect(() => {
    let cancelled = false

    const loadProjects = async () => {
      setProjectsLoading(true)
      setError(null)
      try {
        const nextProjects = await fetchPortfolioProjects(typeFilter)
        if (cancelled) return
        setProjects(nextProjects)
        setIncludedProjectIds(new Set(nextProjects.map((project) => project.id)))
      } catch (loadError) {
        console.error('Failed to load portfolio projects', loadError)
        if (!cancelled) {
          setProjects([])
          setIncludedProjectIds(new Set())
          setError('Could not load schedule projects.')
        }
      } finally {
        if (!cancelled) setProjectsLoading(false)
      }
    }

    void loadProjects()
    return () => {
      cancelled = true
    }
  }, [typeFilter])

  useEffect(() => {
    let cancelled = false

    const loadItems = async () => {
      if (visibleProjectIds.length === 0) {
        setItems([])
        setItemsLoading(false)
        return
      }

      setItemsLoading(true)
      setError(null)
      try {
        const nextItems = await fetchPortfolioScheduleItems(
          visibleProjectIds,
          isoDate(windowStart),
          isoDate(windowEnd),
        )
        if (!cancelled) setItems(nextItems)
      } catch (loadError) {
        console.error('Failed to load portfolio schedule items', loadError)
        if (!cancelled) {
          setItems([])
          setError('Could not load schedule items.')
        }
      } finally {
        if (!cancelled) setItemsLoading(false)
      }
    }

    void loadItems()
    return () => {
      cancelled = true
    }
  }, [visibleProjectIds, windowStart, windowEnd])

  const toggleProject = (projectId: string) => {
    setIncludedProjectIds((current) => {
      const next = new Set(current)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }

  const soloProject = (projectId: string) => {
    setIncludedProjectIds((current) => {
      if (current.size === 1 && current.has(projectId)) {
        return new Set(projects.map((project) => project.id))
      }
      return new Set([projectId])
    })
  }

  const refreshInbox = () => {
    setInboxRefreshKey((key) => key + 1)
  }

  const openItemModal = (item: PortfolioItem, projectNameOverride?: string) => {
    setModalItem(item)
    setModalProjectName(
      projectNameOverride ?? projectNameById.get(item.project_id) ?? '',
    )
  }

  const closeItemModal = () => {
    setModalItem(null)
    refreshInbox()
  }

  const handleInboxClick = async (entry: InboxEntry) => {
    if (!entry.schedule_item_id) {
      // Job-level entry — open whole-job CommsLogPanel in place
      // rather than navigating to per-project. Mirrors item-level
      // entries' "stay in workspace" behavior.
      setCommsPanelState({
        open: true,
        projectId: entry.project_id,
        scheduleItem: null,
      })
      return
    }

    const existingItem = items.find((item) => item.id === entry.schedule_item_id)
    if (existingItem) {
      openItemModal(existingItem, entry.project_name)
      return
    }

    try {
      const { data, error } = await supabase
        .from('schedule_items')
        .select(
          'id, project_id, schedule_id, name, start_date, end_date, confirmation_status, confirmation_notes, status, assigned_company_id, notes, subcontractors:assigned_company_id(name)',
        )
        .eq('id', entry.schedule_item_id)
        .single()

      if (error) throw error
      openItemModal(toPortfolioItem(data as ScheduleItemLookupRow), entry.project_name)
    } catch (loadError) {
      console.error('Failed to load schedule item from inbox', loadError)
      toast.error('Could not open that schedule item.')
    }
  }

  const openModalItemLog = () => {
    if (!modalItem) return
    const itemForLog = modalItem
    setModalItem(null)
    refreshInbox()
    setCommsPanelState({
      open: true,
      projectId: itemForLog.project_id,
      scheduleItem: { id: itemForLog.id, name: itemForLog.name },
    })
  }

  const openModalItemLogEntry = () => {
    if (!modalItem) return
    const itemForLog = modalItem
    setModalItem(null)
    refreshInbox()
    setLogModalState({
      open: true,
      projectId: itemForLog.project_id,
      scheduleItemId: itemForLog.id,
    })
  }

  return (
    <div className="flex h-full min-h-0">
      <main className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {TYPE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setTypeFilter(filter.value)}
                className={cn(
                  'rounded-full border px-3 py-1 text-sm font-medium transition-colors',
                  typeFilter === filter.value
                    ? 'border-sidebar-primary bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground',
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setWindowStart((date) => addDays(date, -DAY_COUNT))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="min-w-48 text-center text-sm font-medium">
              {format(windowStart, 'EEE MMM d')} – {format(windowEnd, 'EEE MMM d')}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setWindowStart((date) => addDays(date, DAY_COUNT))}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setWindowStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
              }
            >
              Today
            </Button>
          </div>
        </div>

        <div className="flex min-h-9 flex-wrap gap-2">
          {projectsLoading ? (
            <>
              <Skeleton className="h-8 w-36 rounded-full" />
              <Skeleton className="h-8 w-44 rounded-full" />
              <Skeleton className="h-8 w-32 rounded-full" />
            </>
          ) : projects.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No projects match this type filter.
            </div>
          ) : (
            projects.map((project) => {
              const color = projectColor(project.id)
              const isIncluded = includedProjectIds.has(project.id)
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => toggleProject(project.id)}
                  className={cn(
                    'group inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors',
                    isIncluded
                      ? 'border-border bg-background text-foreground'
                      : 'border-border/60 bg-muted/40 text-muted-foreground opacity-60',
                  )}
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="max-w-48 truncate">{project.name}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation()
                      soloProject(project.id)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        event.stopPropagation()
                        soloProject(project.id)
                      }
                    }}
                    title={`Solo ${project.name}`}
                    className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Target className="size-3.5" />
                  </span>
                </button>
              )
            })
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border/70 bg-background">
          <div className="relative" style={{ minWidth: totalGridWidth }}>
            <div className="sticky top-0 z-20 flex border-b border-border/70 bg-background/95 backdrop-blur">
              <div
                className="sticky left-0 z-30 flex h-12 shrink-0 items-center border-r border-border/70 bg-background px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                style={{ width: PROJECT_COLUMN_WIDTH }}
              >
                Project
              </div>
              <div className="grid" style={{ gridTemplateColumns: `repeat(${DAY_COUNT}, ${DAY_WIDTH}px)` }}>
                {days.map((day) => (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'flex h-12 flex-col items-center justify-center border-r border-border/60 text-xs',
                      isSameDay(day, today) && 'bg-sidebar-primary/10 text-sidebar-primary',
                    )}
                  >
                    <span className="font-medium">{format(day, 'EEE')}</span>
                    <span>{format(day, 'MMM d')}</span>
                  </div>
                ))}
              </div>
            </div>

            {projectsLoading || itemsLoading ? (
              <div className="divide-y divide-border/60">
                {Array.from({ length: 6 }, (_, idx) => (
                  <div key={idx} className="flex h-12">
                    <div
                      className="sticky left-0 z-10 shrink-0 border-r border-border/70 bg-background px-4 py-3"
                      style={{ width: PROJECT_COLUMN_WIDTH }}
                    >
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <div className="flex items-center px-4">
                      <Skeleton className="h-6 w-72" />
                    </div>
                  </div>
                ))}
              </div>
            ) : visibleProjects.length === 0 ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                No projects selected. Toggle a project chip back on to show rows.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {visibleProjects.map((project) => (
                  <ProjectScheduleRow
                    key={project.id}
                    project={project}
                    items={itemsByProject.get(project.id) ?? []}
                    windowStart={windowStart}
                    windowEnd={windowEnd}
                    onOpenProject={() => navigate(`/projects/${project.id}/schedule`)}
                    onOpenItem={openItemModal}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}
        {!projectsLoading &&
          !itemsLoading &&
          visibleProjects.length > 0 &&
          items.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No items in this window.
            </div>
          )}
      </main>

      <aside className="hidden w-[360px] flex-col border-l border-border/60 xl:flex">
        <SchedulePortfolioInbox
          onEntryClick={(entry) => void handleInboxClick(entry)}
          refreshKey={inboxRefreshKey}
        />
      </aside>

      <SchedulePortfolioItemModal
        open={!!modalItem}
        onClose={closeItemModal}
        item={modalItem}
        projectName={modalProjectName}
        onOpenLog={openModalItemLog}
        onLogEntry={openModalItemLogEntry}
        onItemUpdated={(patch) => {
          if (!modalItem) return
          const merged = { ...modalItem, ...patch }
          setModalItem(merged)
          setItems((current) =>
            current.map((item) =>
              item.id === merged.id ? { ...item, ...patch } : item,
            ),
          )
        }}
        onCascadeItemsUpdated={(updatedItems) => {
          const updatedById = new Map(updatedItems.map((item) => [item.id, item]))
          setItems((current) =>
            current.map((item) => updatedById.get(item.id) ?? item),
          )
          setModalItem((current) =>
            current ? updatedById.get(current.id) ?? current : current,
          )
          refreshInbox()
        }}
      />

      {commsPanelState.projectId && (
        <CommsLogPanel
          open={commsPanelState.open}
          onClose={() => {
            setCommsPanelState({ open: false, projectId: '', scheduleItem: null })
            refreshInbox()
          }}
          projectId={commsPanelState.projectId}
          scheduleItem={commsPanelState.scheduleItem}
        />
      )}

      {logModalState.projectId && (
        <LogCommsModal
          open={logModalState.open}
          onClose={() => setLogModalState({ open: false, projectId: '', scheduleItemId: null })}
          onCreated={() => refreshInbox()}
          projectId={logModalState.projectId}
          scheduleItemId={logModalState.scheduleItemId}
        />
      )}
    </div>
  )
}

function ProjectScheduleRow({
  project,
  items,
  windowStart,
  windowEnd,
  onOpenProject,
  onOpenItem,
}: {
  project: PortfolioProject
  items: PortfolioItem[]
  windowStart: Date
  windowEnd: Date
  onOpenProject: () => void
  onOpenItem: (item: PortfolioItem) => void
}) {
  const color = projectColor(project.id)
  const itemsInWindow = items.filter(
    (item) => item.start_date <= isoDate(windowEnd) && item.end_date >= isoDate(windowStart),
  )
  const laneItems = assignLanes(itemsInWindow)
  const laneCount = Math.max(
    1,
    laneItems.reduce((max, item) => Math.max(max, item.lane + 1), 0),
  )
  const rowHeight = laneCount * BAR_HEIGHT

  return (
    <div className="relative flex" style={{ height: rowHeight }}>
      <div
        className="sticky left-0 z-10 flex shrink-0 items-start border-r border-border/70 bg-background px-4 py-3 text-sm font-medium"
        style={{ width: PROJECT_COLUMN_WIDTH, height: rowHeight }}
      >
        <button
          type="button"
          onClick={onOpenProject}
          aria-label={`Open ${project.name} project schedule`}
          className="flex min-w-0 cursor-pointer items-center gap-2 rounded-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:underline"
        >
          <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
          <span className="truncate">{project.name}</span>
        </button>
      </div>

      <div
        className="relative"
        style={{ width: DAY_WIDTH * DAY_COUNT, height: rowHeight }}
      >
        <div
          className="absolute inset-0 grid"
          style={{ gridTemplateColumns: `repeat(${DAY_COUNT}, ${DAY_WIDTH}px)` }}
        >
          {Array.from({ length: DAY_COUNT }, (_, idx) => (
            <div
              key={idx}
              className="border-r border-border/40"
            />
          ))}
        </div>

        {laneItems.map((item) => {
          const itemStart = parseISO(item.start_date)
          const itemEnd = parseISO(item.end_date)
          const clippedStart = itemStart < windowStart ? windowStart : itemStart
          const clippedEnd = itemEnd > windowEnd ? windowEnd : itemEnd
          const startOffset = Math.max(
            0,
            differenceInCalendarDays(clippedStart, windowStart),
          )
          const spanDays =
            differenceInCalendarDays(clippedEnd, clippedStart) + 1
          const left = startOffset * DAY_WIDTH
          const width = Math.max(DAY_WIDTH * spanDays, DAY_WIDTH * 0.6)
          const top = item.lane * BAR_HEIGHT + 4

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenItem(item)}
              title={`${item.name} · ${format(itemStart, 'MMM d')} – ${format(itemEnd, 'MMM d')}`}
              className="absolute flex h-8 items-center overflow-hidden rounded-md border-l-4 px-2 text-left text-xs font-medium text-foreground shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-md"
              style={{
                left,
                top,
                width,
                borderLeftColor: color,
                backgroundColor: barColor(color),
              }}
            >
              <span className="truncate">{item.name}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
