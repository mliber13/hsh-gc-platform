import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  addMonths,
  format,
  parseISO,
  startOfMonth,
} from 'date-fns'
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
import { isDrywallProjectClosed } from '@/types/drywall'
import { ScheduleItemDialog } from '../ScheduleItemDialog'
import {
  DrywallPortfolioCalendar,
  filterPortfolioItemsInMonth,
} from './DrywallPortfolioCalendar'

type DialogState =
  | { open: false }
  | {
      open: true
      projectId: string
      siblings: DrywallProjectScheduleItem[]
      editing: DrywallProjectScheduleItem | null
    }

type ScopeFilter = 'active' | 'all'

function defaultPortfolioMonth(items: CrossProjectScheduleItem[]): Date {
  if (items.length === 0) return startOfMonth(new Date())
  const earliest = items.reduce((min, item) => {
    const d = parseISO(item.startDate)
    return d < min ? d : min
  }, parseISO(items[0].startDate))
  return startOfMonth(earliest)
}

export function DrywallSchedulePortfolioPage() {
  usePageTitle('Drywall — Schedule')

  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<CrossProjectScheduleItem[]>([])
  const [scope, setScope] = useState<ScopeFilter>('active')
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [monthInitialized, setMonthInitialized] = useState(false)
  const [dialog, setDialog] = useState<DialogState>({ open: false })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await fetchCrossProjectScheduleItems()
      setItems(rows)
      if (!monthInitialized) {
        setMonth(defaultPortfolioMonth(rows))
        setMonthInitialized(true)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load schedule')
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [monthInitialized])

  useEffect(() => {
    void load()
  }, [load])

  const scopedItems = useMemo(() => {
    if (scope === 'all') return items
    return items.filter((item) => !isDrywallProjectClosed(item.projectStatus))
  }, [items, scope])

  const itemsInMonth = useMemo(
    () => filterPortfolioItemsInMonth(scopedItems, month),
    [scopedItems, month],
  )

  const legendProjects = useMemo(() => {
    const byId = new Map<string, string>()
    for (const item of itemsInMonth) {
      if (!byId.has(item.projectId)) {
        byId.set(item.projectId, item.projectName)
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [itemsInMonth])

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
    <div className="space-y-6 pb-10">
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
              onClick={() => setMonth(addMonths(month, -1))}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[9rem] text-center text-sm font-semibold">
              {format(month, 'MMMM yyyy')}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMonth(startOfMonth(new Date()))}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setMonth(addMonths(month, 1))}
              aria-label="Next month"
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

      <DrywallPortfolioCalendar
        items={scopedItems}
        month={month}
        onItemClick={handleItemClick}
      />

      {legendProjects.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {legendProjects.map((project) => {
            const colors = projectColorClass(project.id)
            return (
              <div
                key={project.id}
                className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm"
              >
                <span
                  className={cn('size-3 shrink-0 rounded-sm', colors.bg, colors.border, 'border')}
                  aria-hidden
                />
                <span className="font-medium">{project.name}</span>
              </div>
            )
          })}
        </div>
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
