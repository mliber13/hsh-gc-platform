import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { toLocalDate } from '@/lib/scheduleCalendarUtils'
import type { CrossProjectScheduleItem } from '@/services/drywallScheduleAggregateService'

export type PortfolioViewWindow = 'week' | 'twoWeek' | 'month'

export const PORTFOLIO_WEEK_STARTS_ON = 0 as const

export function computePortfolioRange(
  anchorDate: Date,
  viewWindow: PortfolioViewWindow,
): { rangeStart: Date; rangeEnd: Date; referenceMonth: Date } {
  const referenceMonth = startOfMonth(anchorDate)
  if (viewWindow === 'month') {
    return {
      rangeStart: startOfWeek(referenceMonth, { weekStartsOn: PORTFOLIO_WEEK_STARTS_ON }),
      rangeEnd: endOfWeek(endOfMonth(anchorDate), { weekStartsOn: PORTFOLIO_WEEK_STARTS_ON }),
      referenceMonth,
    }
  }
  const rangeStart = startOfWeek(anchorDate, { weekStartsOn: PORTFOLIO_WEEK_STARTS_ON })
  if (viewWindow === 'twoWeek') {
    return { rangeStart, rangeEnd: addDays(rangeStart, 13), referenceMonth }
  }
  return { rangeStart, rangeEnd: addDays(rangeStart, 6), referenceMonth }
}

export function shiftPortfolioAnchor(
  anchorDate: Date,
  viewWindow: PortfolioViewWindow,
  direction: -1 | 1,
): Date {
  if (viewWindow === 'month') return addMonths(anchorDate, direction)
  if (viewWindow === 'twoWeek') return addDays(anchorDate, direction * 14)
  return addDays(anchorDate, direction * 7)
}

export function formatPortfolioRangeLabel(
  rangeStart: Date,
  rangeEnd: Date,
  viewWindow: PortfolioViewWindow,
  referenceMonth?: Date,
): string {
  // Month grid pads leading days from the prior month — label the anchor month, not rangeStart.
  if (viewWindow === 'month') return format(referenceMonth ?? startOfMonth(rangeStart), 'MMMM yyyy')
  const sameYear = rangeStart.getFullYear() === rangeEnd.getFullYear()
  if (sameYear) {
    return `${format(rangeStart, 'MMM d')} – ${format(rangeEnd, 'MMM d, yyyy')}`
  }
  return `${format(rangeStart, 'MMM d, yyyy')} – ${format(rangeEnd, 'MMM d, yyyy')}`
}

export function filterPortfolioItemsInRange(
  items: CrossProjectScheduleItem[],
  rangeStart: Date,
  rangeEnd: Date,
): CrossProjectScheduleItem[] {
  return items.filter((item) => {
    const start = toLocalDate(item.startDate)
    const end = toLocalDate(item.endDate)
    return (
      (start >= rangeStart && start <= rangeEnd) ||
      (end >= rangeStart && end <= rangeEnd) ||
      (start <= rangeStart && end >= rangeEnd)
    )
  })
}

export function toggleSetMembership<T>(current: Set<T>, value: T): Set<T> {
  const next = new Set(current)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

export function maxLanesForWindow(viewWindow: PortfolioViewWindow): number {
  if (viewWindow === 'week') return 9
  if (viewWindow === 'twoWeek') return 6
  return 4 // month
}
