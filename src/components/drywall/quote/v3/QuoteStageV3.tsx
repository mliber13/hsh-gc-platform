import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { ArrowRight, Download, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { DrywallProjectShellContext } from '@/components/drywall/DrywallProjectShell'
import { QuoteOutcomeBar, isQuoteOutcomeLocked } from '@/components/drywall/quote/QuoteOutcomeBar'
import { usePermissions } from '@/hooks/usePermissions'
import { canWriteDrywallProject } from '@/routes/RequirePermission'
import { downloadDrywallQuoteV3Pdf } from '@/lib/drywallQuotePdfV3'
import { computeQuoteV3Totals } from '@/lib/drywall/quoteV3Math'
import {
  DrywallProjectPermissionError,
  fetchDrywallProjectById,
  fetchDrywallQuoteV2V3,
  getQuoteOutcomeFromLegacy,
  refreshQuoteV3FromSnapshot,
  revertQuoteToV2,
  saveDrywallQuoteV3,
} from '@/services/drywallProjectsService'
import { fetchOrgDrywallCatalogs } from '@/services/drywallCatalogsService'
import type { DrywallProject, DrywallQuoteOutcome, DrywallQuoteV3 } from '@/types/drywall'
import { isDrywallQuoteV3 } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'
import { AlternatesSection } from './AlternatesSection'
import { LineItemsTable } from './LineItemsTable'
import { QuoteHeaderV3 } from './QuoteHeaderV3'
import { QuotePdfOptionsSectionV3 } from './QuotePdfOptionsSectionV3'
import { QuoteStructuredScopeSection } from './QuoteStructuredScopeSection'
import { QuoteTotalsSidebar } from './QuoteTotalsSidebar'
import { QuoteV3ConvertBanner } from './QuoteV3ConvertBanner'
import { QuoteV3RevertToV2Button } from './QuoteV3RevertToV2Button'

type QuoteStageV3Props = {
  onRevertToV2?: () => void
}

export function QuoteStageV3({ onRevertToV2 }: QuoteStageV3Props) {
  const { projectId, setProjectName, setProjectStatus } =
    useOutletContext<DrywallProjectShellContext>()
  const navigate = useNavigate()
  const { effectiveRole, isOwner } = usePermissions()
  const viewerReadOnly = !canWriteDrywallProject(effectiveRole)

  const [project, setProject] = useState<DrywallProject | null>(null)
  const [quote, setQuote] = useState<DrywallQuoteV3 | null>(null)
  const [quoteOutcome, setQuoteOutcome] = useState<DrywallQuoteOutcome>('drafted')
  const [catalogs, setCatalogs] = useState<OrgDrywallCatalogs | null>(null)
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [revertingToV2, setRevertingToV2] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, qRaw, cats] = await Promise.all([
        fetchDrywallProjectById(projectId),
        fetchDrywallQuoteV2V3(projectId),
        fetchOrgDrywallCatalogs(),
      ])
      if (!p) {
        toast.error('Project not found')
        navigate('/drywall', { replace: true })
        return
      }
      if (!isDrywallQuoteV3(qRaw)) {
        toast.error('Expected v3 quote — reload the page')
        return
      }
      setProject(p)
      setProjectName(p.name)
      setProjectStatus(p.status)
      setQuoteOutcome(getQuoteOutcomeFromLegacy(p.legacy).outcome)
      setQuote(qRaw)
      setCatalogs(cats)
      setSavedSnapshot(JSON.stringify(qRaw))
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load quote')
    } finally {
      setLoading(false)
    }
  }, [projectId, navigate, setProjectName, setProjectStatus])

  const outcomeLocked = isQuoteOutcomeLocked(quoteOutcome)
  const readOnly = viewerReadOnly || outcomeLocked

  const handleOutcomeChange = useCallback(async () => {
    const p = await fetchDrywallProjectById(projectId)
    if (p) {
      setProject(p)
      setProjectStatus(p.status)
      setQuoteOutcome(getQuoteOutcomeFromLegacy(p.legacy).outcome)
    }
    const qRaw = await fetchDrywallQuoteV2V3(projectId)
    if (isDrywallQuoteV3(qRaw)) {
      setQuote(qRaw)
      setSavedSnapshot(JSON.stringify(qRaw))
    }
  }, [projectId, setProjectStatus])

  useEffect(() => {
    void load()
  }, [load])

  const isDirty = useMemo(
    () => (quote ? JSON.stringify(quote) !== savedSnapshot : false),
    [quote, savedSnapshot],
  )

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  const patchQuote = useCallback((patch: Partial<DrywallQuoteV3>) => {
    setQuote((prev) => (prev ? { ...prev, ...patch, version: 3 } : prev))
  }, [])

  const totals = useMemo(() => {
    if (!quote || !catalogs) return null
    return computeQuoteV3Totals(quote, catalogs)
  }, [quote, catalogs])

  const handleRefreshFromSnapshot = async () => {
    if (readOnly || !isOwner) return
    setRefreshing(true)
    try {
      const refreshed = await refreshQuoteV3FromSnapshot(projectId)
      setQuote(refreshed)
      setSavedSnapshot(JSON.stringify(refreshed))
      toast.success('Quote refreshed from v2 snapshot')
    } catch (e: unknown) {
      if (e instanceof DrywallProjectPermissionError) toast.error(e.message)
      else toast.error(e instanceof Error ? e.message : 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  const handleDownloadPdf = async () => {
    if (!quote || !catalogs || !project) return
    if (isDirty) {
      toast.error('Save your quote before downloading the PDF')
      return
    }
    setDownloadingPdf(true)
    try {
      await downloadDrywallQuoteV3Pdf({
        project: {
          id: project.id,
          name: project.name,
          client: project.client ?? '',
          address: project.address ?? '',
        },
        quote,
        catalogs,
        company: {
          name: 'HSH Drywall',
          address: 'PO Box 102 Lisbon, OH 44432',
          phone: '330-614-1127',
          email: 'mark@hshdrywall.com',
        },
      })
      toast.success('PDF downloaded')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'PDF download failed')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const handleRevertToV2 = async () => {
    if (readOnly || !isOwner) return
    setRevertingToV2(true)
    try {
      await revertQuoteToV2(projectId)
      toast.success('Restored v2 quote — reloading editor')
      onRevertToV2?.()
    } catch (e: unknown) {
      if (e instanceof DrywallProjectPermissionError) toast.error(e.message)
      else toast.error(e instanceof Error ? e.message : 'Could not restore v2 quote')
    } finally {
      setRevertingToV2(false)
    }
  }

  const handleSave = async () => {
    if (!quote || readOnly) return
    setSaving(true)
    try {
      await saveDrywallQuoteV3(projectId, quote)
      setSavedSnapshot(JSON.stringify(quote))
      toast.success('Quote saved')
    } catch (e: unknown) {
      if (e instanceof DrywallProjectPermissionError) toast.error(e.message)
      else toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !quote || !catalogs || !project || !totals) {
    return <p className="text-muted-foreground p-6">Loading quote…</p>
  }

  return (
    <div className="space-y-6 pb-8">
      <QuoteOutcomeBar
        projectId={projectId}
        currentBidTotal={totals.routine.total}
        quoteEstimatedCost={
          totals.routine.linesSubtotal +
          totals.routine.cleanupTotal +
          totals.routine.salesTaxAmount
        }
        isDirty={isDirty}
        onOutcomeChange={handleOutcomeChange}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Quote (line items)</h2>
          <p className="text-muted-foreground text-sm">
            Unified spreadsheet quote — v3 beta with customer PDF export.
          </p>
          {isDirty && !readOnly && (
            <p className="mt-2 text-sm text-amber-700">Unsaved changes</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {isOwner && !viewerReadOnly && quote.legacyV2Snapshot != null ? (
            <QuoteV3RevertToV2Button
              legacyV2Snapshot={quote.legacyV2Snapshot}
              v3LineCount={quote.lineItems.length}
              disabled={isDirty || revertingToV2 || outcomeLocked}
              reverting={revertingToV2}
              onRevert={handleRevertToV2}
            />
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={readOnly || isDirty || downloadingPdf}
            onClick={() => void handleDownloadPdf()}
          >
            <Download className="mr-2 h-4 w-4" />
            {downloadingPdf ? 'Preparing…' : 'Download PDF'}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={readOnly || !isDirty || saving}
            onClick={() => void handleSave()}
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {quote.legacyV2Snapshot != null ? (
        <QuoteV3ConvertBanner
          projectId={projectId}
          legacyV2Snapshot={quote.legacyV2Snapshot}
          showRefresh={isOwner && !viewerReadOnly && !outcomeLocked}
          refreshing={refreshing}
          onRefresh={handleRefreshFromSnapshot}
        />
      ) : null}

      <QuoteHeaderV3 project={project} quoteNumber={quote.quoteNumber} totals={totals} />

      <QuoteStructuredScopeSection
        quote={quote}
        catalogs={catalogs}
        readOnly={readOnly}
        onChange={patchQuote}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(240px,280px)] lg:gap-6">
        <div className="space-y-6 min-w-0">
          <Card className="min-w-0 overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Line items</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-4 sm:px-4">
              <LineItemsTable
                lines={quote.lineItems}
                catalogs={catalogs}
                readOnly={readOnly}
                projectHangerRate={quote.project_hanger_rate}
                projectFinisherRate={quote.project_finisher_rate}
                quoteBeadSticks={quote.bead_sticks}
                onChange={(lineItems) => patchQuote({ lineItems })}
              />
            </CardContent>
          </Card>

          <AlternatesSection
            quote={quote}
            catalogs={catalogs}
            readOnly={readOnly}
            onChange={(alternates) => patchQuote({ alternates })}
          />
        </div>

        <QuoteTotalsSidebar
          quote={quote}
          totals={totals}
          catalogs={catalogs}
          readOnly={readOnly}
          onChange={patchQuote}
        />
      </div>

      <QuotePdfOptionsSectionV3 quote={quote} readOnly={readOnly} onChange={patchQuote} />

      <div className="flex flex-wrap gap-3 border-t pt-6">
        <Button
          type="button"
          variant="outline"
          disabled={readOnly || saving || isDirty}
          onClick={() => navigate(`/drywall/projects/${projectId}/field`)}
        >
          Continue to Field Measurement
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        {isDirty && (
          <span className="text-sm text-amber-600 self-center">Save before continuing</span>
        )}
      </div>
    </div>
  )
}
