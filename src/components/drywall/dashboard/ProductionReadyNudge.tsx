import { useCallback, useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ArrowRight, PackageCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { usePermissions } from '@/hooks/usePermissions'
import { canWriteDrywallProject } from '@/routes/RequirePermission'
import { markProductionStarted } from '@/services/drywallProjectsService'
import {
  fetchProductionReadyNudges,
  type ProductionReadyNudge as Nudge,
} from '@/services/productionReadyService'

/**
 * Dashboard banner: jobs still in "order" whose production schedule has started.
 * Renders nothing when there are none. One click advances a job to production.
 */
export function ProductionReadyNudge() {
  const { effectiveRole } = usePermissions()
  const canAdvance = canWriteDrywallProject(effectiveRole)

  const [nudges, setNudges] = useState<Nudge[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setNudges(await fetchProductionReadyNudges())
    } catch (e) {
      // Non-critical surface — log and stay silent rather than block the dashboard.
      console.warn('fetchProductionReadyNudges:', e)
      setNudges([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const advance = async (nudge: Nudge) => {
    setBusyId(nudge.projectId)
    try {
      await markProductionStarted(nudge.projectId)
      setNudges((cur) => cur.filter((n) => n.projectId !== nudge.projectId))
      toast.success(`${nudge.projectName} moved to Production`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not move to Production')
    } finally {
      setBusyId(null)
    }
  }

  if (nudges.length === 0) return null

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="mb-3 flex items-center gap-2">
        <PackageCheck className="h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-semibold text-foreground">
            Ready for Production ({nudges.length})
          </p>
          <p className="text-xs text-muted-foreground">
            These jobs are still in Order but their production schedule has started.
          </p>
        </div>
      </div>

      <ul className="space-y-1.5">
        {nudges.map((nudge) => (
          <li
            key={nudge.projectId}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-card px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{nudge.projectName}</p>
              <p className="text-xs text-muted-foreground">
                {nudge.startedItemName} started {format(parseISO(nudge.startedDate), 'MMM d')}
              </p>
            </div>
            {canAdvance ? (
              <Button
                type="button"
                size="sm"
                className="h-8 shrink-0 gap-1 text-xs"
                disabled={busyId === nudge.projectId}
                onClick={() => void advance(nudge)}
              >
                Move to Production
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
