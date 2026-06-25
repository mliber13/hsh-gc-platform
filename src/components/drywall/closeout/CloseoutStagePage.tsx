import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Calculator, Hammer, RefreshCw, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AfterProductionCostTile,
  FinalTotalCostTile,
  MarginVsBidTile,
} from '@/components/drywall/cost/ProjectCostTiles'
import { usePermissions } from '@/hooks/usePermissions'
import { canWriteDrywallProject } from '@/routes/RequirePermission'
import type { DrywallProjectShellContext } from '@/components/drywall/DrywallProjectShell'
import {
  fetchDrywallProjectAssessment,
  type DrywallProjectAssessment,
} from '@/services/drywallProjectCostService'
import {
  DrywallProjectPermissionError,
  fetchDrywallProjectById,
  getProductionTimestampsFromLegacy,
  markFullyClosed,
  revertCloseoutToProductionComplete,
} from '@/services/drywallProjectsService'
import { normalizeDrywallProjectStatus } from '@/types/drywall'
import { cn } from '@/lib/utils'

export function CloseoutStagePage() {
  const { projectId, setProjectStatus } = useOutletContext<DrywallProjectShellContext>()
  const { effectiveRole } = usePermissions()
  const readOnly = !canWriteDrywallProject(effectiveRole)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string>('project-info')
  const [closedAt, setClosedAt] = useState<string | null>(null)
  const [assessment, setAssessment] = useState<DrywallProjectAssessment | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [project, nextAssessment] = await Promise.all([
        fetchDrywallProjectById(projectId),
        fetchDrywallProjectAssessment(projectId).catch(() => null),
      ])
      if (!project) {
        toast.error('Project not found')
        return
      }
      const next = normalizeDrywallProjectStatus(project.status)
      setStatus(next)
      setProjectStatus(next)
      const ts = getProductionTimestampsFromLegacy(project.legacy)
      setClosedAt(ts.closedAt ?? null)
      setAssessment(nextAssessment)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }, [projectId, setProjectStatus])

  const refreshAssessment = useCallback(async () => {
    setRefreshing(true)
    try {
      const nextAssessment = await fetchDrywallProjectAssessment(projectId)
      setAssessment(nextAssessment)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to refresh cost data')
    } finally {
      setRefreshing(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  const handleClose = async () => {
    if (readOnly) return
    setBusy(true)
    try {
      await markFullyClosed(projectId)
      toast.success('Project fully closed')
      await load()
    } catch (e: unknown) {
      if (e instanceof DrywallProjectPermissionError) {
        toast.error(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to close project')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleReopen = async () => {
    if (readOnly) return
    setBusy(true)
    try {
      await revertCloseoutToProductionComplete(projectId)
      toast.success('Reopened to production complete')
      await load()
    } catch (e: unknown) {
      if (e instanceof DrywallProjectPermissionError) {
        toast.error(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to reopen project')
      }
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">
        <div className="inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  const canCloseout = status === 'production-complete' || status === 'closed'

  if (!canCloseout) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Closeout not available yet</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Mark production complete first.</p>
        </CardContent>
      </Card>
    )
  }

  const finalSummary = assessment?.final ?? assessment?.currentCost ?? null
  const finalTotal = finalSummary?.totalCost ?? null
  const isClosed = status === 'closed'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Closeout</h2>
          {isClosed && closedAt && (
            <p className="text-sm text-muted-foreground mt-1">
              Closed on {format(new Date(closedAt), 'MMMM d, yyyy')}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => void refreshAssessment()}
          disabled={refreshing}
        >
          <RefreshCw className={cn('h-4 w-4 mr-1.5', refreshing && 'animate-spin')} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <FinalTotalCostTile
          icon={Calculator}
          total={finalTotal ?? 0}
          live={!isClosed}
        />
        <MarginVsBidTile
          icon={TrendingUp}
          margin={assessment?.margin ?? { marginPct: null, marginUsd: null, marginColor: 'neutral' }}
          bidTotal={assessment?.bidSnapshot?.total ?? null}
          costTotal={finalTotal ?? 0}
        />
        <AfterProductionCostTile
          icon={Hammer}
          cost={assessment?.afterProductionCost ?? null}
          finalTotal={finalTotal}
        />
      </div>

      {!readOnly && status === 'production-complete' && (
        <Button onClick={() => void handleClose()} disabled={busy}>
          {busy ? 'Updating…' : 'Mark Fully Closed'}
        </Button>
      )}

      {!readOnly && status === 'closed' && (
        <Button variant="outline" onClick={() => void handleReopen()} disabled={busy}>
          {busy ? 'Updating…' : 'Reopen to Production Complete'}
        </Button>
      )}
    </div>
  )
}
