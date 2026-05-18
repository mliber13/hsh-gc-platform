import { Fragment, useEffect, useMemo, useState } from 'react'
import { addDays, format, isSameDay, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SchedulePortfolioItemModal } from '@/components/SchedulePortfolioItemModal'
import { cn } from '@/lib/utils'
import { fetchSubUnavailability, type SubUnavailability } from '@/services/calendarConfigService'
import {
  fetchActiveSubcontractors,
  fetchPortfolioProjects,
  fetchPortfolioScheduleItems,
  type ActiveSubcontractor,
  type PortfolioItem,
  type PortfolioProject,
  type PortfolioTypeFilter,
} from '@/services/scheduleService'

const DAY_COUNT = 14
const ROW_HEIGHT = 56
const HEADER_HEIGHT = 48
const DAY_COLUMN_WIDTH = 110
const COMPANY_COLUMN_WIDTH = 140

const TYPE_FILTERS: Array<{ label: string; value: PortfolioTypeFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'GC', value: 'gc' },
  { label: 'Drywall', value: 'drywall' },
]

function isoDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

function dayInRange(day: Date, start: string, end: string): boolean {
  const d = isoDate(day)
  return d >= start && d <= end
}

export function ResourceCompare() {
  const [typeFilter, setTypeFilter] = useState<PortfolioTypeFilter>('all')
  const [windowStart, setWindowStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 }),
  )
  const [selectedProjectId, setSelectedProjectId] = useState('all')
  const [projects, setProjects] = useState<PortfolioProject[]>([])
  const [companies, setCompanies] = useState<ActiveSubcontractor[]>([])
  const [items, setItems] = useState<PortfolioItem[]>([])
  const [unavailability, setUnavailability] = useState<SubUnavailability[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [modalItem, setModalItem] = useState<PortfolioItem | null>(null)

  const windowEnd = useMemo(
    () => addDays(windowStart, DAY_COUNT - 1),
    [windowStart],
  )
  const days = useMemo(
    () => Array.from({ length: DAY_COUNT }, (_, idx) => addDays(windowStart, idx)),
    [windowStart],
  )
  const today = new Date()

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const project of projects) {
      map.set(project.id, project.name)
    }
    return map
  }, [projects])

  const unavailabilityByCompany = useMemo(() => {
    const map = new Map<string, SubUnavailability[]>()
    for (const row of unavailability) {
      if (!map.has(row.subcontractor_id)) map.set(row.subcontractor_id, [])
      map.get(row.subcontractor_id)?.push(row)
    }
    return map
  }, [unavailability])

  useEffect(() => {
    if (selectedProjectId === 'all') return
    if (!projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId('all')
    }
  }, [projects, selectedProjectId])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [nextProjects, nextCompanies, nextUnavailability] = await Promise.all([
          fetchPortfolioProjects(typeFilter),
          fetchActiveSubcontractors(),
          fetchSubUnavailability(),
        ])
        if (cancelled) return

        setProjects(nextProjects)
        setCompanies(nextCompanies)

        const ids =
          selectedProjectId !== 'all'
            ? [selectedProjectId]
            : nextProjects.map((project) => project.id)

        const nextItems =
          ids.length > 0
            ? await fetchPortfolioScheduleItems(
                ids,
                isoDate(windowStart),
                isoDate(windowEnd),
              )
            : []

        if (!cancelled) {
          setUnavailability(nextUnavailability)
          setItems(nextItems)
        }
      } catch (loadError) {
        console.error('Failed to load resource compare', loadError)
        if (!cancelled) {
          setProjects([])
          setCompanies([])
          setItems([])
          setUnavailability([])
          setError('Could not load resource compare data.')
          toast.error('Could not load resource compare.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [typeFilter, windowStart, windowEnd, selectedProjectId])

  const gridMinWidth =
    DAY_COLUMN_WIDTH + companies.length * COMPANY_COLUMN_WIDTH

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
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

        <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border/60">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 8 }, (_, idx) => (
              <Skeleton key={idx} className="h-12 w-full" />
            ))}
          </div>
        ) : companies.length === 0 ? (
          <div className="flex h-48 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            No active subcontractors. Add some in the Contact Directory first.
          </div>
        ) : (
          <div style={{ minWidth: gridMinWidth }}>
            <div
              className="grid bg-background"
              style={{
                gridTemplateColumns: `${DAY_COLUMN_WIDTH}px repeat(${companies.length}, ${COMPANY_COLUMN_WIDTH}px)`,
              }}
            >
              <div className="sticky left-0 top-0 z-20 border-b border-r border-border/60 bg-background/95 px-2 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground backdrop-blur"
                style={{ height: HEADER_HEIGHT }}
              >
                Day
              </div>

              {companies.map((company) => (
                <div
                  key={company.id}
                  className="sticky top-0 z-10 flex items-center border-b border-l border-border/60 bg-background/95 px-2 py-1 text-xs font-medium backdrop-blur"
                  style={{ height: HEADER_HEIGHT }}
                  title={company.name}
                >
                  <span className="line-clamp-2 leading-tight">
                    {company.name}
                    {company.is_internal && (
                      <span className="text-muted-foreground"> · in-house</span>
                    )}
                  </span>
                </div>
              ))}

              {days.map((day) => {
                const isTodayRow = isSameDay(day, today)
                return (
                  <Fragment key={day.toISOString()}>
                    <div
                      className={cn(
                        'sticky left-0 z-10 flex items-center border-r border-t border-border/60 bg-background px-2 text-xs font-medium',
                        isTodayRow && 'bg-primary/5',
                      )}
                      style={{ height: ROW_HEIGHT }}
                    >
                      {format(day, 'EEE MMM d')}
                    </div>

                    {companies.map((company) => {
                      const cellItems = items.filter(
                        (item) =>
                          item.assigned_company_id === company.id &&
                          dayInRange(day, item.start_date, item.end_date),
                      )
                      const unavail = unavailabilityByCompany
                        .get(company.id)
                        ?.some((row) =>
                          dayInRange(day, row.start_date, row.end_date),
                        )
                      const isConflict = cellItems.length >= 2

                      return (
                        <div
                          key={`${day.toISOString()}-${company.id}`}
                          className={cn(
                            'border-l border-t border-border/60 p-1 text-xs',
                            // Diagonal stripes for unavailability. Theme-neutral
                            // grey at 30% — visible on both light and dark
                            // backgrounds, doesn't fight the conflict-amber tint.
                            unavail &&
                              'bg-[repeating-linear-gradient(45deg,transparent_0,transparent_5px,rgba(120,120,120,0.3)_5px,rgba(120,120,120,0.3)_10px)]',
                            isConflict &&
                              'border-2 border-amber-500/60 bg-amber-500/5',
                            isTodayRow && 'bg-primary/5',
                          )}
                          style={{ height: ROW_HEIGHT }}
                        >
                          {cellItems.slice(0, 2).map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => setModalItem(item)}
                              className="block w-full truncate text-left hover:underline"
                            >
                              {item.name}
                            </button>
                          ))}
                          {cellItems.length > 2 && (
                            <span className="text-muted-foreground">
                              +{cellItems.length - 2} more
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </Fragment>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      <SchedulePortfolioItemModal
        open={!!modalItem}
        onClose={() => setModalItem(null)}
        item={modalItem}
        projectName={
          modalItem ? (projectNameById.get(modalItem.project_id) ?? '') : ''
        }
        onOpenLog={() => {}}
        onLogEntry={() => {}}
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
            current ? (updatedById.get(current.id) ?? current) : current,
          )
        }}
      />
    </div>
  )
}
