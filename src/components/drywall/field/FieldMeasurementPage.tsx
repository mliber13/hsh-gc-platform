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
import { canReviewDrywallFieldTakeoff, canWriteDrywallField } from '@/routes/RequirePermission'
import { fetchOrgDrywallCatalogs } from '@/services/drywallCatalogsService'
import {
  DrywallProjectPermissionError,
  fetchDrywallProjectById,
  fetchDrywallQuoteV2V3,
  fetchFieldTakeoff,
  getIntakeSourceFromLegacy,
  getQuoteOutcomeFromLegacy,
  recordBelowFloorApproval,
  saveFieldTakeoff,
  saveFieldTakeoffAndAdvance,
  updateDrywallProjectInfo,
} from '@/services/drywallProjectsService'
import { isDrywallQuoteV3 } from '@/types/drywall'
import { v2QuoteFromV3Snapshot } from '@/lib/drywall/convertQuoteV2ToV3'
import type { DrywallQuote, DrywallQuoteV2V3, FieldTakeoff } from '@/types/drywall'
import {
  FieldAccessoriesSection,
  FieldChecklistSection,
  FieldMeasurementsSection,
  FieldPhotosSection,
  FieldProjectSiteSection,
} from './inputs'
import { FieldVarianceSummary } from './FieldVarianceSummary'
import { FieldTakeoffReviewBanner } from './FieldTakeoffReviewBanner'
import type { SetFieldTakeoff } from './fieldTakeoffState'

export function FieldMeasurementPage() {
  const { projectId, setProjectName } = useOutletContext<DrywallProjectShellContext>()
  const navigate = useNavigate()
  const { effectiveRole } = usePermissions()
  const readOnly = !canWriteDrywallField(effectiveRole)
  const canReview = canReviewDrywallFieldTakeoff(effectiveRole)

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
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [intakeSource, setIntakeSource] = useState<'po' | 'quote' | null>(null)
  const [poBidTotal, setPoBidTotal] = useState<number | null>(null)
  const [belowFloorOpen, setBelowFloorOpen] = useState(false)
  const [belowFloorReason, setBelowFloorReason] = useState('')
  const [marginEval, setMarginEval] = useState<MarginFloorEvaluation | null>(null)
  const [checkingMargin, setCheckingMargin] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [project, q, t] = await Promise.all([
        fetchDrywallProjectById(projectId),
        fetchDrywallQuoteV2V3(projectId),
        fetchFieldTakeoff(projectId),
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
      setSavedSnapshot(JSON.stringify(t))
      setIntakeSource(getIntakeSourceFromLegacy(project.legacy))
      const { bidSnapshot } = getQuoteOutcomeFromLegacy(project.legacy)
      setPoBidTotal(bidSnapshot?.total ?? null)
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

  const canContinue =
    measuredSqft > 0 && checklistComplete && Boolean(projectAddress?.trim())

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
      await saveFieldTakeoff(projectId, takeoff)
      const addr = projectAddress.trim()
      if (addr !== savedAddress) {
        await updateDrywallProjectInfo(projectId, {
          ...projectInfo,
          address: addr,
        })
        setSavedAddress(addr)
      }
      setSavedSnapshot(JSON.stringify(takeoff))
      toast.success('Field measurement saved')
    } catch (e) {
      if (e instanceof DrywallProjectPermissionError) toast.error(e.message)
      else toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const advanceToOrder = async () => {
    if (!takeoff) return
    await saveFieldTakeoffAndAdvance(projectId, takeoff)
    toast.success('Advanced to Order')
    navigate(`/drywall/projects/${projectId}/order`)
  }

  const handleContinueOrder = async () => {
    if (!takeoff || readOnly) return
    if (!canContinue) {
      toast.error('Add measurements, complete the checklist, and set a job address before continuing.')
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
      await recordBelowFloorApproval(projectId, {
        trigger: 'field_measurement_to_order',
        marginAtApproval: marginEval.marginPct ?? 0,
        bidTotal: marginEval.bidTotal,
        estimatedCost: marginEval.estimatedCost,
        floorTarget: marginEval.floorTarget,
        reason: belowFloorReason.trim(),
      })
      await advanceToOrder()
      setBelowFloorOpen(false)
      setBelowFloorReason('')
      setMarginEval(null)
    } catch (e) {
      if (e instanceof DrywallProjectPermissionError) toast.error(e.message)
      else toast.error(e instanceof Error ? e.message : 'Could not advance stage')
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
      await saveFieldTakeoff(projectId, updated)
      setTakeoff(updated)
      setSavedSnapshot(JSON.stringify(updated))
      toast.success(toastMessage)
    } catch (e) {
      if (e instanceof DrywallProjectPermissionError) toast.error(e.message)
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

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Field measurement</h2>
          <p className="text-muted-foreground mt-1">
            Capture verified site measurements for the order package.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!readOnly && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={!isDirty || saving}
                onClick={() => void handleSave()}
              >
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
              <Button
                type="button"
                disabled={!canContinue || saving || checkingMargin}
                onClick={() => void handleContinueOrder()}
              >
                {checkingMargin ? 'Checking margin…' : 'Continue to order'}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </>
          )}
        </div>
      </div>

      <FieldTakeoffReviewBanner
        takeoff={takeoff}
        canReview={canReview}
        busy={reviewBusy || saving}
        onApprove={handleApproveTakeoff}
        onReject={handleRejectTakeoff}
      />

      <div className="flex flex-wrap gap-3">
        <div className="rounded-lg border px-4 py-2">
          <p className="text-xs uppercase text-muted-foreground">Quoted sqft</p>
          <p className="text-lg font-semibold">{quoteSqft ? quoteSqft.toLocaleString() : '—'}</p>
        </div>
        <div className="rounded-lg border px-4 py-2">
          <p className="text-xs uppercase text-muted-foreground">Measured sqft</p>
          <p className="text-lg font-semibold">
            {measuredSqft ? measuredSqft.toLocaleString() : '—'}
          </p>
        </div>
      </div>

      <FieldProjectSiteSection
        projectAddress={projectAddress}
        onProjectAddressChange={setProjectAddress}
        takeoff={takeoff}
        onPatchTakeoff={patchTakeoff}
        readOnly={readOnly}
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <FieldMeasurementsSection
            takeoff={takeoff}
            readOnly={readOnly}
            onChange={setTakeoffField}
          />
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
            onPhotosChange={() => void load()}
          />
        </div>
        <div className="space-y-6">
          <FieldVarianceSummary quoteSqft={quoteSqft} measuredSqft={measuredSqft} />

          <FieldChecklistSection
            takeoff={takeoff}
            readOnly={readOnly}
            onToggleItem={toggleChecklist}
          />
        </div>
      </div>

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
