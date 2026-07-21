import { Fragment, useMemo } from 'react'
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  isWeekend,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  getItemColsForWeek,
  toLocalDate,
} from '@/lib/scheduleCalendarUtils'
import { packLanes } from '@/lib/drywall/scheduleLanes'
import { cn } from '@/lib/utils'
import type { DrywallProjectScheduleItem } from '@/services/scheduleService'
import { phaseForScheduleItem, SCHEDULE_PHASE_BAR_CLASS } from './scheduleItemStatusStyles'

const WEEK_STARTS_ON = 0 as const
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_VISIBLE_LANES = 3

type Props = {
  items: DrywallProjectScheduleItem[]
  personNames: Map<string, string>
  readOnly: boolean
  month: Date
  onMonthChange: (month: Date) => void
  onEdit: (item: DrywallProjectScheduleItem) => void
}

function formatItemDates(item: DrywallProjectScheduleItem): string {
  if (item.start_date === item.end_date) return item.start_date
  return `${item.start_date} → ${item.end_date}`
}

function buildTooltip(
  item: DrywallProjectScheduleItem,
  personNames: Map<string, string>,
): string {
  const assigned =
    item.assigned_persons.length === 0
      ? 'Unassigned'
      : item.assigned_persons
          .map((id) => personNames.get(id) ?? id)
          .join(', ')
  return `${item.name}\n${formatItemDates(item)}\n${assigned}`
}

export function DrywallScheduleCalendar({
  items,
  personNames,
  readOnly,
  month,
  onMonthChange,
  onEdit,
}: Props) {
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

  const itemsInMonth = useMemo(() => {
    // Filter to the full visible grid (incl. leading/trailing overflow days), not the strict
    // month — so an item on a next/prev-month day shown in the grid still renders. Matches the
    // portfolio calendar.
    const rangeStart = startOfWeek(startOfMonth(month), { weekStartsOn: WEEK_STARTS_ON })
    const rangeEnd = endOfWeek(endOfMonth(month), { weekStartsOn: WEEK_STARTS_ON })
    return items.filter((item) => {
      const start = toLocalDate(item.start_date)
      const end = toLocalDate(item.end_date)
      return (
        isWithinInterval(start, { start: rangeStart, end: rangeEnd }) ||
        isWithinInterval(end, { start: rangeStart, end: rangeEnd }) ||
        (start <= rangeStart && end >= rangeEnd)
      )
    })
  }, [items, month])

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold">{format(month, 'MMMM yyyy')}</h3>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onMonthChange(addMonths(month, -1))}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onMonthChange(startOfMonth(new Date()))}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onMonthChange(addMonths(month, 1))}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-7 border border-border/60 rounded-lg overflow-hidden">
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
                      { startDate: item.start_date, endDate: item.end_date },
                      weekIdx,
                    ),
                  }))
                  .filter(({ cols }) => cols.length > 0)

                const lanes = packLanes(itemsForWeek)
                const visibleLanes = lanes.slice(0, MAX_VISIBLE_LANES)
                const overflowCount = lanes
                  .slice(MAX_VISIBLE_LANES)
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
                              !isSameMonth(day, month) ? 'text-muted-foreground/60' : 'text-muted-foreground',
                            )}
                          >
                            {format(day, 'd')}
                          </div>
                        )}
                      </div>
                    ))}

                    {Array.from({ length: MAX_VISIBLE_LANES }).map((_, laneIdx) => {
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
                                  className="flex h-8 items-center border-b border-r border-border/60 px-1 last:border-r-0 bg-transparent"
                                />
                              )
                            }

                            const { item, cols } = entry
                            const start = toLocalDate(item.start_date)
                            const end = toLocalDate(item.end_date)
                            const isStartWeek = isWithinInterval(start, {
                              start: weekStart,
                              end: weekEnd,
                            })
                            const continuesFromPrior = start < weekStart
                            const continuesToNext = end > weekEnd
                            const isLeftEdge = col === 0 || !cols.includes(col - 1)
                            const isRightEdge = col === 6 || !cols.includes(col + 1)
                            const showName = isStartWeek && col === cols[0]

                            const phase = phaseForScheduleItem(item)
                            const phaseClass = SCHEDULE_PHASE_BAR_CLASS[phase]
                            const statusOpacity =
                              item.status === 'not-started' ? 'opacity-85' : 'opacity-100'
                            const delayedRing =
                              item.status === 'delayed' ? 'ring-2 ring-red-500' : ''

                            return (
                              <div
                                key={`${item.id}-c${col}`}
                                className={cn(
                                  'flex h-8 items-center border-b border-r border-border/60 px-1 last:border-r-0',
                                  phaseClass,
                                  statusOpacity,
                                  delayedRing,
                                  !readOnly &&
                                    'cursor-pointer transition-shadow hover:ring-2 hover:ring-primary/40',
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
                                title={buildTooltip(item, personNames)}
                                onClick={!readOnly ? () => onEdit(item) : undefined}
                                onKeyDown={
                                  !readOnly
                                    ? (e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.preventDefault()
                                          onEdit(item)
                                        }
                                      }
                                    : undefined
                                }
                                role={!readOnly ? 'button' : undefined}
                                tabIndex={!readOnly ? 0 : undefined}
                              >
                                {showName && (
                                  <span className="flex min-w-0 items-center gap-1">
                                    {continuesFromPrior && (
                                      <span className="text-[10px] opacity-70" aria-hidden>
                                        ‹
                                      </span>
                                    )}
                                    <span className="truncate text-sm font-medium">{item.name}</span>
                                    {continuesToNext && (
                                      <span className="text-[10px] opacity-70" aria-hidden>
                                        ›
                                      </span>
                                    )}
                                  </span>
                                )}
                                {!showName && continuesFromPrior && col === cols[0] && (
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
          <p className="text-center text-sm text-muted-foreground py-4">
            No schedule items in {format(month, 'MMMM yyyy')}.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function defaultScheduleCalendarMonth(
  items: DrywallProjectScheduleItem[],
): Date {
  if (items.length === 0) return startOfMonth(new Date())
  const earliest = items.reduce((min, item) => {
    const d = parseISO(item.start_date)
    return d < min ? d : min
  }, parseISO(items[0].start_date))
  return startOfMonth(earliest)
}
