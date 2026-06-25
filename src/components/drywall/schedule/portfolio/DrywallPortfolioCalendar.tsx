import { Fragment, useMemo } from 'react'
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  isWeekend,
  isWithinInterval,
  startOfMonth,
  startOfWeek,
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

const WEEK_STARTS_ON = 0 as const
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const PORTFOLIO_MAX_VISIBLE_LANES = 5

type Props = {
  items: CrossProjectScheduleItem[]
  month: Date
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

export function filterPortfolioItemsInMonth(
  items: CrossProjectScheduleItem[],
  month: Date,
): CrossProjectScheduleItem[] {
  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(month)
  return items.filter((item) => {
    const start = toLocalDate(item.startDate)
    const end = toLocalDate(item.endDate)
    return (
      isWithinInterval(start, { start: monthStart, end: monthEnd }) ||
      isWithinInterval(end, { start: monthStart, end: monthEnd }) ||
      (start <= monthStart && end >= monthEnd)
    )
  })
}

export function DrywallPortfolioCalendar({ items, month, onItemClick }: Props) {
  const calendarStart = startOfWeek(startOfMonth(month), { weekStartsOn: WEEK_STARTS_ON })
  const calendarEnd = endOfWeek(endOfMonth(month), { weekStartsOn: WEEK_STARTS_ON })
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd })
  const weekRows = useMemo(
    () =>
      Array.from({ length: Math.ceil(calendarDays.length / 7) }, (_, i) =>
        calendarDays.slice(i * 7, (i + 1) * 7),
      ),
    [calendarDays],
  )

  const itemsInMonth = useMemo(
    () => filterPortfolioItemsInMonth(items, month),
    [items, month],
  )

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
                const itemsForWeek = itemsInMonth
                  .map((item) => ({
                    item,
                    cols: getItemColsForWeek(
                      calendarStart,
                      { startDate: item.startDate, endDate: item.endDate },
                      weekIdx,
                    ),
                  }))
                  .filter(({ cols }) => cols.length > 0)

                const lanes = packLanes(itemsForWeek)
                const visibleLanes = lanes.slice(0, PORTFOLIO_MAX_VISIBLE_LANES)
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
                          !isSameMonth(day, month) && 'bg-muted/20',
                          isSameMonth(day, month) && isWeekend(day) && 'bg-muted/35',
                          isSameMonth(day, month) && !isWeekend(day) && 'bg-card',
                        )}
                      >
                        {isSameMonth(day, month) && isToday(day) ? (
                          <div className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                            {format(day, 'd')}
                          </div>
                        ) : (
                          <div
                            className={cn(
                              'text-[11px] font-medium leading-5',
                              !isSameMonth(day, month)
                                ? 'text-muted-foreground/60'
                                : 'text-muted-foreground',
                            )}
                          >
                            {format(day, 'd')}
                          </div>
                        )}
                      </div>
                    ))}

                    {Array.from({ length: PORTFOLIO_MAX_VISIBLE_LANES }).map((_, laneIdx) => {
                      const laneItems = visibleLanes[laneIdx] ?? []
                      const weekStart = addDays(calendarStart, weekIdx * 7)
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
                                    <span className="truncate text-xs font-medium">
                                      {item.projectName} · {item.name}
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

        {itemsInMonth.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No drywall schedule items for {format(month, 'MMMM yyyy')}.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
