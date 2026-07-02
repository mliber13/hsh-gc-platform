import { useDashboardData } from '../useDashboardData'
import { BigStat } from '../ui/BigStat'
import { KpiCard } from '../ui/KpiCard'
import { StatusPill } from '../ui/StatusPill'

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
      <div className="space-y-4">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3"
          >
            <div>
              <p className="font-medium">{row.label}</p>
              <p className="text-sm text-muted-foreground">
                {row.current} / {row.target} target
                {row.gap > 0 ? ` · need ${row.gap} more` : row.gap < 0 ? ` · ${Math.abs(row.gap)} over` : ' · at target'}
              </p>
              {row.label === 'Hanger Crews' ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {crew.subbedHangerCrews} subbed + {inHouseCrews} in-house
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

      <div className="grid gap-4 sm:grid-cols-2">
        <BigStat label="Active Finishers" value={String(manpower.finishers.current)} />
        <BigStat label="Hanger Crews" value={String(manpower.hangerCrews.current)} />
      </div>
    </KpiCard>
  )
}
