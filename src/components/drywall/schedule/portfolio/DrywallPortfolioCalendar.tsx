import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  addDays,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  isWithinInterval,
} from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'
import { getItemColsForWeek, toLocalDate } from '@/lib/scheduleCalendarUtils'
import { packLanes } from '@/lib/drywall/scheduleLanes'
import { projectColorClass } from '@/lib/drywall/projectColor'
import { cn } from '@/lib/utils'
import type { CrossProjectScheduleItem } from '@/services/drywallScheduleAggregateService'
import type { ScheduleUnavailability } from '@/services/personUnavailabilityService'
import {
  phaseForScheduleItem,
  SCHEDULE_ITEM_STATUS_CLASS,
  SCHEDULE_ITEM_STATUS_LABELS,
  SCHEDULE_PHASE_DOT_CLASS,
  SCHEDULE_PHASE_LEFT_BORDER_CLASS,
} from '@/components/drywall/schedule/scheduleItemStatusStyles'

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
import {
  filterPortfolioItemsInRange,
  maxLanesForWindow,
  type PortfolioViewWindow,
} from './portfolioScheduleRange'

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type Props = {
  items: CrossProjectScheduleItem[]
  rangeStart: Date
  rangeEnd: Date
  viewWindow: PortfolioViewWindow
  referenceMonth: Date
  rangeLabel: string
  expandAll: boolean
  onItemClick: (item: CrossProjectScheduleItem) => void
  /** Team time-off bands to overlay (grey), display-only. */
  unavailability?: ScheduleUnavailability[]
}

function formatItemDates(item: CrossProjectScheduleItem): string {
  if (item.startDate === item.endDate) return item.startDate
  return `${item.startDate} → ${item.endDate}`
}

function buildTooltip(item: CrossProjectScheduleItem): string {
  const assigned =
    item.assignedPersons.length === 0
      ? 'Unassigned'
      : `${item.assignedPersons.length} assigned`
  return `${item.projectName}\n${item.name}\n${formatItemDates(item)}\n${assigned}`
}

export function DrywallPortfolioCalendar({
  items,
  rangeStart,
  rangeEnd,
  viewWindow,
  referenceMonth,
  rangeLabel,
  expandAll,
  onItemClick,
  unavailability = [],
}: Props) {
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(() => new Set())
  const isMobile = useIsMobile()
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)

  useEffect(() => {
    setExpandedWeeks(new Set())
  }, [rangeStart, viewWindow])

  const calendarDays = eachDayOfInterval({ start: rangeStart, end: rangeEnd })
  const weekRows = useMemo(
    () =>
      Array.from({ length: Math.ceil(calendarDays.length / 7) }, (_, i) =>
        calendarDays.slice(i * 7, (i + 1) * 7),
      ),
    [calendarDays],
  )

  const itemsInRange = useMemo(
    () => filterPortfolioItemsInRange(items, rangeStart, rangeEnd),
    [items, rangeStart, rangeEnd],
  )

  const isPrimaryDay = (day: Date) => {
    if (viewWindow === 'month') return isSameMonth(day, referenceMonth)
    return isWithinInterval(day, { start: rangeStart, end: rangeEnd })
  }

  const expandWeek = (weekIdx: number) => {
    setExpandedWeeks((current) => {
      const next = new Set(current)
      next.add(weekIdx)
      return next
    })
  }

  const collapseWeek = (weekIdx: number) => {
    setExpandedWeeks((current) => {
      const next = new Set(current)
      next.delete(weekIdx)
      return next
    })
  }

  // ── Mobile: compact dot-grid month that fits the screen; tap a day for detail. ──
  if (isMobile) {
    const dayItems = (day: Date): CrossProjectScheduleItem[] => {
      const key = format(day, 'yyyy-MM-dd')
      return itemsInRange.filter((it) => it.startDate <= key && it.endDate >= key)
    }
    const dayUnavailable = (day: Date): ScheduleUnavailability[] => {
      const key = format(day, 'yyyy-MM-dd')
      return unavailability.filter((u) => u.startDate <= key && u.endDate >= key)
    }
    const selectedItems = selectedDay ? dayItems(selectedDay) : []
    const selectedUnavailable = selectedDay ? dayUnavailable(selectedDay) : []

    return (
      <Card>
        <CardContent className="p-2">
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAY_INITIALS.map((name, i) => (
              <div
                key={`${name}-${i}`}
                className="pb-1 text-center text-[11px] font-bold uppercase text-muted-foreground"
              >
                {name}
              </div>
            ))}

            {calendarDays.map((day) => {
              const items = dayItems(day)
              const out = dayUnavailable(day)
              const primary = isPrimaryDay(day)
              const today = isToday(day)
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  className={cn(
                    'flex min-h-[46px] flex-col items-center gap-1 rounded-md border border-border/50 p-1 transition-colors active:bg-muted/60',
                    primary ? 'bg-card' : 'bg-muted/20',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold',
                      today
                        ? 'bg-primary text-primary-foreground'
                        : primary
                          ? 'text-foreground'
                          : 'text-muted-foreground/50',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  {(items.length > 0 || out.length > 0) && (
                    <span className="flex flex-wrap items-center justify-center gap-0.5">
                      {items.slice(0, 4).map((it, idx) => (
                        <span
                          key={`${it.id}-${idx}`}
                          className={cn(
                            'size-1.5 rounded-full',
                            projectColorClass(it.projectId).bg,
                          )}
                          aria-hidden
                        />
                      ))}
                      {items.length > 4 && (
                        <span className="text-[9px] font-semibold leading-none text-muted-foreground">
                          +{items.length - 4}
                        </span>
                      )}
                      {out.length > 0 && (
                        <span
                          className="size-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500"
                          aria-hidden
                        />
                      )}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {itemsInRange.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No drywall schedule items for {rangeLabel}.
            </p>
          )}
        </CardContent>

        <Sheet open={selectedDay !== null} onOpenChange={(open) => !open && setSelectedDay(null)}>
          <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto">
            <SheetHeader className="mb-3 text-left">
              <SheetTitle>
                {selectedDay ? format(selectedDay, 'EEEE, MMM d') : ''}
              </SheetTitle>
            </SheetHeader>
            {selectedUnavailable.length > 0 && (
              <div className="mb-3 space-y-1.5">
                {selectedUnavailable.map((u) => (
                  <div
                    key={u.id}
                    className="rounded-md bg-zinc-400/20 px-3 py-2 text-sm dark:bg-zinc-500/20"
                  >
                    🌴 <span className="font-medium">{u.personName}</span> — off
                    {u.reason ? ` (${u.reason})` : ''}
                  </div>
                ))}
              </div>
            )}
            {selectedItems.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {selectedUnavailable.length > 0 ? 'Nothing else scheduled this day.' : 'Nothing scheduled this day.'}
              </p>
            ) : (
              <div className="space-y-2 pb-4">
                {selectedItems.map((item) => {
                  const phase = phaseForScheduleItem(item)
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedDay(null)
                        onItemClick(item)
                      }}
                      className="flex w-full flex-col gap-1.5 rounded-lg border bg-card p-3 text-left transition-colors active:bg-muted/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className={cn(
                              'size-2.5 shrink-0 rounded-sm border',
                              projectColorClass(item.projectId).bg,
                              projectColorClass(item.projectId).border,
                            )}
                            aria-hidden
                          />
                          <span className="truncate text-sm font-medium">
                            {item.projectName}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                            SCHEDULE_ITEM_STATUS_CLASS[item.status],
                          )}
                        >
                          {SCHEDULE_ITEM_STATUS_LABELS[item.status]}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            'inline-block size-2.5 shrink-0 rounded-full',
                            SCHEDULE_PHASE_DOT_CLASS[phase],
                          )}
                          aria-hidden
                        />
                        <span className="text-sm font-medium">{item.name}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </SheetContent>
        </Sheet>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-border/60">
              {WEEKDAY_NAMES.map((name) => (
                <div
                  key={name}
                  className="border-b border-r border-border/60 bg-muted/30 p-2 text-center text-xs font-bold uppercase text-foreground last:border-r-0"
                >
                  {name}
                </div>
              ))}

              {weekRows.map((row, weekIdx) => {
                const itemsForWeek = itemsInRange
                  .map((item) => ({
                    item,
                    cols: getItemColsForWeek(
                      rangeStart,
                      { startDate: item.startDate, endDate: item.endDate },
                      weekIdx,
                    ),
                  }))
                  .filter(({ cols }) => cols.length > 0)

                const lanes = packLanes(itemsForWeek)
                const maxLanes = maxLanesForWindow(viewWindow)
                const expanded = expandAll || expandedWeeks.has(weekIdx)
                const cap = expanded ? lanes.length : maxLanes
                const visibleLanes = lanes.slice(0, cap)
                const laneCount = visibleLanes.length
                const overflowCount = lanes
                  .slice(cap)
                  .reduce((sum, lane) => sum + lane.length, 0)
                const weekExpandedIndividually = !expandAll && expandedWeeks.has(weekIdx)

                return (
                  <Fragment key={`week-${weekIdx}`}>
                    {weekIdx > 0 && <div className="col-span-7 h-2" />}
                    {row.map((day) => (
                      <div
                        key={day.toISOString()}
                        className="border-b border-r border-border/60 bg-black/40 px-1.5 py-0.5 last:border-r-0"
                      >
                        {isPrimaryDay(day) && isToday(day) ? (
                          <div className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                            {format(day, 'd')}
                          </div>
                        ) : (
                          <div
                            className={cn(
                              'text-sm font-bold leading-5',
                              !isPrimaryDay(day)
                                ? 'text-muted-foreground/50'
                                : 'text-foreground',
                            )}
                          >
                            {format(day, 'd')}
                          </div>
                        )}
                      </div>
                    ))}

                    {unavailability
                      .map((u) => ({
                        u,
                        cols: getItemColsForWeek(
                          rangeStart,
                          { startDate: u.startDate, endDate: u.endDate },
                          weekIdx,
                        ),
                      }))
                      .filter(({ cols }) => cols.length > 0)
                      .map(({ u, cols }) => (
                        <Fragment key={`unavail-${weekIdx}-${u.id}`}>
                          {[0, 1, 2, 3, 4, 5, 6].map((col) => {
                            if (!cols.includes(col)) {
                              return (
                                <div
                                  key={`u-empty-${weekIdx}-${u.id}-${col}`}
                                  className="h-8 border-r border-border/60 bg-black/5 last:border-r-0 dark:bg-white/10"
                                />
                              )
                            }
                            const isLeftEdge = col === 0 || !cols.includes(col - 1)
                            const isRightEdge = col === 6 || !cols.includes(col + 1)
                            const showLabel = col === cols[0]
                            return (
                              <div
                                key={`u-${u.id}-c${col}`}
                                className="flex h-8 items-center border-r border-border/60 bg-black/5 px-0 last:border-r-0 dark:bg-white/10"
                                title={`${u.personName} — off${u.reason ? ` (${u.reason})` : ''}`}
                              >
                                <div
                                  className={cn(
                                    'flex h-6 w-full items-center bg-zinc-400/35 px-1 text-zinc-800 ring-1 ring-inset ring-black/10 dark:bg-zinc-500/30 dark:text-zinc-100',
                                    isLeftEdge && 'ml-0.5 rounded-l',
                                    isRightEdge && 'mr-0.5 rounded-r',
                                  )}
                                >
                                  {showLabel && (
                                    <span className="min-w-0 truncate text-xs font-medium">
                                      🌴 {u.personName}
                                      {u.reason ? ` · ${u.reason}` : ' · Off'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </Fragment>
                      ))}

                    {Array.from({ length: laneCount }).map((_, laneIdx) => {
                      const laneItems = visibleLanes[laneIdx] ?? []
                      const weekStart = addDays(rangeStart, weekIdx * 7)
                      const weekEnd = addDays(weekStart, 6)

                      return (
                        <Fragment key={`week-${weekIdx}-lane-${laneIdx}`}>
                          {[0, 1, 2, 3, 4, 5, 6].map((col) => {
                            const entry = laneItems.find(({ cols }) => cols.includes(col))
                            if (!entry) {
                              return (
                                <div
                                  key={`empty-${weekIdx}-${laneIdx}-${col}`}
                                  className="h-9 border-r border-border/60 bg-black/5 last:border-r-0 dark:bg-white/10"
                                />
                              )
                            }

                            const { item, cols } = entry
                            const start = toLocalDate(item.startDate)
                            const end = toLocalDate(item.endDate)
                            const continuesFromPrior = start < weekStart
                            const continuesToNext = end > weekEnd
                            const isLeftEdge = col === 0 || !cols.includes(col - 1)
                            const isRightEdge = col === 6 || !cols.includes(col + 1)
                            const showLabel = col === cols[0]
                            const itemStartsHere = isLeftEdge && !continuesFromPrior
                            const itemEndsHere = isRightEdge && !continuesToNext

                            const projectColors = projectColorClass(item.projectId)
                            const phase = phaseForScheduleItem(item)
                            const phaseBorder = SCHEDULE_PHASE_LEFT_BORDER_CLASS[phase]
                            const statusOpacity =
                              item.status === 'not-started' ? 'opacity-90' : 'opacity-100'
                            const delayedRing =
                              item.status === 'delayed' ? 'ring-2 ring-red-500' : ''

                            return (
                              <div
                                key={`${item.id}-c${col}`}
                                className="flex h-9 cursor-pointer items-center border-r border-border/60 bg-black/5 px-0 last:border-r-0 dark:bg-white/10"
                                title={buildTooltip(item)}
                                onClick={() => onItemClick(item)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    onItemClick(item)
                                  }
                                }}
                                role="button"
                                tabIndex={0}
                              >
                                <div
                                  className={cn(
                                    'flex h-7 w-full items-center px-1 ring-1 ring-inset ring-black/25',
                                    projectColors.bg,
                                    projectColors.text,
                                    isLeftEdge && phaseBorder,
                                    statusOpacity,
                                    delayedRing,
                                    itemStartsHere && 'ml-0.5',
                                    itemEndsHere && 'mr-0.5',
                                    'transition-shadow hover:ring-2 hover:ring-primary/40',
                                  )}
                                  style={{
                                    borderTopLeftRadius: itemStartsHere ? 4 : isLeftEdge ? 2 : 0,
                                    borderBottomLeftRadius: itemStartsHere ? 4 : isLeftEdge ? 2 : 0,
                                    borderTopRightRadius: itemEndsHere ? 4 : isRightEdge ? 2 : 0,
                                    borderBottomRightRadius: itemEndsHere ? 4 : isRightEdge ? 2 : 0,
                                  }}
                                >
                                  {showLabel && (
                                    <span className="flex min-w-0 items-center gap-1">
                                      {continuesFromPrior && (
                                        <span className="shrink-0 text-[10px] opacity-80" aria-hidden>
                                          ‹
                                        </span>
                                      )}
                                      <span className="min-w-0 truncate text-sm [text-shadow:0_1px_1px_rgba(0,0,0,0.45)]">
                                        <span className="font-semibold">{item.name}</span>{' '}
                                        <span className="opacity-95">({item.projectName})</span>
                                      </span>
                                      {continuesToNext && (
                                        <span className="shrink-0 text-[10px] opacity-80" aria-hidden>
                                          ›
                                        </span>
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </Fragment>
                      )
                    })}

                    {!expandAll && weekExpandedIndividually && (
                      <div className="col-span-7 border-b border-border/60 bg-muted/10 px-2 py-1 text-right">
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                          onClick={() => collapseWeek(weekIdx)}
                        >
                          Show less
                        </button>
                      </div>
                    )}

                    {!expandAll && !weekExpandedIndividually && overflowCount > 0 && (
                      <div className="col-span-7 border-b border-border/60 bg-muted/10 px-2 py-1">
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                          onClick={() => expandWeek(weekIdx)}
                        >
                          +{overflowCount} more this week
                        </button>
                      </div>
                    )}
                  </Fragment>
                )
              })}
            </div>
          </div>
        </div>

        {itemsInRange.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No drywall schedule items for {rangeLabel}.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// Re-export for tests or callers that still import from this module.
export { filterPortfolioItemsInRange } from './portfolioScheduleRange'
