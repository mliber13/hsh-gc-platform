import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ChevronDown, FileSearch, Send } from 'lucide-react'
import { toast } from 'sonner'
import type { Project } from '@/types'
import { CLIENT_QUOTE_STATUS } from '@/types/clientQuote'
import type { ClientQuoteWithChildren, PreparedFor } from '@/types/clientQuote'
import {
  buildLineItemsFromEstimate,
  createDraftQuote,
  getClientQuoteWithChildren,
  getDefaultExclusionsForProjectType,
  getDefaultInclusionsForProjectType,
  markQuoteSent,
  updateDraftQuote,
} from '@/services/clientQuoteService'
import {
  buildClientQuotePdfFilename,
  downloadPdfBlob,
  generateClientQuotePDFBlob,
} from '@/services/clientQuotePdf'
import { getCurrentUserProfile } from '@/services/userService'
import { isOnlineMode } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { QuoteInclusionsExclusionsEditor } from './QuoteInclusionsExclusionsEditor'
import { QuoteLineItemsTable, type LineItemFormRow } from './QuoteLineItemsTable'
import { QuoteOptionsTable, type OptionFormRow } from './QuoteOptionsTable'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { QuoteActionsConfirmDialog } from './QuoteActionsConfirmDialog'

interface ClientQuoteBuilderProps {
  project: Project
  mode: 'new' | 'edit'
  quoteId?: string
  prefilledFromEstimate?: boolean
  onCancel: () => void
  onSaved: () => void
}

const emptyPrepared: PreparedFor = {
  company: '',
  attn_name: '',
  attn_title: '',
  mailing_address: '',
  phone: '',
  email: '',
}

function normalizeBullets(items: string[]): string[] {
  return items.map((s) => s.trim()).filter(Boolean)
}

export function ClientQuoteBuilder({
  project,
  mode,
  quoteId,
  prefilledFromEstimate,
  onCancel,
  onSaved,
}: ClientQuoteBuilderProps) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [sendDialogOpen, setSendDialogOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [prepared, setPrepared] = useState<PreparedFor>(emptyPrepared)
  const [validityDays, setValidityDays] = useState(60)
  const [scopeNarrative, setScopeNarrative] = useState('')
  const [addressOverride, setAddressOverride] = useState('')
  const [showAddressOverride, setShowAddressOverride] = useState(false)
  const [lineItems, setLineItems] = useState<LineItemFormRow[]>([])
  const [options, setOptions] = useState<OptionFormRow[]>([])
  const [inclusions, setInclusions] = useState<string[]>([])
  const [exclusions, setExclusions] = useState<string[]>([])
  const [quoteNumber, setQuoteNumber] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [status, setStatus] = useState<'draft' | string>('draft')

  const [estimateHint, setEstimateHint] = useState<string | null>(null)
  const pulledOnceRef = useRef(false)

  const [showOptions, setShowOptions] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const hasEstimate = Boolean(project.estimate?.id)

  const pullFromEstimate = useCallback(async () => {
    if (!project.estimate?.id) {
      toast.error('No estimate found for this project.')
      return
    }
    try {
      const built = await buildLineItemsFromEstimate(project.estimate.id)
      setLineItems(
        built.map((b) => ({
          trade_category: b.trade_category,
          display_label: b.display_label,
          amount: b.amount,
          sort_order: b.sort_order,
        })),
      )
      setEstimateHint('Pulled from estimate — click Repull to refresh totals.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to pull from estimate')
    }
  }, [project.estimate?.id])

  // Org + default templates (new quotes)
  useEffect(() => {
    if (mode !== 'new') return
    let cancelled = false
    ;(async () => {
      const profile = await getCurrentUserProfile()
      if (!profile?.organization_id || cancelled) return
      const oid = profile.organization_id
      try {
        const [inc, exc] = await Promise.all([
          getDefaultInclusionsForProjectType(oid, project.type),
          getDefaultExclusionsForProjectType(oid, project.type),
        ])
        if (!cancelled) {
          setInclusions(inc.length ? [...inc] : [''])
          setExclusions(exc.length ? [...exc] : [''])
        }
      } catch {
        if (!cancelled) {
          setInclusions([''])
          setExclusions([''])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mode, project.type])

  // Edit: load existing quote
  useEffect(() => {
    if (mode !== 'edit' || !quoteId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const q = await getClientQuoteWithChildren(quoteId)
        if (cancelled) return
        if (!q) {
          setLoadError('Quote not found.')
          return
        }
        if (q.status !== 'draft') {
          navigate(`/projects/${project.id}/quotes/${quoteId}`, { replace: true })
          return
        }
        setQuoteNumber(q.quote_number)
        setRevision(q.revision)
        setStatus(q.status)
        setPrepared({
          company: q.prepared_for?.company ?? '',
          attn_name: q.prepared_for?.attn_name ?? '',
          attn_title: q.prepared_for?.attn_title ?? '',
          mailing_address: q.prepared_for?.mailing_address ?? '',
          phone: q.prepared_for?.phone ?? '',
          email: q.prepared_for?.email ?? '',
        })
        setValidityDays(q.validity_days)
        setScopeNarrative(q.scope_narrative ?? '')
        setAddressOverride(q.project_address_override ?? '')
        setShowAddressOverride(Boolean((q.project_address_override ?? '').trim()))
        setLineItems(
          q.line_items.map((li) => ({
            trade_category: li.trade_category,
            display_label: li.display_label,
            amount: li.amount,
            sort_order: li.sort_order,
          })),
        )
        setOptions(
          q.options.map((o) => ({
            label: o.label,
            description: o.description ?? '',
            amount: o.amount,
            sort_order: o.sort_order,
          })),
        )
        setInclusions(q.inclusions?.length ? [...q.inclusions] : [''])
        setExclusions(q.exclusions?.length ? [...q.exclusions] : [''])
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to load quote')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mode, quoteId, project.id, navigate])

  // Auto-pull when landing from Estimate Book
  useEffect(() => {
    if (mode !== 'new' || !prefilledFromEstimate || !hasEstimate || pulledOnceRef.current) return
    pulledOnceRef.current = true
    void pullFromEstimate()
  }, [mode, prefilledFromEstimate, hasEstimate, pullFromEstimate])

  const validate = (): boolean => {
    setFormError(null)
    const company = prepared.company.trim()
    if (!company) {
      setFormError('Prepared for — company name is required.')
      return false
    }
    const hasLineAmount = lineItems.some((li) => Math.abs(li.amount) > 0.0001)
    const hasOptionRows = options.length > 0
    if (!hasLineAmount && !hasOptionRows) {
      setFormError('Add at least one line item with an amount, or add at least one option.')
      return false
    }
    return true
  }

  /** Same rules as Save Draft plus Attn name + Mailing address for sending. */
  const validateForSend = (): boolean => {
    setFormError(null)
    if (!prepared.company.trim()) {
      setFormError('Prepared for — company name is required.')
      return false
    }
    if (!prepared.attn_name.trim() || !prepared.mailing_address.trim()) {
      setFormError('Prepared for — Attn name and Mailing address are required before sending.')
      return false
    }
    const hasLineAmount = lineItems.some((li) => Math.abs(li.amount) > 0.0001)
    const hasOptionRows = options.length > 0
    if (!hasLineAmount && !hasOptionRows) {
      setFormError('Add at least one line item with an amount, or add at least one option.')
      return false
    }
    return true
  }

  const canMarkSend =
    mode === 'edit' &&
    Boolean(quoteId) &&
    status === 'draft' &&
    prepared.company.trim() &&
    prepared.attn_name.trim() &&
    prepared.mailing_address.trim() &&
    (lineItems.some((li) => Math.abs(li.amount) > 0.0001) || options.length > 0)

  const handleSendConfirmed = async () => {
    if (!quoteId || !isOnlineMode()) {
      toast.error('Quotes require online mode.')
      return
    }
    if (!validateForSend()) return
    try {
      await updateDraftQuote(quoteId, buildPayload())
      const fresh = await getClientQuoteWithChildren(quoteId)
      if (!fresh) throw new Error('Could not reload quote after save')
      const blob = await generateClientQuotePDFBlob(fresh, project)
      await markQuoteSent(quoteId, blob)
      toast.success('Quote sent — PDF saved')
      setSendDialogOpen(false)
      navigate(`/projects/${project.id}/quotes/${quoteId}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Send failed')
    }
  }

  const buildPayload = () => {
    const prepared_for: PreparedFor = {
      company: prepared.company.trim(),
      attn_name: prepared.attn_name.trim(),
      attn_title: prepared.attn_title?.trim() || undefined,
      mailing_address: prepared.mailing_address.trim(),
      phone: prepared.phone?.trim() || undefined,
      email: prepared.email?.trim() || undefined,
    }
    return {
      project_id: project.id,
      prepared_for,
      project_address_override: showAddressOverride
        ? addressOverride.trim() || null
        : null,
      scope_narrative: scopeNarrative.trim() || null,
      validity_days: validityDays,
      inclusions: normalizeBullets(inclusions),
      exclusions: normalizeBullets(exclusions),
      line_items: lineItems.map((li, i) => ({
        trade_category: li.trade_category,
        display_label: li.display_label.trim() || li.trade_category,
        amount: li.amount,
        sort_order: i,
      })),
      options: options.map((o, i) => ({
        label: o.label.trim() || `Option ${i + 1}`,
        description: o.description.trim() || null,
        amount: o.amount,
        sort_order: i,
      })),
    }
  }

  const buildSyntheticQuoteForPreview = useCallback(async (): Promise<ClientQuoteWithChildren> => {
    const profile = await getCurrentUserProfile()
    const organization_id = profile?.organization_id ?? '00000000-0000-0000-0000-000000000001'
    const now = new Date().toISOString()
    const qNum =
      mode === 'edit' && quoteNumber && quoteNumber !== 'Assigned when you save'
        ? quoteNumber
        : 'Q-DRAFT'

    const prepared_for: PreparedFor | null =
      prepared.company.trim() ||
      prepared.attn_name.trim() ||
      prepared.mailing_address.trim() ||
      prepared.phone?.trim() ||
      prepared.email?.trim()
        ? {
            company: prepared.company.trim(),
            attn_name: prepared.attn_name.trim(),
            attn_title: prepared.attn_title?.trim() || undefined,
            mailing_address: prepared.mailing_address.trim(),
            phone: prepared.phone?.trim() || undefined,
            email: prepared.email?.trim() || undefined,
          }
        : null

    const line_items = lineItems.map((li, i) => ({
      id: `preview-li-${i}`,
      organization_id,
      client_quote_id: 'preview',
      trade_category: li.trade_category,
      display_label: li.display_label.trim() || li.trade_category,
      amount: li.amount,
      sort_order: li.sort_order ?? i,
    }))

    const optionRows = options.map((o, i) => ({
      id: `preview-opt-${i}`,
      organization_id,
      client_quote_id: 'preview',
      label: o.label.trim() || `Option ${i + 1}`,
      description: o.description.trim() || null,
      amount: o.amount,
      sort_order: o.sort_order ?? i,
    }))

    return {
      id: mode === 'edit' && quoteId ? quoteId : 'preview',
      organization_id,
      project_id: project.id,
      quote_number: qNum,
      revision,
      status: 'draft',
      prepared_for,
      project_address_override: showAddressOverride ? addressOverride.trim() || null : null,
      scope_narrative: scopeNarrative.trim() || null,
      inclusions: normalizeBullets(inclusions),
      exclusions: normalizeBullets(exclusions),
      validity_days: validityDays,
      issued_at: null,
      expires_at: null,
      accepted_at: null,
      declined_at: null,
      sent_total: null,
      sent_pdf_url: null,
      superseded_by_id: null,
      created_at: now,
      updated_at: now,
      created_by: null,
      line_items,
      options: optionRows,
    }
  }, [
    mode,
    quoteId,
    quoteNumber,
    revision,
    project.id,
    prepared,
    lineItems,
    options,
    inclusions,
    exclusions,
    validityDays,
    scopeNarrative,
    addressOverride,
    showAddressOverride,
  ])

  const handlePreviewPdf = async () => {
    if (!prepared.company.trim()) {
      toast('Preview', {
        description:
          'Company is empty — PDF will show "[Not yet specified]" for Prepared for.',
      })
    }
    setPreviewing(true)
    try {
      const synthetic = await buildSyntheticQuoteForPreview()
      const blob = await generateClientQuotePDFBlob(synthetic, project)
      const filename = buildClientQuotePdfFilename(project.name, synthetic)
      const url = URL.createObjectURL(blob)
      const win = window.open(url, '_blank', 'noopener,noreferrer')
      if (!win) {
        downloadPdfBlob(blob, filename)
        toast('Pop-up blocked — downloaded preview PDF instead.', {
          description: filename,
        })
        return
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not generate PDF preview')
    } finally {
      setPreviewing(false)
    }
  }

  const handleSave = async () => {
    if (!isOnlineMode()) {
      toast.error('Quotes require online mode.')
      return
    }
    if (!validate()) return
    setSaving(true)
    try {
      const payload = buildPayload()
      if (mode === 'new') {
        await createDraftQuote(payload)
        toast.success('Draft quote saved.')
        onSaved()
      } else if (quoteId) {
        await updateDraftQuote(quoteId, payload)
        toast.success('Draft quote saved.')
        onSaved()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const title = useMemo(() => {
    if (mode === 'edit' && quoteNumber) return `${quoteNumber} — Edit`
    return 'New Quote'
  }, [mode, quoteNumber])

  if (loading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <p className="text-sm text-muted-foreground">Loading quote…</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <p className="text-sm text-destructive">{loadError}</p>
        <Button variant="outline" onClick={onCancel}>
          Back to quotes
        </Button>
      </div>
    )
  }

  const statusPill = CLIENT_QUOTE_STATUS[status as keyof typeof CLIENT_QUOTE_STATUS] ?? CLIENT_QUOTE_STATUS.draft

  const pullDisabled = !hasEstimate
  const pullButton = (
    <Button type="button" variant="outline" size="sm" disabled={pullDisabled} onClick={() => void pullFromEstimate()}>
      Pull from Estimate
    </Button>
  )

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel} className="gap-1.5 text-muted-foreground">
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <h1 className="text-center text-xl font-semibold">{title}</h1>
        <div className="flex flex-wrap justify-end gap-2">
          {mode === 'edit' && quoteId && status === 'draft' && (
            <>
              {canMarkSend ? (
                <Button type="button" variant="default" size="sm" onClick={() => setSendDialogOpen(true)}>
                  <Send className="mr-2 size-4" />
                  Mark sent
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button type="button" variant="default" size="sm" disabled>
                        <Send className="mr-2 size-4" />
                        Mark sent
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    Complete Prepared For before sending (company, Attn name, mailing address, and at least one
                    priced line item or option).
                  </TooltipContent>
                </Tooltip>
              )}
            </>
          )}
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={previewing}
            onClick={() => void handlePreviewPdf()}
          >
            <FileSearch className="mr-2 size-4" />
            {previewing ? 'Generating…' : 'Preview PDF'}
          </Button>
          <Button type="button" size="sm" disabled={saving} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : 'Save draft'}
          </Button>
        </div>
      </div>

      {formError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quote metadata</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Quote number</Label>
            <Input
              value={mode === 'edit' && quoteNumber ? quoteNumber : 'Assigned when you save'}
              disabled
              className="bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <div>
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusPill.pillClass}`}
              >
                {statusPill.label}
              </span>
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="validity-days">Validity (days)</Label>
            <Input
              id="validity-days"
              type="number"
              min={1}
              max={3650}
              value={validityDays}
              onChange={(e) => setValidityDays(parseInt(e.target.value, 10) || 60)}
              className="max-w-[120px]"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prepared for</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pf-company">Company *</Label>
            <Input
              id="pf-company"
              value={prepared.company}
              onChange={(e) => setPrepared((p) => ({ ...p, company: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pf-attn">Attn name</Label>
            <Input
              id="pf-attn"
              value={prepared.attn_name}
              onChange={(e) => setPrepared((p) => ({ ...p, attn_name: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pf-title">Attn title</Label>
            <Input
              id="pf-title"
              value={prepared.attn_title ?? ''}
              onChange={(e) => setPrepared((p) => ({ ...p, attn_title: e.target.value }))}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="pf-mail">Mailing address</Label>
            <Textarea
              id="pf-mail"
              rows={3}
              value={prepared.mailing_address}
              onChange={(e) => setPrepared((p) => ({ ...p, mailing_address: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pf-phone">Phone</Label>
            <Input
              id="pf-phone"
              value={prepared.phone ?? ''}
              onChange={(e) => setPrepared((p) => ({ ...p, phone: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pf-email">Email</Label>
            <Input
              id="pf-email"
              type="email"
              value={prepared.email ?? ''}
              onChange={(e) => setPrepared((p) => ({ ...p, email: e.target.value }))}
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <input
              id="addr-override-toggle"
              type="checkbox"
              className="size-4 rounded border"
              checked={showAddressOverride}
              onChange={(e) => setShowAddressOverride(e.target.checked)}
            />
            <Label htmlFor="addr-override-toggle" className="font-normal">
              Project address differs from mailing address
            </Label>
          </div>
          {showAddressOverride && (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="proj-addr">Project address override</Label>
              <Textarea
                id="proj-addr"
                rows={3}
                value={addressOverride}
                onChange={(e) => setAddressOverride(e.target.value)}
                placeholder="Job site / project address if different from mailing address above"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scope narrative</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={5}
            value={scopeNarrative}
            onChange={(e) => setScopeNarrative(e.target.value)}
            placeholder="Brief summary of the project scope (1–3 paragraphs)."
          />
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {pullDisabled ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button type="button" variant="outline" size="sm" disabled>
                    Pull from Estimate
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>No estimate found for this project.</TooltipContent>
            </Tooltip>
          ) : (
            pullButton
          )}
          {!pullDisabled && lineItems.length > 0 && (
            <Button type="button" variant="ghost" size="sm" onClick={() => void pullFromEstimate()}>
              Repull
            </Button>
          )}
        </div>
        {estimateHint && <p className="text-xs text-muted-foreground">{estimateHint}</p>}
        <QuoteLineItemsTable rows={lineItems} onChange={setLineItems} />
      </div>

      <Collapsible open={showOptions} onOpenChange={setShowOptions}>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="outline" className="w-full justify-between">
            <span>Add options / alternates</span>
            <ChevronDown className={`size-4 transition-transform ${showOptions ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">
          <QuoteOptionsTable rows={options} onChange={setOptions} />
        </CollapsibleContent>
      </Collapsible>

      <QuoteInclusionsExclusionsEditor title="Inclusions" items={inclusions} onChange={setInclusions} />
      <QuoteInclusionsExclusionsEditor title="Exclusions" items={exclusions} onChange={setExclusions} />

      <QuoteActionsConfirmDialog
        open={sendDialogOpen}
        mode="send"
        quoteNumber={quoteNumber ?? 'Quote'}
        validityDays={validityDays}
        onCancel={() => setSendDialogOpen(false)}
        onConfirm={handleSendConfirmed}
      />

      <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-background/95 py-4 backdrop-blur">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={saving} onClick={() => void handleSave()}>
          {saving ? 'Saving…' : 'Save draft'}
        </Button>
      </div>
    </div>
  )
}
