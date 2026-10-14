import { useCallback, useEffect, useMemo, useState, type SetStateAction } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { ArrowRight, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { DrywallProjectShellContext } from '@/components/drywall/DrywallProjectShell'
import { BelowFloorMarginDialog } from '@/components/drywall/margin/BelowFloorMarginDialog'
import { computeMeasuredSqft, fieldTakeoffWithTotals, quotedSqftWithWaste } from '@/lib/drywall/fieldMeasurementUtils'
import {
  computePoEstimatedCost,
  evaluateMarginVsFloor,
  type MarginFloorEvaluation,
} from '@/lib/drywall/marginFloor'
import { usePermissions } from '@/hooks/usePermissions'
import { canReviewDrywallFieldTakeoff, canWriteDrywallField, canWriteDrywallProject } from '@/routes/RequirePermission'
import { fetchOrgDrywallCatalogs } from '@/services/drywallCatalogsService'
import {
  DrywallProjectPermissionError,
  DrywallProjectStaleError,
  fetchChangeOrders,
  fetchDrywallProjectById,
  fetchDrywallQuoteV2V3,
  fetchFieldTakeoff,
  getIntakeSourceFromLegacy,
  getOrdersFromLegacy,
  getQuoteOutcomeFromLegacy,
  recordBelowFloorApproval,
  saveFieldTakeoff,
  saveFieldTakeoffAndAdvance,
  updateDrywallProjectInfo,
} from '@/services/drywallProjectsService'
import { isDrywallQuoteV3, normalizeDrywallProjectStatus } from '@/types/drywall'
import { v2QuoteFromV3Snapshot } from '@/lib/drywall/convertQuoteV2ToV3'
import type {
  DrywallChangeOrder,
  DrywallOrder,
  DrywallProjectStatus,
  DrywallQuote,
  DrywallQuoteV2V3,
  FieldTakeoff,
} from '@/types/drywall'
import {
  FieldAccessoriesSection,
  FieldBeadSection,
  FieldChecklistSection,
  FieldMeasurementsSection,
  FieldPhotosSection,
  FieldProjectSiteSection,
} from './inputs'
import { FieldVarianceSummary } from './FieldVarianceSummary'
import { FieldTakeoffReviewBanner } from './FieldTakeoffReviewBanner'
import { FieldFlowStep, type FieldFlowStepState } from './FieldFlowStep'
import { FieldOrdersStep } from './FieldOrdersStep'
import {
  currentFieldStep,
  isLaborRatesApproved,
  isMeasurementApproved,
  type FieldStep,
} from '@/lib/drywall/fieldReview'
import { LaborRateAdjustmentsCard } from '@/components/drywall/labor/LaborRateAdjustmentsCard'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'
import type { SetFieldTakeoff } from './fieldTakeoffState'

export function FieldMeasurementPage() {
  const { projectId, setProjectName } = useOutletContext<DrywallProjectShellContext>()
  const navigate = useNavigate()
  const { effectiveRole } = usePermissions()
  const readOnly = !canWriteDrywallField(effectiveRole)
  const canReview = canReviewDrywallFieldTakeoff(effectiveRole)
  const ratesReadOnly = !canWriteDrywallProject(effectiveRole)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [projectAddress, setProjectAddress] = useState('')
  const [projectInfo, setProjectInfo] = useState({
    name: '',
    client: '',
    notes: '',
  })
  const [savedAddress, setSavedAddress] = useState('')
  const [quote, setQuote] = useState<DrywallQuoteV2V3 | null>(null)
  const [takeoff, setTakeoff] = useState<FieldTakeoff | null>(null)
  const [changeOrders, setChangeOrders] = useState<DrywallChangeOrder[]>([])
  const [catalogs, setCatalogs] = useState<OrgDrywallCatalogs | null>(null)
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [intakeSource, setIntakeSource] = useState<'po' | 'quote' | null>(null)
  const [poBidTotal, setPoBidTotal] = useState<number | null>(null)
  const [belowFloorOpen, setBelowFloorOpen] = useState(false)
  const [belowFloorReason, setBelowFloorReason] = useState('')
  const [marginEval, setMarginEval] = useState<MarginFloorEvaluation | null>(null)
  const [checkingMargin, setCheckingMargin] = useState(false)
  const [loadedAt, setLoadedAt] = useState('')
  const [projectStatus, setProjectStatus] = useState<DrywallProjectStatus | null>(null)
  const [orders, setOrders] = useState<DrywallOrder[]>([])
  // Which steps are unfolded. Seeded once with the step the job is on (null until loaded).
  const [openSteps, setOpenSteps] = useState<Set<FieldStep> | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [project, q, t, co, cats] = await Promise.all([
        fetchDrywallProjectById(projectId),
        fetchDrywallQuoteV2V3(projectId),
        fetchFieldTakeoff(projectId),
        fetchChangeOrders(projectId),
        fetchOrgDrywallCatalogs().catch(() => null),
      ])
      if (!project) {
        toast.error('Project not found')
        navigate('/drywall', { replace: true })
        return
      }
      setProjectName(project.name)
      setProjectAddress(project.address)
      setSavedAddress(project.address)
      setProjectInfo({
        name: project.name,
        client: project.client,
        notes: project.notes,
      })
      setQuote(q)
      setTakeoff(t)
      setChangeOrders(co)
      setCatalogs(cats)
      setSavedSnapshot(JSON.stringify(t))
      setIntakeSource(getIntakeSourceFromLegacy(project.legacy))
      const { bidSnapshot } = getQuoteOutcomeFromLegacy(project.legacy)
      setPoBidTotal(bidSnapshot?.total ?? null)
      setProjectStatus(normalizeDrywallProjectStatus(project.status))
      setOrders(getOrdersFromLegacy(project.legacy))
      setLoadedAt(project.updatedAtRaw)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load field measurement')
    } finally {
      setLoading(false)
    }
  }, [projectId, navigate, setProjectName])

  useEffect(() => {
    void load()
  }, [load])

  const quoteSqft = useMemo(() => quotedSqftWithWaste(quote), [quote])
  /** v2-shape projection of the quote for legacy components (FieldAccessoriesSection). */
  const legacyQuote = useMemo<DrywallQuote | null>(() => {
    if (!quote) return null
    if (isDrywallQuoteV3(quote)) {
      return v2QuoteFromV3Snapshot(quote.legacyV2Snapshot)
    }
    return quote
  }, [quote])
  const measuredSqft = useMemo(
    () => (takeoff ? computeMeasuredSqft(takeoff.measurements) : 0),
    [takeoff],
  )

  const isDirty = useMemo(
    () => (takeoff ? JSON.stringify(takeoff) !== savedSnapshot : false),
    [takeoff, savedSnapshot],
  )

  const checklistComplete =
    takeoff?.checklist?.filter((c) => c.completed).length === takeoff?.checklist?.length

  const measurementApproved = isMeasurementApproved(takeoff)
  const ratesApproved = isLaborRatesApproved(takeoff)
  const step = currentFieldStep(takeoff, measuredSqft)

  // Rates before ordering (IA §13): moving to Order now also needs approved rates.
  const canContinue =
    measuredSqft > 0 && checklistComplete && Boolean(projectAddress?.trim()) && ratesApproved
  // Only a job not yet at Order moves there; a job in production must not be sent back.
  const preOrder =
    projectStatus === 'project-info' || projectStatus === 'quote' || projectStatus === 'field-measurement'

  useEffect(() => {
    if (!loading && takeoff && openSteps === null) setOpenSteps(new Set([step]))
  }, [loading, takeoff, openSteps, step])

  const toggleStep = (s: FieldStep) =>
    setOpenSteps((prev) => {
      const next = new Set(prev ?? [])
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  const stepState = (s: FieldStep): FieldFlowStepState => {
    const order: FieldStep[] = ['measure', 'approve_measurement', 'approve_rates', 'order']
    const at = order.indexOf(step)
    const i = order.indexOf(s)
    if (s === 'order') return ratesApproved ? 'current' : 'locked'
    if (i < at) return 'done'
    if (i === at) return 'current'
    return 'locked'
  }

  const handleSave = async () => {
    if (!takeoff || readOnly) return

    const measurementRows = takeoff.measurements ?? []
    const hasMeasurementRows = measurementRows.length > 0
    const measuredFromRows = computeMeasuredSqft(measurementRows)
    if (hasMeasurementRows && measuredFromRows === 0) {
      toast.error(
        'Measurement rows have zero total sqft. Check board width, length, and quantity before saving.',
      )
      return
    }

    setSaving(true)
    try {
      // Publish the new timestamp after each write. A failure in the second must not
      // discard what the first already told us, or the page is wedged on "changed
      // somewhere else" until a reload throws the operator's measurement away.
      let at = await saveFieldTakeoff(projectId, takeoff, loadedAt)
      setLoadedAt(at)
      const addr = projectAddress.trim()
      if (addr !== savedAddress) {
        const updated = await updateDrywallProjectInfo(
          projectId,
          {
            ...projectInfo,
            address: addr,
          },
          at,
        )
        at = updated.updatedAtRaw
        setLoadedAt(at)
        setSavedAddress(addr)
      }
      // saveFieldTakeoff recomputes totalMeasuredSqft before writing, so page state was
      // left holding whatever the total was at load — stale for the rest of the session
      // once areas were added. Adopt what was actually stored.
      const stored = fieldTakeoffWithTotals(takeoff)
      setTakeoff(stored)
      setSavedSnapshot(JSON.stringify(stored))
      toast.success('Field measurement saved')
    } catch (e) {
      if (
        e instanceof DrywallProjectPermissionError ||
        e instanceof DrywallProjectStaleError
      ) toast.error(e.message)
      else toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const advanceToOrder = async (at = loadedAt) => {
    if (!takeoff) return
    const nextRaw = await saveFieldTakeoffAndAdvance(projectId, takeoff, at)
    setLoadedAt(nextRaw)
    setProjectStatus('order')
    // The order is made here now (step 4), against its stock delivery on the schedule.
    setOpenSteps(new Set<FieldStep>(['order']))
    toast.success('Moved to Order — attach the order to its stock delivery below')
  }

  const handleContinueOrder = async () => {
    if (!takeoff || readOnly) return
    if (!canContinue) {
      toast.error(
        'Measure, complete the checklist, set a job address, and approve the measurement and labor rates before moving to Order.',
      )
      return
    }
    if (isDirty) {
      toast.error('Save your changes before continuing to order.')
      return
    }

    if (intakeSource === 'po') {
      setCheckingMargin(true)
      try {
        const catalogs = await fetchOrgDrywallCatalogs()
        const fieldSqft = fieldTakeoffWithTotals(takeoff).totalMeasuredSqft ?? measuredSqft
        const bidTotal = poBidTotal ?? 0
        const estimatedCost = computePoEstimatedCost(fieldSqft, catalogs.poEstimatedCostPerSqft)
        const evaluation = evaluateMarginVsFloor(
          bidTotal,
          estimatedCost,
          catalogs.marginFloorTarget,
        )
        if (evaluation.belowFloor) {
          setMarginEval(evaluation)
          setBelowFloorReason('')
          setBelowFloorOpen(true)
          return
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to evaluate margin')
        return
      } finally {
        setCheckingMargin(false)
      }
    }

    setSaving(true)
    try {
      await advanceToOrder()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not advance stage')
    } finally {
      setSaving(false)
    }
  }

  const handleBelowFloorContinue = async () => {
    if (!takeoff || !marginEval || !belowFloorReason.trim()) return
    setSaving(true)
    try {
      const { updatedAtRaw } = await recordBelowFloorApproval(
        projectId,
        {
          trigger: 'field_measurement_to_order',
          marginAtApproval: marginEval.marginPct ?? 0,
          bidTotal: marginEval.bidTotal,
          estimatedCost: marginEval.estimatedCost,
          floorTarget: marginEval.floorTarget,
          reason: belowFloorReason.trim(),
        },
        loadedAt,
      )
      await advanceToOrder(updatedAtRaw)
      setBelowFloorOpen(false)
      setBelowFloorReason('')
      setMarginEval(null)
    } catch (e) {
      if (e instanceof DrywallProjectPermissionError || e instanceof DrywallProjectStaleError) {
        toast.error(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Could not advance stage')
      }
    } finally {
      setSaving(false)
    }
  }

  const patchTakeoff = (patch: Partial<FieldTakeoff>) => {
    setTakeoff((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  /** Child sections use functional updates; page state is nullable until load completes. */
  const setTakeoffField: SetFieldTakeoff = useCallback((value: SetStateAction<FieldTakeoff>) => {
    setTakeoff((prev) => {
      if (!prev) return prev
      return typeof value === 'function' ? value(prev) : value
    })
  }, [])

  const toggleChecklist = (id: string) => {
    if (!takeoff || readOnly) return
    patchTakeoff({
      checklist: takeoff.checklist.map((item) =>
        item.id === id ? { ...item, completed: !item.completed } : item,
      ),
    })
  }

  const persistReviewUpdate = async (patch: Partial<FieldTakeoff>, toastMessage: string) => {
    if (!takeoff || !canReview) return
    setReviewBusy(true)
    try {
      const updated = fieldTakeoffWithTotals({ ...takeoff, ...patch })
      const nextRaw = await saveFieldTakeoff(projectId, updated, loadedAt)
      setLoadedAt(nextRaw)
      setTakeoff(updated)
      setSavedSnapshot(JSON.stringify(updated))
      toast.success(toastMessage)
    } catch (e) {
      if (
        e instanceof DrywallProjectPermissionError ||
        e instanceof DrywallProjectStaleError
      ) toast.error(e.message)
      else toast.error(e instanceof Error ? e.message : 'Review action failed')
    } finally {
      setReviewBusy(false)
    }
  }

  const handleApproveTakeoff = async () => {
    const now = new Date().toISOString()
    await persistReviewUpdate(
      {
        reviewStatus: 'approved',
        approvedAt: now,
        rejectedAt: null,
        rejectionNotes: null,
      },
      'Measurements approved',
    )
  }

  const handleRejectTakeoff = async (notes: string) => {
    const now = new Date().toISOString()
    await persistReviewUpdate(
      {
        reviewStatus: 'rejected',
        rejectedAt: now,
        rejectionNotes: notes,
        approvedAt: null,
      },
      'Sent back to measurer for changes',
    )
  }

  if (loading || !takeoff) {
    return <p className="text-muted-foreground p-6">Loading field measurement…</p>
  }

  const reviewSummary =
    takeoff.reviewStatus === 'pending_review'
      ? 'Submitted by the measurer — waiting for review'
      : takeoff.reviewStatus === 'rejected'
        ? 'Sent back to the measurer for changes'
        : measurementApproved
          ? 'Approved'
          : measuredSqft > 0
            ? 'Not reviewed yet'
            : 'Waiting on measurements'
  const rates = takeoff.reviewApprovedRates as Record<string, unknown> | undefined
  const ratesSummary = ratesApproved
    ? `Hanger $${Number(rates?.hangerRate ?? 0).toFixed(2)} · finisher $${Number(rates?.finisherRate ?? 0).toFixed(2)} · prep $${Number(rates?.prepCleanRate ?? 0).toFixed(2)} per sqft`
    : measurementApproved
      ? 'Not approved yet'
      : 'Waiting on measurement approval'
  const activeOrders = orders.filter((o) => o.status !== 'cancelled')
  const ordersSummary = !ratesApproved
    ? 'Waiting on labor rates'
    : activeOrders.length === 0
      ? 'No order yet'
      : `${activeOrders.length} order${activeOrders.length === 1 ? '' : 's'} · ${activeOrders.map((o) => o.status).join(', ')}`
  const isOpen = (s: FieldStep) => openSteps?.has(s) ?? false

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-6xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Field</h2>
          <p className="text-muted-foreground mt-1">
            Measure, approve the measurement, approve the labor rates, then order the material.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-lg border px-3 py-1.5 text-sm">
            <span className="text-muted-foreground">Quoted </span>
            <span className="font-semibold">{quoteSqft ? quoteSqft.toLocaleString() : '—'}</span>
            <span className="text-muted-foreground"> · Measured </span>
            <span className="font-semibold">{measuredSqft ? measuredSqft.toLocaleString() : '—'}</span>
          </div>
          {!readOnly && (
            <Button
              type="button"
              variant="outline"
              disabled={!isDirty || saving}
              onClick={() => void handleSave()}
            >
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          )}
        </div>
      </div>

      <FieldFlowStep
        number={1}
        title="Measure"
        state={stepState('measure')}
        summary={measuredSqft > 0 ? `${measuredSqft.toLocaleString()} sqft measured` : 'Nothing measured yet'}
        open={isOpen('measure')}
        onToggle={() => toggleStep('measure')}
      >
        <FieldProjectSiteSection
          projectAddress={projectAddress}
          onProjectAddressChange={setProjectAddress}
          takeoff={takeoff}
          onPatchTakeoff={patchTakeoff}
          readOnly={readOnly}
        />
        <FieldMeasurementsSection takeoff={takeoff} readOnly={readOnly} onChange={setTakeoffField} />
        <FieldBeadSection takeoff={takeoff} readOnly={readOnly} onChange={setTakeoffField} />
        <FieldAccessoriesSection
          takeoff={takeoff}
          measuredSqft={measuredSqft}
          quote={legacyQuote}
          readOnly={readOnly}
          onChange={setTakeoffField}
        />
        <FieldPhotosSection
          projectId={projectId}
          readOnly={readOnly}
          loadedAt={loadedAt}
          onLoadedAtChange={setLoadedAt}
          onPhotosChange={() => void load()}
        />
      </FieldFlowStep>

      {/* Verify, then compare, then decide (Mark, 2026-09-30) — the checklist is the approval
          question, the variance is what it is weighed against. */}
      <FieldFlowStep
        number={2}
        title="Approve measurement"
        state={stepState('approve_measurement')}
        summary={reviewSummary}
        open={isOpen('approve_measurement')}
        onToggle={() => toggleStep('approve_measurement')}
      >
        <FieldChecklistSection takeoff={takeoff} readOnly={readOnly} onToggleItem={toggleChecklist} />
        <FieldVarianceSummary quoteSqft={quoteSqft} measuredSqft={measuredSqft} />
        <FieldTakeoffReviewBanner
          takeoff={takeoff}
          measuredSqft={measuredSqft}
          canReview={canReview && !isDirty}
          busy={reviewBusy || saving}
          onApprove={handleApproveTakeoff}
          onReject={handleRejectTakeoff}
        />
        {isDirty && canReview ? (
          <p className="text-xs text-muted-foreground">Save your changes before approving.</p>
        ) : null}
      </FieldFlowStep>

      {/* Rates are decided after digesting the measurement and notes, and before anything is
          ordered (Mark, 2026-10-14). They stay adjustable mid-job on Financials. */}
      <FieldFlowStep
        number={3}
        title="Approve labor rates"
        state={stepState('approve_rates')}
        summary={ratesSummary}
        open={isOpen('approve_rates')}
        onToggle={() => toggleStep('approve_rates')}
      >
        <LaborRateAdjustmentsCard
          quote={quote}
          fieldTakeoff={takeoff}
          changeOrders={changeOrders}
          catalogs={catalogs}
          readOnly={ratesReadOnly}
          onSaveFieldTakeoff={async (next) => {
            const nextRaw = await saveFieldTakeoff(projectId, next, loadedAt)
            setLoadedAt(nextRaw)
            setTakeoff(next)
            setSavedSnapshot(JSON.stringify(next))
          }}
        />
        {!readOnly && preOrder ? (
          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <Button
              type="button"
              disabled={!canContinue || saving || checkingMargin || isDirty}
              onClick={() => void handleContinueOrder()}
            >
              {checkingMargin ? 'Checking margin…' : 'Move to Order'}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
            {!ratesApproved ? (
              <span className="text-xs text-muted-foreground">Approve the labor rates first.</span>
            ) : !checklistComplete || !projectAddress?.trim() ? (
              <span className="text-xs text-muted-foreground">
                Finish the checklist and set the job address first.
              </span>
            ) : null}
          </div>
        ) : null}
      </FieldFlowStep>

      <FieldFlowStep
        number={4}
        title="Material orders"
        state={stepState('order')}
        summary={ordersSummary}
        open={isOpen('order')}
        onToggle={() => toggleStep('order')}
      >
        <FieldOrdersStep
          projectId={projectId}
          orders={orders}
          ratesApproved={ratesApproved}
          readOnly={ratesReadOnly}
        />
      </FieldFlowStep>

      {isDirty && !readOnly && (
        <p className="text-sm text-amber-700">You have unsaved changes.</p>
      )}

      <BelowFloorMarginDialog
        open={belowFloorOpen}
        onOpenChange={(open) => {
          setBelowFloorOpen(open)
          if (!open) {
            setBelowFloorReason('')
            setMarginEval(null)
          }
        }}
        evaluation={marginEval}
        variant="field_measurement_to_order"
        reason={belowFloorReason}
        onReasonChange={setBelowFloorReason}
        busy={saving}
        onConfirm={() => void handleBelowFloorContinue()}
      />
    </div>
  )
}
