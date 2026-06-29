import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react'
import { ArrowLeft, RefreshCw, Save, Send } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { usePageTitle } from '@/contexts/PageTitleContext'
import {
  FieldAccessoriesSection,
  FieldChecklistSection,
  FieldMeasurementsSection,
  FieldPhotosSection,
  FieldProjectSiteSection,
} from '@/components/drywall/field/inputs'
import type { SetFieldTakeoff } from '@/components/drywall/field/fieldTakeoffState'
import { usePermissions } from '@/hooks/usePermissions'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { isMeasurerSpecialty } from '@/lib/drywall/crewSpecialty'
import {
  crewMeasureStatusLabel,
  crewMeasureStatusPillClass,
  crewMeasureWorkflowStatus,
} from '@/lib/drywall/crewMeasureStatus'
import { formatReviewTimestamp } from '@/components/drywall/field/FieldTakeoffReviewBanner'
import { fieldTakeoffWithTotals, computeMeasuredSqft } from '@/lib/drywall/fieldMeasurementUtils'
import { isCrewRole } from '@/lib/rbac'
import { saveFieldTakeoff } from '@/services/drywallProjectsService'
import {
  CrewFieldTakeoffSaveError,
  CrewWorkspacePermissionError,
  fetchCrewMeasurePage,
  fetchCrewMeasurePageForPreview,
  saveFieldTakeoffAsMeasurer,
} from '@/services/crewWorkspaceService'
import type { CrewMeasurePageContext } from '@/types/crew'
import type { FieldTakeoff } from '@/types/drywall'

type PagePhase = 'loading' | 'redirect' | 'ready' | 'error'

function isTakeoffLocked(status: CrewMeasurePageContext['workflowStatus']): boolean {
  return status === 'pending_review' || status === 'approved'
}

function confirmDiscardChanges(): boolean {
  return window.confirm('You have unsaved changes. Leave without saving?')
}

export function CrewMeasurePage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const { effectiveRole } = usePermissions()
  const isPreview = !isCrewRole(effectiveRole)

  const [phase, setPhase] = useState<PagePhase>('loading')
  const [context, setContext] = useState<CrewMeasurePageContext | null>(null)
  const [takeoff, setTakeoff] = useState<FieldTakeoff | null>(null)
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const redirectingRef = useRef(false)

  const pageTitle = context ? `Measure — ${context.projectName}` : 'Measure'
  usePageTitle(pageTitle)

  const syncFormFromContext = useCallback((data: CrewMeasurePageContext) => {
    const snapshot = JSON.stringify(data.fieldTakeoff)
    setTakeoff(data.fieldTakeoff)
    setSavedSnapshot(snapshot)
  }, [])

  const load = useCallback(async () => {
    if (!projectId) return

    setError(null)
    setPhase('loading')

    try {
      const data = isPreview
        ? await fetchCrewMeasurePageForPreview(projectId)
        : await fetchCrewMeasurePage(projectId)

      if (!isPreview && !isMeasurerSpecialty(data.specialty)) {
        redirectingRef.current = true
        setPhase('redirect')
        navigate(`/crew/projects/${projectId}`, { replace: true })
        return
      }

      setContext(data)
      syncFormFromContext(data)
      setPhase('ready')
    } catch (e) {
      if (redirectingRef.current) return
      if (e instanceof CrewWorkspacePermissionError) {
        setError('You do not have access to measure this project.')
      } else {
        setError(e instanceof Error ? e.message : 'Failed to load measure page')
      }
      setPhase('error')
    }
  }, [isPreview, navigate, projectId, syncFormFromContext])

  useEffect(() => {
    redirectingRef.current = false
    void load()
  }, [load])

  const isDirty = useMemo(
    () => (takeoff ? JSON.stringify(takeoff) !== savedSnapshot : false),
    [takeoff, savedSnapshot],
  )

  const formReadOnly = useMemo(() => {
    if (!context) return true
    if (isTakeoffLocked(context.workflowStatus)) return true
    if (!isPreview && !context.hasMeasureAssignment) return true
    return false
  }, [context, isPreview])

  const setTakeoffField: SetFieldTakeoff = useCallback((value: SetStateAction<FieldTakeoff>) => {
    setTakeoff((prev) => {
      if (!prev) return prev
      return typeof value === 'function' ? value(prev) : value
    })
  }, [])

  const patchTakeoff = useCallback((patch: Partial<FieldTakeoff>) => {
    setTakeoff((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [])

  const handleBack = useCallback(() => {
    if (!projectId) return
    if (isDirty && !formReadOnly && !confirmDiscardChanges()) return
    navigate(`/crew/projects/${projectId}`)
  }, [formReadOnly, isDirty, navigate, projectId])

  const handleRefresh = useCallback(() => {
    if (isDirty && !formReadOnly && !confirmDiscardChanges()) return
    void load()
  }, [formReadOnly, isDirty, load])

  const measuredSqft = useMemo(
    () => (takeoff ? computeMeasuredSqft(takeoff.measurements) : 0),
    [takeoff],
  )

  const canSubmitForReview = useMemo(() => {
    if (!context || formReadOnly || isPreview) return false
    if (!context.hasMeasureAssignment) return false
    if (isDirty || saving || submitting) return false
    return measuredSqft > 0
  }, [context, formReadOnly, isDirty, isPreview, measuredSqft, saving, submitting])

  const syncPhotosFromServer = useCallback(async () => {
    if (!projectId) return
    try {
      const data = isPreview
        ? await fetchCrewMeasurePageForPreview(projectId)
        : await fetchCrewMeasurePage(projectId)
      setTakeoff((prev) => (prev ? { ...prev, photos: data.fieldTakeoff.photos } : prev))
      setSavedSnapshot((snap) => {
        if (!snap) return snap
        const parsed = JSON.parse(snap) as FieldTakeoff
        return JSON.stringify({ ...parsed, photos: data.fieldTakeoff.photos })
      })
    } catch {
      /* photos list refresh is best-effort */
    }
  }, [isPreview, projectId])

  const toggleChecklist = useCallback(
    (id: string) => {
      if (formReadOnly) return
      setTakeoffField((prev) => ({
        ...prev,
        checklist: prev.checklist.map((item) =>
          item.id === id ? { ...item, completed: !item.completed } : item,
        ),
      }))
    },
    [formReadOnly, setTakeoffField],
  )

  const handleSave = async () => {
    if (!projectId || !takeoff || formReadOnly || saving) return

    setSaving(true)
    try {
      const payload = fieldTakeoffWithTotals(takeoff)
      if (isPreview) {
        await saveFieldTakeoff(projectId, payload)
      } else {
        await saveFieldTakeoffAsMeasurer(projectId, payload)
      }
      setSavedSnapshot(JSON.stringify(payload))
      setTakeoff(payload)
      setContext((prev) =>
        prev
          ? {
              ...prev,
              fieldTakeoff: payload,
              workflowStatus: crewMeasureWorkflowStatus(payload),
            }
          : prev,
      )
      toast.success('Saved')
    } catch (e) {
      if (e instanceof CrewWorkspacePermissionError) {
        toast.error(e.message)
      } else if (e instanceof CrewFieldTakeoffSaveError) {
        toast.error(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Save failed')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitForReview = async () => {
    if (!projectId || !takeoff || !canSubmitForReview) return

    setSubmitting(true)
    try {
      const submittedAt = new Date().toISOString()
      const payload = fieldTakeoffWithTotals({
        ...takeoff,
        reviewStatus: 'pending_review',
        submittedForReviewAt: submittedAt,
        rejectedAt: null,
        rejectionNotes: null,
      })
      if (isPreview) {
        await saveFieldTakeoff(projectId, payload)
      } else {
        await saveFieldTakeoffAsMeasurer(projectId, payload)
      }
      setSavedSnapshot(JSON.stringify(payload))
      setTakeoff(payload)
      setContext((prev) =>
        prev
          ? {
              ...prev,
              fieldTakeoff: payload,
              workflowStatus: crewMeasureWorkflowStatus(payload),
            }
          : prev,
      )
      setSubmitOpen(false)
      toast.success('Submitted for office review')
    } catch (e) {
      if (e instanceof CrewWorkspacePermissionError) {
        toast.error(e.message)
      } else if (e instanceof CrewFieldTakeoffSaveError) {
        toast.error(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Submit failed')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const { pullDistance, refreshing: pullRefreshing } = usePullToRefresh(handleRefresh)

  if (!projectId) {
    return null
  }

  if (phase === 'loading' || phase === 'redirect') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  if (phase === 'error' || !context || !takeoff) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/crew/projects/${projectId}`)}>
          <ArrowLeft className="mr-2 size-4" />
          Back to job
        </Button>
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
          <p className="text-sm text-muted-foreground">{error ?? 'Measure page unavailable'}</p>
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw className="mr-2 size-4" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="space-y-4 pb-24"
      style={{
        transform: `translateY(${pullDistance}px)`,
        transition: pullDistance === 0 ? 'transform 200ms' : 'none',
      }}
    >
      {pullDistance > 0 || pullRefreshing ? (
        <div
          className="pointer-events-none fixed left-0 right-0 top-14 flex justify-center"
          style={{ opacity: Math.min(1, pullDistance / 70) }}
        >
          <div className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow">
            {pullRefreshing
              ? 'Refreshing…'
              : pullDistance >= 70
                ? 'Release to refresh'
                : 'Pull to refresh'}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={handleBack}>
          <ArrowLeft className="mr-2 size-4" />
          Job detail
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={phase !== 'ready'}
          aria-label="Refresh"
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold leading-tight">Measure</h1>
          <p className="text-base font-medium text-muted-foreground">{context.projectName}</p>
        </div>
        <span className={crewMeasureStatusPillClass(context.workflowStatus)}>
          {crewMeasureStatusLabel(context.workflowStatus)}
        </span>
      </div>

      {isPreview ? (
        <p className="text-xs text-muted-foreground">Operator preview — measurer crew view</p>
      ) : null}

      {context.workflowStatus === 'pending_review' ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4 text-sm text-amber-900 dark:text-amber-100">
            Measurements are with the office for review. You can edit again if they send them back.
          </CardContent>
        </Card>
      ) : null}

      {context.workflowStatus === 'approved' ? (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="py-4 text-sm text-emerald-900 dark:text-emerald-100">
            These measurements are approved and locked.
            {takeoff.approvedAt && formatReviewTimestamp(takeoff.approvedAt)
              ? ` Approved ${formatReviewTimestamp(takeoff.approvedAt)}.`
              : ''}
          </CardContent>
        </Card>
      ) : null}

      {context.workflowStatus === 'rejected' ? (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="py-4 space-y-2 text-sm text-red-900 dark:text-red-100">
            <p className="font-medium">
              Sent back for changes
              {takeoff.rejectedAt && formatReviewTimestamp(takeoff.rejectedAt)
                ? ` · ${formatReviewTimestamp(takeoff.rejectedAt)}`
                : ''}
            </p>
            {takeoff.rejectionNotes?.trim() ? (
              <p className="whitespace-pre-wrap">{takeoff.rejectionNotes.trim()}</p>
            ) : (
              <p className="opacity-80">The office sent this back for changes.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {!context.hasMeasureAssignment && !isPreview ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="py-4 text-sm text-amber-900 dark:text-amber-100">
            No Measure schedule item is assigned to you on this job yet. Contact the office if you
            expected to measure here.
          </CardContent>
        </Card>
      ) : null}

      <FieldProjectSiteSection
        variant="crew"
        takeoff={takeoff}
        onPatchTakeoff={patchTakeoff}
        readOnly={formReadOnly}
      />

      <FieldMeasurementsSection
        takeoff={takeoff}
        readOnly={formReadOnly}
        onChange={setTakeoffField}
      />

      <FieldPhotosSection
        projectId={projectId}
        readOnly={formReadOnly}
        onPhotosChange={() => void syncPhotosFromServer()}
      />

      <FieldAccessoriesSection
        takeoff={takeoff}
        measuredSqft={measuredSqft}
        quote={null}
        readOnly={formReadOnly}
        onChange={setTakeoffField}
        disableAutoCalc
      />

      <FieldChecklistSection
        takeoff={takeoff}
        readOnly={formReadOnly}
        onToggleItem={toggleChecklist}
      />

      {isDirty && !formReadOnly ? (
        <p className="text-sm text-amber-700 dark:text-amber-300">You have unsaved changes.</p>
      ) : null}

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t bg-background/95 p-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-lg gap-3">
          <Button
            variant="outline"
            className="flex-1"
            disabled={formReadOnly || !isDirty || saving || submitting}
            onClick={() => void handleSave()}
          >
            <Save className="mr-2 size-4" />
            {saving ? 'Saving…' : 'Save'}
          </Button>
          {!formReadOnly && !isPreview ? (
            <Button
              className="flex-1"
              disabled={!canSubmitForReview}
              onClick={() => {
                if (canSubmitForReview) setSubmitOpen(true)
              }}
            >
              <Send className="mr-2 size-4" />
              Submit
            </Button>
          ) : null}
        </div>
      </div>

      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Submit for review?</DialogTitle>
            <DialogDescription>
              Submit measurements for office review? You&apos;ll be able to edit again if the
              office sends them back.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Total measured:{' '}
            <strong>{measuredSqft.toLocaleString()} sqft</strong>
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={submitting}
              onClick={() => setSubmitOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={submitting} onClick={() => void handleSubmitForReview()}>
              {submitting ? 'Submitting…' : 'Submit for review'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
