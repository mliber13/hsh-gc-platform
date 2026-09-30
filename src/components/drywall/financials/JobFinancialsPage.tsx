// ============================================================================
// Job financials — one money screen for the whole life of a job
// ============================================================================
//
// This replaces the Production and Closeout stages, which were near-twins: three of their
// five tiles were the same component, both showed estimated-vs-actual material and labour,
// both had a Refresh button, and the only real difference was which lifecycle button sat at
// the bottom.
//
// Mark, 2026-09-30: "Production and Closeout essentially mirror eachother and I can't figure
// why they both exist... Maybe instead of production and closeout we just make one screen
// that is like job financials." He is the one who reads these every day.
//
// I had argued for keeping them apart and giving Closeout a job of its own. He disagreed,
// and the code agrees with him: two pages that differ by one tile and one button are one
// page with a status on it.
//
// What the status changes here is the QUESTION, not the layout: what will this cost, what
// is it costing, what did it cost. The cost and margin tiles are always present, because
// "how is this job doing" is the same question at every stage.
//
// Deliberately NOT gated on production having started. The old Production page hard-returned
// an empty card for every earlier status, which is why the labour-rate card could not live
// there — the rates are decided at field-measurement review, weeks before stock lands.

import { useCallback, useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { format } from 'date-fns'
import { Calculator, Hammer, Package, RefreshCw, TrendingUp, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  AfterProductionCostTile,
  CurrentCrewTile,
  EstimatedVsActualLaborTile,
  EstimatedVsActualMaterialTile,
  FinalTotalCostTile,
  MarginVsBidTile,
  RunningCostTile,
} from '@/components/drywall/cost/ProjectCostTiles'
import { LaborRateAdjustmentsCard } from '@/components/drywall/labor/LaborRateAdjustmentsCard'
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
  DrywallProjectStaleError,
  fetchDrywallProjectById,
  fieldTakeoffFromLegacy,
  getChangeOrdersFromLegacy,
  getProductionTimestampsFromLegacy,
  markFullyClosed,
  markProductionComplete,
  markProductionStarted,
  quoteV2V3FromLegacy,
  revertCloseoutToProductionComplete,
  revertProductionComplete,
  saveFieldTakeoff,
} from '@/services/drywallProjectsService'
import { fetchOrgDrywallCatalogs } from '@/services/drywallCatalogsService'
import type { DrywallChangeOrder, DrywallQuoteV2V3, FieldTakeoff } from '@/types/drywall'
import { normalizeDrywallProjectStatus } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'
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

const EMPTY_LABOR_SUMMARY = {
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

export function JobFinancialsPage() {
  const { projectId, setProjectStatus } = useOutletContext<DrywallProjectShellContext>()
  const { effectiveRole } = usePermissions()
  const readOnly = !canWriteDrywallProject(effectiveRole)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string>('project-info')
  const [startedAt, setStartedAt] = useState<string | null>(null)
  const [completedAt, setCompletedAt] = useState<string | null>(null)
  const [closedAt, setClosedAt] = useState<string | null>(null)
  const [completeDateInput, setCompleteDateInput] = useState(todayDateInput)
  const [closeDateInput, setCloseDateInput] = useState(todayDateInput)
  const [editingClosedDate, setEditingClosedDate] = useState(false)
  const [assessment, setAssessment] = useState<DrywallProjectAssessment | null>(null)
  const [quote, setQuote] = useState<DrywallQuoteV2V3 | null>(null)
  const [fieldTakeoff, setFieldTakeoff] = useState<FieldTakeoff | null>(null)
  const [changeOrders, setChangeOrders] = useState<DrywallChangeOrder[]>([])
  const [catalogs, setCatalogs] = useState<OrgDrywallCatalogs | null>(null)
  const [loadedAt, setLoadedAt] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [project, nextAssessment, cats] = await Promise.all([
        fetchDrywallProjectById(projectId),
        fetchDrywallProjectAssessment(projectId).catch(() => null),
        fetchOrgDrywallCatalogs().catch(() => null),
      ])
      if (!project) {
        toast.error('Project not found')
        return
      }
      const next = normalizeDrywallProjectStatus(project.status)
      setStatus(next)
      setProjectStatus(next)

      const ts = getProductionTimestampsFromLegacy(project.legacy)
      setStartedAt(ts.productionStartedAt ?? null)
      setCompletedAt(ts.productionCompletedAt ?? null)
      setClosedAt(ts.closedAt ?? null)
      setCompleteDateInput(dateInputFromIso(ts.productionCompletedAt ?? null))
      setCloseDateInput(dateInputFromIso(ts.closedAt ?? null))
      setEditingClosedDate(false)

      setAssessment(nextAssessment)
      setQuote(quoteV2V3FromLegacy(project.legacy))
      setFieldTakeoff(fieldTakeoffFromLegacy(project.legacy))
      setChangeOrders(getChangeOrdersFromLegacy(project.legacy))
      setCatalogs(cats)
      setLoadedAt(project.updatedAtRaw)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }, [projectId, setProjectStatus])

  const refreshAssessment = useCallback(async () => {
    setRefreshing(true)
    try {
      setAssessment(await fetchDrywallProjectAssessment(projectId))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to refresh cost data')
    } finally {
      setRefreshing(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  /** Every lifecycle move reports the same way; only the call and the wording differ. */
  const runLifecycle = async (fn: () => Promise<unknown>, success: string, failure: string) => {
    if (readOnly) return
    setBusy(true)
    try {
      await fn()
      toast.success(success)
      await load()
    } catch (e: unknown) {
      if (e instanceof DrywallProjectPermissionError || e instanceof DrywallProjectStaleError) {
        toast.error(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : failure)
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

  const inProduction = status === 'production'
  const productionDone = status === 'production-complete' || status === 'closed'
  const isClosed = status === 'closed'
  const preProduction = !inProduction && !productionDone

  // `final` is only set once production is complete; before then the live figure IS the
  // answer. Closeout already resolved it this way and it is right for both.
  const cost = assessment?.final ?? assessment?.currentCost
  const finalTotal = cost?.totalCost ?? 0

  const statusLabel = isClosed
    ? 'Closed'
    : status === 'production-complete'
      ? 'Production complete'
      : inProduction
        ? 'In production'
        : 'Not started'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold tracking-tight">Job financials</h2>
        <span
          className={cn(
            'rounded-full border px-3 py-0.5 text-xs font-medium',
            isClosed
              ? 'border-slate-500/40 bg-slate-500/10 text-slate-800 dark:text-slate-200'
              : productionDone
                ? 'border-emerald-600/40 bg-emerald-600/15 text-emerald-900 dark:text-emerald-100'
                : inProduction
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                  : 'border-muted-foreground/30 bg-muted text-muted-foreground',
          )}
        >
          {statusLabel}
        </span>
        <span className="text-xs text-muted-foreground">
          {[
            startedAt && `Started ${format(new Date(startedAt), 'MMM d, yyyy')}`,
            completedAt && `Production complete ${format(new Date(completedAt), 'MMM d, yyyy')}`,
            closedAt && `Closed ${format(new Date(closedAt), 'MMM d, yyyy')}`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
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

      {preProduction && (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            Production hasn&apos;t started. The figures below are what the job is estimated and
            contracted to do; actuals fill in as labour and material land against it.
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        {productionDone ? (
          <FinalTotalCostTile icon={Calculator} total={finalTotal} live={!isClosed} />
        ) : (
          <RunningCostTile
            icon={Hammer}
            total={cost?.totalCost ?? 0}
            labor={cost?.labor.totalCost ?? 0}
            material={cost?.material.totalCost ?? 0}
            sub={cost?.sub.totalCost ?? 0}
            w2BurdenCost={cost?.labor.summary.w2BurdenCost}
          />
        )}
        <MarginVsBidTile
          icon={TrendingUp}
          margin={assessment?.margin ?? { marginPct: null, marginUsd: null, marginColor: 'neutral' }}
          contractTotal={assessment?.effectiveContractValue ?? null}
          costTotal={finalTotal}
          billedToDate={assessment?.billedToDate}
          remainingToBill={assessment?.remainingToBill}
          overbilledAmount={assessment?.overbilledAmount}
        />
        {productionDone ? (
          // What landed after the crew left. The likeliest place a misallocated invoice
          // hides, which is one of the things Mark checks at closeout.
          <AfterProductionCostTile
            icon={Hammer}
            cost={assessment?.afterProductionCost ?? null}
            finalTotal={finalTotal}
          />
        ) : (
          <CurrentCrewTile icon={Users} crew={assessment?.currentCrew ?? { names: [], total: 0 }} />
        )}
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
        actual={cost?.labor.summary ?? EMPTY_LABOR_SUMMARY}
        onDataChanged={() => void refreshAssessment()}
      />

      {/* Rates are decided at field-measurement review; this is where they get adjusted
          mid-job, which Mark does. Not gated on production, unlike the old page. */}
      <LaborRateAdjustmentsCard
        quote={quote}
        fieldTakeoff={fieldTakeoff}
        changeOrders={changeOrders}
        catalogs={catalogs}
        readOnly={readOnly}
        onSaveFieldTakeoff={async (next) => {
          const nextRaw = await saveFieldTakeoff(projectId, next, loadedAt)
          setLoadedAt(nextRaw)
          setFieldTakeoff(next)
        }}
      />

      {/* The lifecycle lives at the bottom: one button for wherever the job actually is,
          instead of a page per step. */}
      {!readOnly && (
        <div className="space-y-3 border-t pt-6">
          {preProduction && (
            <Button
              onClick={() =>
                void runLifecycle(
                  () => markProductionStarted(projectId, loadedAt),
                  'Production started',
                  'Failed to start production',
                )
              }
              disabled={busy || status !== 'order'}
              title={status === 'order' ? undefined : 'Move the job to Order first'}
            >
              {busy ? 'Updating…' : 'Mark production started'}
            </Button>
          )}

          {inProduction && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label htmlFor="jf-complete-date" className="text-xs font-medium text-muted-foreground">
                  Completion date
                </label>
                <Input
                  id="jf-complete-date"
                  type="date"
                  className="w-auto"
                  value={completeDateInput}
                  onChange={(e) => setCompleteDateInput(e.target.value)}
                  disabled={busy}
                />
              </div>
              <Button
                onClick={() =>
                  void runLifecycle(
                    () =>
                      markProductionComplete(projectId, loadedAt, isoFromDateInput(completeDateInput)),
                    'Production marked complete',
                    'Failed to complete production',
                  )
                }
                disabled={busy || !completeDateInput}
              >
                {busy ? 'Updating…' : 'Mark production complete'}
              </Button>
            </div>
          )}

          {status === 'production-complete' && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label htmlFor="jf-close-date" className="text-xs font-medium text-muted-foreground">
                  Close date
                </label>
                <Input
                  id="jf-close-date"
                  type="date"
                  className="w-auto"
                  value={closeDateInput}
                  onChange={(e) => setCloseDateInput(e.target.value)}
                  disabled={busy}
                />
              </div>
              <Button
                onClick={() =>
                  void runLifecycle(
                    () => markFullyClosed(projectId, loadedAt, isoFromDateInput(closeDateInput)),
                    'Project fully closed',
                    'Failed to close the project',
                  )
                }
                disabled={busy || !closeDateInput}
              >
                {busy ? 'Updating…' : 'Mark fully closed'}
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  void runLifecycle(
                    () => revertProductionComplete(projectId, loadedAt),
                    'Reverted to in-progress production',
                    'Failed to revert production',
                  )
                }
                disabled={busy}
              >
                {busy ? 'Updating…' : 'Reopen production'}
              </Button>
            </div>
          )}

          {isClosed && (
            <div className="flex flex-wrap items-end gap-3">
              {editingClosedDate ? (
                <>
                  <div className="space-y-1">
                    <label
                      htmlFor="jf-closed-date-edit"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Close date
                    </label>
                    <Input
                      id="jf-closed-date-edit"
                      type="date"
                      className="w-auto"
                      value={closeDateInput}
                      onChange={(e) => setCloseDateInput(e.target.value)}
                      disabled={busy}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void runLifecycle(
                        () => markFullyClosed(projectId, loadedAt, isoFromDateInput(closeDateInput)),
                        'Close date updated',
                        'Failed to update the close date',
                      )
                    }
                    disabled={busy || !closeDateInput}
                  >
                    {busy ? 'Updating…' : 'Update date'}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setCloseDateInput(dateInputFromIso(closedAt))
                      setEditingClosedDate(false)
                    }}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button variant="link" className="h-auto px-0" onClick={() => setEditingClosedDate(true)}>
                  Edit close date
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() =>
                  void runLifecycle(
                    () => revertCloseoutToProductionComplete(projectId, loadedAt),
                    'Reopened to production complete',
                    'Failed to reopen the project',
                  )
                }
                disabled={busy}
              >
                {busy ? 'Updating…' : 'Reopen'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
