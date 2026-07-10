import { useCallback, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Hammer, Package, RefreshCw, TrendingUp, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useOutletContext } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  CurrentCrewTile,
  EstimatedVsActualLaborTile,
  EstimatedVsActualMaterialTile,
  MarginVsBidTile,
  RunningCostTile,
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
  markProductionComplete,
  markProductionStarted,
  revertProductionComplete,
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

export function ProductionStagePage() {
  const { projectId, setProjectStatus } = useOutletContext<DrywallProjectShellContext>()
  const { effectiveRole } = usePermissions()
  const readOnly = !canWriteDrywallProject(effectiveRole)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string>('project-info')
  const [productionStartedAt, setProductionStartedAt] = useState<string | null>(null)
  const [productionCompletedAt, setProductionCompletedAt] = useState<string | null>(null)
  const [completeDateInput, setCompleteDateInput] = useState(todayDateInput)
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
      const ts = project.legacy.productionTimestamps
      if (ts && typeof ts === 'object' && !Array.isArray(ts)) {
        const started = (ts as { productionStartedAt?: string }).productionStartedAt
        const completed = (ts as { productionCompletedAt?: string }).productionCompletedAt
        setProductionStartedAt(started ?? null)
        setProductionCompletedAt(completed ?? null)
        setCompleteDateInput(dateInputFromIso(completed ?? null))
      } else {
        setProductionStartedAt(null)
        setProductionCompletedAt(null)
        setCompleteDateInput(todayDateInput())
      }
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

  const handleStart = async () => {
    if (readOnly) return
    setBusy(true)
    try {
      await markProductionStarted(projectId)
      toast.success('Production started')
      await load()
    } catch (e: unknown) {
      if (e instanceof DrywallProjectPermissionError) {
        toast.error(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to start production')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleComplete = async () => {
    if (readOnly) return
    if (!completeDateInput) {
      toast.error('Choose a completion date')
      return
    }
    setBusy(true)
    try {
      await markProductionComplete(projectId, isoFromDateInput(completeDateInput))
      toast.success('Production marked complete')
      await load()
    } catch (e: unknown) {
      if (e instanceof DrywallProjectPermissionError) {
        toast.error(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to complete production')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleUpdateCompleteDate = async () => {
    if (readOnly) return
    if (!completeDateInput) {
      toast.error('Choose a completion date')
      return
    }
    setBusy(true)
    try {
      await markProductionComplete(projectId, isoFromDateInput(completeDateInput))
      toast.success('Completion date updated')
      await load()
    } catch (e: unknown) {
      if (e instanceof DrywallProjectPermissionError) {
        toast.error(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to update completion date')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleRevertComplete = async () => {
    if (readOnly) return
    setBusy(true)
    try {
      await revertProductionComplete(projectId)
      toast.success('Reverted to in-progress production')
      await load()
    } catch (e: unknown) {
      if (e instanceof DrywallProjectPermissionError) {
        toast.error(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to revert production')
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

  const preProduction = ['project-info', 'quote', 'field-measurement', 'order'].includes(status)
  const inProduction = status === 'production' || status === 'production-complete'

  if (preProduction) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Production hasn&apos;t started yet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Mark this project&apos;s order placed in the Order tab and move into production when
            crews are ready.
          </p>
          {!readOnly && (
            <Button onClick={() => void handleStart()} disabled={busy || status !== 'order'}>
              {busy ? 'Updating…' : 'Mark Production Started'}
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  if (!inProduction) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          This project is past the production stage. Open the Closeout tab for final steps.
        </CardContent>
      </Card>
    )
  }

  const cost = assessment?.currentCost

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Production</h2>
        <span
          className={cn(
            'rounded-full border px-3 py-0.5 text-xs font-medium',
            status === 'production'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
              : 'border-emerald-600/40 bg-emerald-600/15 text-emerald-900 dark:text-emerald-100',
          )}
        >
          {status === 'production' ? 'In Progress' : 'Production Complete'}
        </span>
        {productionStartedAt && (
          <span className="text-xs text-muted-foreground">
            Started {format(new Date(productionStartedAt), 'MMM d, yyyy')}
          </span>
        )}
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
        <RunningCostTile
          icon={Hammer}
          total={cost?.totalCost ?? 0}
          labor={cost?.labor.totalCost ?? 0}
          material={cost?.material.totalCost ?? 0}
          sub={cost?.sub.totalCost ?? 0}
          w2BurdenCost={cost?.labor.summary.w2BurdenCost}
        />
        <MarginVsBidTile
          icon={TrendingUp}
          margin={assessment?.margin ?? { marginPct: null, marginUsd: null, marginColor: 'neutral' }}
          bidTotal={assessment?.bidSnapshot?.total ?? null}
          costTotal={cost?.totalCost ?? 0}
          billedToDate={assessment?.billedToDate}
        />
        <CurrentCrewTile
          icon={Users}
          crew={assessment?.currentCrew ?? { names: [], total: 0 }}
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
        actual={cost?.material ?? { totalCost: 0, entries: [] }}
      />

      <EstimatedVsActualLaborTile
        icon={Hammer}
        estimated={assessment?.estimatedLabor ?? emptyEstimatedLaborBreakdown()}
        actual={
          cost?.labor.summary ?? {
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

      {!readOnly && status === 'production' && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="production-complete-date" className="text-xs font-medium text-muted-foreground">
              Completion date
            </label>
            <Input
              id="production-complete-date"
              type="date"
              className="w-auto"
              value={completeDateInput}
              onChange={(e) => setCompleteDateInput(e.target.value)}
              disabled={busy}
            />
          </div>
          <Button onClick={() => void handleComplete()} disabled={busy || !completeDateInput}>
            {busy ? 'Updating…' : 'Mark Production Complete'}
          </Button>
        </div>
      )}

      {!readOnly && status === 'production-complete' && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              {productionCompletedAt
                ? `Completed on ${format(new Date(productionCompletedAt), 'MMMM d, yyyy')}`
                : 'Production complete'}
            </p>
            <label htmlFor="production-complete-date-edit" className="text-xs font-medium text-muted-foreground">
              Completion date
            </label>
            <Input
              id="production-complete-date-edit"
              type="date"
              className="w-auto"
              value={completeDateInput}
              onChange={(e) => setCompleteDateInput(e.target.value)}
              disabled={busy}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => void handleUpdateCompleteDate()}
            disabled={busy || !completeDateInput}
          >
            {busy ? 'Updating…' : 'Update date'}
          </Button>
          <Button variant="outline" onClick={() => void handleRevertComplete()} disabled={busy}>
            {busy ? 'Updating…' : 'Revert to In Progress'}
          </Button>
        </div>
      )}
    </div>
  )
}
