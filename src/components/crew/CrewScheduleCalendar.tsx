import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DrywallPortfolioCalendar } from '@/components/drywall/schedule/portfolio/DrywallPortfolioCalendar'
import {
  computePortfolioRange,
  formatPortfolioRangeLabel,
  shiftPortfolioAnchor,
  type PortfolioViewWindow,
} from '@/components/drywall/schedule/portfolio/portfolioScheduleRange'
import {
  fetchCrossProjectScheduleItems,
  type CrossProjectScheduleItem,
} from '@/services/drywallScheduleAggregateService'

const VIEW_WINDOW: PortfolioViewWindow = 'month'

type Props = {
  onItemClick: (item: CrossProjectScheduleItem) => void
}

/**
 * Foreman schedule calendar for /crew — reuses the operator portfolio calendar
 * (color-coded by job, desktop grid + mobile dot-grid) with month navigation.
 */
export function CrewScheduleCalendar({ onItemClick }: Props) {
  const [items, setItems] = useState<CrossProjectScheduleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [anchorDate, setAnchorDate] = useState(() => new Date())

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchCrossProjectScheduleItems()
      .then((rows) => {
        if (cancelled) return
        setItems(rows)
        setError(null)
      })
      .catch((e) => {
        if (cancelled) return
        console.error('CrewScheduleCalendar:', e)
        setError('Could not load the schedule')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const { rangeStart, rangeEnd, referenceMonth } = useMemo(
    () => computePortfolioRange(anchorDate, VIEW_WINDOW),
    [anchorDate],
  )
  const rangeLabel = useMemo(
    () => formatPortfolioRangeLabel(rangeStart, rangeEnd, VIEW_WINDOW, referenceMonth),
    [rangeStart, rangeEnd, referenceMonth],
  )

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {error}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-base font-semibold">{rangeLabel}</p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Previous month"
            onClick={() => setAnchorDate((d) => shiftPortfolioAnchor(d, VIEW_WINDOW, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setAnchorDate(new Date())}
          >
            Today
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Next month"
            onClick={() => setAnchorDate((d) => shiftPortfolioAnchor(d, VIEW_WINDOW, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <DrywallPortfolioCalendar
        items={items}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        viewWindow={VIEW_WINDOW}
        referenceMonth={referenceMonth}
        rangeLabel={rangeLabel}
        expandAll={false}
        onItemClick={onItemClick}
      />
    </div>
  )
}
