// ============================================================================
// North Star — the one band that stays open on the hub
// ============================================================================
//
// This was a full KpiCard with four large stats and a boxed constraint callout, roughly
// 300px tall. On a hub whose whole point is that the cards fit on one screen, that pushed
// the grid below the fold — Mark, 2026-10-02: "it is pushing the cards off the screen
// enough that I have to scroll for them. instead of feeling like a true hub."
//
// So it is a band now, not a card. **No fact was dropped** — goal, pace, gap, the pace
// source and the biggest constraint are all still here, just at the size of supporting
// figures with the pace percentage as the only headline. Most of the height that went was
// the card header, the description line and the padding around four 4xl numbers, none of
// which was information.

import {
  formatDashboardCurrency,
  formatDashboardPercent,
} from '@/lib/drywall/dashboardCalculations'
import { cn } from '@/lib/utils'
import { useDashboardData } from './useDashboardData'
import { StatusPill } from './ui/StatusPill'

const BAR_FILL: Record<'green' | 'yellow' | 'red', string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-rose-500',
}

/** Label above, figure below, at supporting-figure size rather than BigStat's 3xl/4xl. */
function Figure({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note?: React.ReactNode
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-base font-medium tabular-nums">{value}</p>
      {note ? <p className="truncate text-[11px] text-muted-foreground">{note}</p> : null}
    </div>
  )
}

export function NorthStarCard() {
  const { metrics } = useDashboardData()
  const { northStar } = metrics
  const pct = Math.min(1, Math.max(0, northStar.pctOfRequired))

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums tracking-tight">
            {formatDashboardPercent(northStar.pctOfRequired)}
          </span>
          <span className="text-xs text-muted-foreground">of required pace</span>
        </div>

        <div className="order-last w-full min-w-[8rem] flex-1 sm:order-none sm:w-auto">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full transition-all', BAR_FILL[northStar.status])}
              style={{ width: `${pct * 100}%` }}
            />
          </div>
        </div>

        <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          <Figure
            label="Annual goal"
            value={formatDashboardCurrency(northStar.annualGoal)}
          />
          <Figure
            label="Current pace"
            value={formatDashboardCurrency(northStar.currentPace)}
            note={
              northStar.paceSource === 'billings'
                ? `${formatDashboardCurrency(northStar.billingsYtd)} billed YTD`
                : `${formatDashboardCurrency(northStar.awardedYtd)} awarded YTD${
                    northStar.awardedBaseline > 0
                      ? ` incl. ${formatDashboardCurrency(northStar.awardedBaseline)} outside HSH`
                      : ''
                  }`
            }
          />
          <Figure
            label="Revenue gap"
            value={formatDashboardCurrency(northStar.revenueGap)}
            note={northStar.revenueGap >= 0 ? 'ahead of goal' : 'behind goal'}
          />
        </div>

        <StatusPill
          status={northStar.status}
          label={`${formatDashboardPercent(northStar.pctOfRequired)} pace`}
          className="shrink-0"
        />
      </div>

      <p className="mt-2.5 border-t border-primary/15 pt-2 text-xs text-muted-foreground">
        Biggest constraint:{' '}
        <span className="font-medium text-foreground">{northStar.biggestConstraint}</span>
      </p>
    </div>
  )
}
