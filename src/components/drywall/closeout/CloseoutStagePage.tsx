import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Calculator, Hammer, Package, RefreshCw, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  AfterProductionCostTile,
  EstimatedVsActualLaborTile,
  EstimatedVsActualMaterialTile,
  FinalTotalCostTile,
  MarginVsBidTile,
} from '@/components/drywall/cost/ProjectCostTiles'
import { emptyEstimatedLaborBreakdown } from '@/lib/drywall/estimatedLabor'
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

function todayDateInput(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function isoFromDateInput(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toISOString()
}

function dateInputFromIso(iso: string | null | undefined): string {
  if (!iso) return todayDateInput()
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return todayDateInput()
  return format(d, 'yyyy-MM-dd')
}

export function CloseoutStagePage() {
  const { projectId, setProjectStatus } = useOutletContext<DrywallProjectShellContext>()
  const { effectiveRole } = usePermissions()
  const readOnly = !canWriteDrywallProject(effectiveRole)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string>('project-info')
  const [closedAt, setClosedAt] = useState<string | null>(null)
  const [closeDateInput, setCloseDateInput] = useState(todayDateInput)
  const [editingClosedDate, setEditingClosedDate] = useState(false)
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
      setCloseDateInput(dateInputFromIso(ts.closedAt ?? null))
      setEditingClosedDate(false)
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
    if (!closeDateInput) {
      toast.error('Choose a close date')
      return
    }
    setBusy(true)
    try {
      await markFullyClosed(projectId, isoFromDateInput(closeDateInput))
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

  const handleUpdateClosedDate = async () => {
    if (readOnly) return
    if (!closeDateInput) {
      toast.error('Choose a close date')
      return
    }
    setBusy(true)
    try {
      await markFullyClosed(projectId, isoFromDateInput(closeDateInput))
      toast.success('Close date updated')
      await load()
    } catch (e: unknown) {
      if (e instanceof DrywallProjectPermissionError) {
        toast.error(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to update close date')
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
          {isClosed && closedAt && !editingClosedDate && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground">
                Closed on {format(new Date(closedAt), 'MMMM d, yyyy')}
              </p>
              {!readOnly && (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto px-0 text-sm"
                  onClick={() => {
                    setCloseDateInput(dateInputFromIso(closedAt))
                    setEditingClosedDate(true)
                  }}
                >
                  Edit date
                </Button>
              )}
            </div>
          )}
          {isClosed && !readOnly && editingClosedDate && (
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label htmlFor="closeout-closed-date" className="text-xs font-medium text-muted-foreground">
                  Close date
                </label>
                <Input
                  id="closeout-closed-date"
                  type="date"
                  className="w-auto"
                  value={closeDateInput}
                  onChange={(e) => setCloseDateInput(e.target.value)}
                  disabled={busy}
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleUpdateClosedDate()}
                disabled={busy || !closeDateInput}
              >
                {busy ? 'Updating…' : 'Update date'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCloseDateInput(dateInputFromIso(closedAt))
                  setEditingClosedDate(false)
                }}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
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
          contractTotal={assessment?.effectiveContractValue ?? null}
          costTotal={finalTotal ?? 0}
          billedToDate={assessment?.billedToDate}
          remainingToBill={assessment?.remainingToBill}
          overbilledAmount={assessment?.overbilledAmount}
        />
        <AfterProductionCostTile
          icon={Hammer}
          cost={assessment?.afterProductionCost ?? null}
          finalTotal={finalTotal}
        />
      </div>

      <EstimatedVsActualMaterialTile
        icon={Package}
        estimated={
          assessment?.estimatedMaterial ?? {
            components: [],
            salesTax: 0,
            totalPreTax: 0,
            totalWithTax: 0,
          }
        }
        actual={
          assessment?.final?.material ??
          assessment?.currentCost.material ?? { totalCost: 0, entries: [] }
        }
      />

      <EstimatedVsActualLaborTile
        icon={Hammer}
        estimated={assessment?.estimatedLabor ?? emptyEstimatedLaborBreakdown()}
        actual={
          (assessment?.final ?? assessment?.currentCost)?.labor.summary ?? {
            totalCost: 0,
            totalHours: 0,
            totalOvertimeHours: 0,
            totalPieces: 0,
            w2BurdenCost: 0,
            byCategory: {
              hanger: 0,
              finisher: 0,
              components: 0,
              prepClean: 0,
              legacy: 0,
              hourly: 0,
              other: 0,
            },
            byPayPeriod: [],
            entries: [],
          }
        }
        onDataChanged={() => void refreshAssessment()}
      />

      {!readOnly && status === 'production-complete' && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="closeout-close-date" className="text-xs font-medium text-muted-foreground">
              Close date
            </label>
            <Input
              id="closeout-close-date"
              type="date"
              className="w-auto"
              value={closeDateInput}
              onChange={(e) => setCloseDateInput(e.target.value)}
              disabled={busy}
            />
          </div>
          <Button onClick={() => void handleClose()} disabled={busy || !closeDateInput}>
            {busy ? 'Updating…' : 'Mark Fully Closed'}
          </Button>
        </div>
      )}

      {!readOnly && status === 'closed' && (
        <Button variant="outline" onClick={() => void handleReopen()} disabled={busy}>
          {busy ? 'Updating…' : 'Reopen to Production Complete'}
        </Button>
      )}
    </div>
  )
}
