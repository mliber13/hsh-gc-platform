import { Fragment, useMemo } from 'react'
import {
  addDays,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  isWeekend,
  isWithinInterval,
} from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { getItemColsForWeek, toLocalDate } from '@/lib/scheduleCalendarUtils'
import { packLanes } from '@/lib/drywall/scheduleLanes'
import { projectColorClass } from '@/lib/drywall/projectColor'
import { cn } from '@/lib/utils'
import type { CrossProjectScheduleItem } from '@/services/drywallScheduleAggregateService'
import {
  phaseForScheduleItem,
  SCHEDULE_PHASE_LEFT_BORDER_CLASS,
} from '@/components/drywall/schedule/scheduleItemStatusStyles'
import {
  filterPortfolioItemsInRange,
  type PortfolioViewWindow,
} from './portfolioScheduleRange'

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const PORTFOLIO_MAX_VISIBLE_LANES = 5

type Props = {
  items: CrossProjectScheduleItem[]
  rangeStart: Date
  rangeEnd: Date
  viewWindow: PortfolioViewWindow
  referenceMonth: Date
  rangeLabel: string
  onItemClick: (item: CrossProjectScheduleItem) => void
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
  onItemClick,
}: Props) {
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

  return (
    <Card>
      <CardContent className="p-4">
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-border/60">
              {WEEKDAY_NAMES.map((name) => (
                <div
                  key={name}
                  className="border-b border-r border-border/60 bg-muted/30 p-2 text-center text-xs font-semibold uppercase text-muted-foreground last:border-r-0"
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
                const visibleLanes = lanes.slice(0, PORTFOLIO_MAX_VISIBLE_LANES)
                const laneCount = visibleLanes.length
                const overflowCount = lanes
                  .slice(PORTFOLIO_MAX_VISIBLE_LANES)
                  .reduce((sum, lane) => sum + lane.length, 0)

                return (
                  <Fragment key={`week-${weekIdx}`}>
                    {row.map((day) => (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          'border-b border-r border-border/60 px-1.5 py-0.5 last:border-r-0',
                          !isPrimaryDay(day) && 'bg-muted/20',
                          isPrimaryDay(day) && isWeekend(day) && 'bg-muted/35',
                          isPrimaryDay(day) && !isWeekend(day) && 'bg-card',
                        )}
                      >
                        {isPrimaryDay(day) && isToday(day) ? (
                          <div className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                            {format(day, 'd')}
                          </div>
                        ) : (
                          <div
                            className={cn(
                              'text-[11px] font-medium leading-5',
                              !isPrimaryDay(day)
                                ? 'text-muted-foreground/60'
                                : 'text-muted-foreground',
                            )}
                          >
                            {format(day, 'd')}
                          </div>
                        )}
                      </div>
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
                                  className="flex h-8 items-center border-b border-r border-border/60 bg-transparent px-1 last:border-r-0"
                                />
                              )
                            }

                            const { item, cols } = entry
                            const start = toLocalDate(item.startDate)
                            const end = toLocalDate(item.endDate)
                            const isStartWeek = isWithinInterval(start, {
                              start: weekStart,
                              end: weekEnd,
                            })
                            const continuesFromPrior = start < weekStart
                            const continuesToNext = end > weekEnd
                            const isLeftEdge = col === 0 || !cols.includes(col - 1)
                            const isRightEdge = col === 6 || !cols.includes(col + 1)
                            const showLabel = isStartWeek && col === cols[0]

                            const projectColors = projectColorClass(item.projectId)
                            const phase = phaseForScheduleItem(item)
                            const phaseBorder = SCHEDULE_PHASE_LEFT_BORDER_CLASS[phase]
                            const statusOpacity =
                              item.status === 'not-started' ? 'opacity-85' : 'opacity-100'
                            const delayedRing =
                              item.status === 'delayed' ? 'ring-2 ring-red-500' : ''

                            return (
                              <div
                                key={`${item.id}-c${col}`}
                                className={cn(
                                  'flex h-8 cursor-pointer items-center border-b border-r border-border/60 px-1 last:border-r-0 transition-shadow hover:ring-2 hover:ring-primary/40',
                                  projectColors.bg,
                                  projectColors.text,
                                  isLeftEdge && phaseBorder,
                                  statusOpacity,
                                  delayedRing,
                                )}
                                style={{
                                  borderTopLeftRadius:
                                    isLeftEdge && !continuesFromPrior ? 4 : 0,
                                  borderBottomLeftRadius:
                                    isLeftEdge && !continuesFromPrior ? 4 : 0,
                                  borderTopRightRadius:
                                    isRightEdge && !continuesToNext ? 4 : 0,
                                  borderBottomRightRadius:
                                    isRightEdge && !continuesToNext ? 4 : 0,
                                }}
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
                                {showLabel && (
                                  <span className="flex min-w-0 items-center gap-1">
                                    {continuesFromPrior && (
                                      <span className="text-[10px] opacity-70" aria-hidden>
                                        ‹
                                      </span>
                                    )}
                                    <span className="flex min-w-0 flex-col leading-tight">
                                      <span className="truncate text-xs font-medium">
                                        {item.name}
                                      </span>
                                      <span className="truncate text-[10px] opacity-70">
                                        {item.projectName}
                                      </span>
                                    </span>
                                    {continuesToNext && (
                                      <span className="text-[10px] opacity-70" aria-hidden>
                                        ›
                                      </span>
                                    )}
                                  </span>
                                )}
                                {!showLabel && continuesFromPrior && col === cols[0] && (
                                  <span className="text-[10px] opacity-60" aria-hidden>
                                    ‹ cont.
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </Fragment>
                      )
                    })}

                    {overflowCount > 0 && (
                      <div className="col-span-7 border-b border-border/60 bg-muted/10 px-2 py-1 text-xs text-muted-foreground">
                        +{overflowCount} more this week
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
