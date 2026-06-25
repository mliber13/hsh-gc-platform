import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { ArrowRight, Download, FileSpreadsheet, Save, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { usePermissions } from '@/hooks/usePermissions'
import { canWriteDrywallProject } from '@/routes/RequirePermission'
import { downloadDrywallQuotePdf } from '@/lib/drywallQuotePdf'
import type { DrywallProjectShellContext } from '@/components/drywall/DrywallProjectShell'
import { QuoteOutcomeBar, isQuoteOutcomeLocked } from '@/components/drywall/quote/QuoteOutcomeBar'
import { drywallQuoteNumberLabel } from '@/lib/drywall/drywallQuoteNumber'
import {
  assignDrywallQuoteNumberIfMissing,
  DrywallProjectPermissionError,
  fetchDrywallProjectById,
  fetchDrywallQuote,
  getQuoteOutcomeFromLegacy,
  saveDrywallQuote,
  saveDrywallQuoteAndAdvance,
  saveDrywallQuoteCalculations,
  convertQuoteToV3,
} from '@/services/drywallProjectsService'
import { deriveAddonFlagsFromData } from '@/lib/drywall/deriveAddonFlagsFromData'
import { isDrywallQuoteV3FeatureEnabled } from '@/lib/drywall/quoteV3Feature'
import type { DrywallProject, DrywallQuote, DrywallQuoteOutcome } from '@/types/drywall'
import { QuoteConvertV3Dialog } from './QuoteConvertV3Dialog'
import { QuoteBreakdownsSection } from './QuoteBreakdownsSection'
import { QuoteOptionalAddons } from './QuoteOptionalAddons'
import { QuoteOptionsSection } from './QuoteOptionsSection'
import { QuoteRatesPanel } from './QuoteRatesPanel'
import { QuoteScopeSection } from './QuoteScopeSection'
import { QuoteTakeoffImportDialog } from './QuoteTakeoffImportDialog'
import { QuotePdfOptionsSection } from './QuotePdfOptionsSection'
import { QuoteTotalsSummary } from './QuoteTotalsSummary'
import { useDrywallQuoteCalculations } from './useDrywallQuoteState'

export function QuoteStage({ onConverted }: { onConverted?: () => void }) {
  const { projectId, setProjectName, setProjectStatus } =
    useOutletContext<DrywallProjectShellContext>()
  const navigate = useNavigate()
  const { effectiveRole } = usePermissions()
  const viewerReadOnly = !canWriteDrywallProject(effectiveRole)

  const [project, setProject] = useState<DrywallProject | null>(null)
  const [quote, setQuote] = useState<DrywallQuote | null>(null)
  const [quoteOutcome, setQuoteOutcome] = useState<DrywallQuoteOutcome>('drafted')
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [replaceOnImport, setReplaceOnImport] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)
  const [converting, setConverting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, q] = await Promise.all([
        fetchDrywallProjectById(projectId),
        fetchDrywallQuote(projectId),
      ])
      if (!p) {
        toast.error('Project not found')
        navigate('/drywall', { replace: true })
        return
      }
      setProject(p)
      setProjectName(p.name)
      setProjectStatus(p.status)
      setQuoteOutcome(getQuoteOutcomeFromLegacy(p.legacy).outcome)
      const withFlags = deriveAddonFlagsFromData(q)
      setQuote(withFlags)
      setSavedSnapshot(JSON.stringify(withFlags))
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
    const q = await fetchDrywallQuote(projectId)
    const withFlags = deriveAddonFlagsFromData(q)
    setQuote(withFlags)
    setSavedSnapshot(JSON.stringify(withFlags))
  }, [projectId, setProjectStatus])

  useEffect(() => {
    void load()
  }, [load])

  const patchQuote = useCallback((patch: Partial<DrywallQuote>) => {
    setQuote((prev) => (prev ? { ...prev, ...patch, version: 2 } : prev))
  }, [])

  const isDirty = useMemo(
    () => (quote ? JSON.stringify(quote) !== savedSnapshot : false),
    [quote, savedSnapshot],
  )

  const { calculations, totals } = useDrywallQuoteCalculations(quote ?? { version: 2 })

  const currentBidTotal = useMemo(() => {
    const finalTotal = parseFloat(String(calculations.finalTotal ?? ''))
    if (Number.isFinite(finalTotal) && finalTotal > 0) return finalTotal
    return totals.totalQuote ?? null
  }, [calculations.finalTotal, totals.totalQuote])

  const quoteEstimatedCost = useMemo(() => {
    const direct = calculations.totalDirectCost
    if (typeof direct === 'number' && Number.isFinite(direct) && direct > 0) return direct
    return null
  }, [calculations.totalDirectCost])

  const handleSave = async () => {
    if (!quote || readOnly) return
    setSaving(true)
    try {
      const payload = { ...quote, version: 2 }
      await saveDrywallQuote(projectId, payload)
      await saveDrywallQuoteCalculations(projectId, calculations)
      const refreshed = await fetchDrywallQuote(projectId)
      const withFlags = deriveAddonFlagsFromData(refreshed)
      setQuote(withFlags)
      setSavedSnapshot(JSON.stringify(withFlags))
      toast.success('Quote saved')
    } catch (e: unknown) {
      if (e instanceof DrywallProjectPermissionError) toast.error(e.message)
      else toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDownloadPdf = async () => {
    if (!project || !quote) return
    try {
      let quoteForPdf = quote
      if (!drywallQuoteNumberLabel(quote.quoteNumber)) {
        const quoteNumber = await assignDrywallQuoteNumberIfMissing(projectId)
        quoteForPdf = { ...quote, quoteNumber }
        setQuote((prev) => (prev ? { ...prev, quoteNumber } : prev))
      }
      await downloadDrywallQuotePdf(project, quoteForPdf, calculations)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'PDF download failed')
    }
  }

  const handleContinueField = async () => {
    if (!quote || readOnly) return
    setSaving(true)
    try {
      const payload = { ...quote, version: 2 }
      await saveDrywallQuoteAndAdvance(
        projectId,
        payload,
        calculations,
        'field-measurement',
      )
      setSavedSnapshot(JSON.stringify(payload))
      toast.success('Saved — continue to field measurement')
      navigate(`/drywall/projects/${projectId}/field`)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not advance stage')
    } finally {
      setSaving(false)
    }
  }

  const handleConvertConfirm = async () => {
    if (readOnly) return
    setConverting(true)
    try {
      if (isDirty) {
        const payload = { ...quote!, version: 2 }
        await saveDrywallQuote(projectId, payload)
        await saveDrywallQuoteCalculations(projectId, calculations)
      }
      await convertQuoteToV3(projectId)
      setConvertOpen(false)
      toast.success('Converted to line-item quote')
      onConverted?.()
    } catch (e: unknown) {
      if (e instanceof DrywallProjectPermissionError) toast.error(e.message)
      else toast.error(e instanceof Error ? e.message : 'Conversion failed')
    } finally {
      setConverting(false)
    }
  }

  const showConvertBanner =
    isDrywallQuoteV3FeatureEnabled() && !viewerReadOnly && !outcomeLocked

  const handleManualTakeoff = () => {
    if (readOnly) return
    const raw = window.prompt('Enter square footage from takeoff software:')
    if (!raw) return
    const n = parseFloat(raw)
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('Enter a valid square footage')
      return
    }
    patchQuote({ sqft: String(n) })
    toast.success(`Imported ${n.toLocaleString()} sqft`)
  }

  if (loading || !quote) {
    return <p className="text-muted-foreground p-6">Loading quote…</p>
  }

  return (
    <div className="space-y-6 pb-8">
      <QuoteOutcomeBar
        projectId={projectId}
        currentBidTotal={currentBidTotal}
        quoteEstimatedCost={quoteEstimatedCost}
        isDirty={isDirty}
        onOutcomeChange={handleOutcomeChange}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Quote</h2>
          <p className="text-muted-foreground text-sm">
            Build pricing, export PDF, then continue to field measurement. Customer approval URLs ship in Phase C.2.
          </p>
          <p className="text-muted-foreground mt-1 text-sm tabular-nums">
            Quote number:{' '}
            {drywallQuoteNumberLabel(quote.quoteNumber) || 'Assigned when you save or download PDF'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={readOnly}
            onClick={() => setImportOpen(true)}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Import Excel
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={readOnly}
            onClick={handleManualTakeoff}
          >
            <Upload className="mr-2 h-4 w-4" />
            Import sqft
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void handleDownloadPdf()}>
            <Download className="mr-2 h-4 w-4" />
            Download PDF
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

      <input ref={fileInputRef} type="file" className="hidden" />

      {showConvertBanner && (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            <span className="font-medium">Try the new line-item Quote builder (beta).</span>{' '}
            Convert to build scope row-by-row with org catalogs.
          </p>
          <Button type="button" size="sm" disabled={converting} onClick={() => setConvertOpen(true)}>
            Convert to line items
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_minmax(300px,380px)]">
        <div className="space-y-6 min-w-0">
          <QuoteRatesPanel
            quote={quote}
            readOnly={readOnly}
            onChange={patchQuote}
            calculations={calculations}
          />
          <QuoteBreakdownsSection
            quote={quote}
            readOnly={readOnly}
            onChange={(breakdowns) => patchQuote({ breakdowns })}
          />
          <QuoteOptionalAddons quote={quote} readOnly={readOnly} onChange={patchQuote} />
          <QuoteOptionsSection
            quote={quote}
            readOnly={readOnly}
            totalSqft={
              typeof calculations.sqft === 'number' && Number.isFinite(calculations.sqft)
                ? calculations.sqft
                : 0
            }
            selectedOptionsTotal={
              typeof calculations.selectedOptionsTotal === 'number'
                ? calculations.selectedOptionsTotal
                : 0
            }
            onChange={(options) => patchQuote({ options })}
          />
          <QuoteScopeSection quote={quote} readOnly={readOnly} onChange={patchQuote} />
          <QuotePdfOptionsSection quote={quote} readOnly={readOnly} onChange={patchQuote} />
        </div>
        <QuoteTotalsSummary quote={quote} calculations={calculations} totals={totals} />
      </div>

      <div className="flex flex-wrap gap-3 border-t pt-6">
        <Button
          type="button"
          disabled={readOnly || saving}
          onClick={() => void handleContinueField()}
        >
          Continue to Field Measurement
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        {isDirty && (
          <span className="text-sm text-amber-600 self-center">Unsaved changes</span>
        )}
      </div>

      <QuoteTakeoffImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        breakdowns={quote.breakdowns || []}
        replaceExisting={replaceOnImport}
        onReplaceChange={setReplaceOnImport}
        onApply={patchQuote}
      />

      <QuoteConvertV3Dialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        converting={converting}
        onConfirm={() => void handleConvertConfirm()}
      />
    </div>
  )
}
