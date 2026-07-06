import { useDashboardData } from '../useDashboardData'
import { BigStat } from '../ui/BigStat'
import { KpiCard } from '../ui/KpiCard'
import { StatusPill } from '../ui/StatusPill'
import type { CrewCounts } from '@/lib/drywall/dashboardCalculations'

function formatFinisherTierCaption(crew: CrewCounts): string {
  const parts: string[] = []
  if (crew.productionFinishers > 0) parts.push(`${crew.productionFinishers} production`)
  if (crew.apprenticeFinishers > 0) parts.push(`${crew.apprenticeFinishers} apprentice`)
  if (crew.pointupFinishers > 0) parts.push(`${crew.pointupFinishers} point-up (support)`)
  return parts.join(' · ')
}

export function ManpowerSection() {
  const { metrics, targets } = useDashboardData()
  const { manpower, crew } = metrics
  const hangersPerCrew = Math.max(1, targets.capacity.hangersPerCrew)
  const inHouseCrews = Math.floor(crew.w2Hangers / hangersPerCrew)

  const rows = [manpower.finishers, manpower.hangerCrews]

  return (
    <KpiCard
      title="Manpower"
      description="Active crew vs targets"
      headerRight={
        <StatusPill
          status={manpower.fillPct >= 1 ? 'green' : 'red'}
          label={manpower.fillPct >= 1 ? 'Staffed' : 'Understaffed'}
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <BigStat label="Active Finishers" value={String(manpower.finishers.current)} />
        <BigStat label="Hanger Crews" value={String(manpower.hangerCrews.current)} />
      </div>

      <div className="mt-auto space-y-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{row.label}</p>
              <p className="text-xs text-muted-foreground">
                {row.current} / {row.target} target
                {row.gap > 0 ? ` · need ${row.gap}` : row.gap < 0 ? ` · ${Math.abs(row.gap)} over` : ' · at target'}
              </p>
              {row.label === 'Hanger Crews' ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {crew.subbedHangerCrews} subbed + {inHouseCrews} in-house
                </p>
              ) : row.label === 'Finishers' ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatFinisherTierCaption(crew)}
                </p>
              ) : null}
            </div>
            <StatusPill
              status={row.status}
              label={row.gap <= 0 ? 'OK' : `Gap ${row.gap}`}
            />
          </div>
        ))}
      </div>
    </KpiCard>
  )
}
