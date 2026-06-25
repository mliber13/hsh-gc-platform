import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency } from '@/components/hr/payroll/payrollFormat'
import { DEFAULT_PO_SCOPE_TEXT } from '@/lib/drywall/poBidSnapshot'
import {
  createDrywallProjectFromPo,
  DrywallProjectPermissionError,
  updateDrywallProjectPoData,
} from '@/services/drywallProjectsService'
import type { CreateDrywallProjectFromPoInput, DrywallPoData } from '@/types/drywall'

export type PoIntakeFormValues = {
  name: string
  client: string
  customerContact: string
  address: string
  poReference: string
  customerSqft: string
  agreedUnitRate: string
  scopeText: string
  expectedStartDate: string
}

const EMPTY_FORM: PoIntakeFormValues = {
  name: '',
  client: '',
  customerContact: '',
  address: '',
  poReference: '',
  customerSqft: '',
  agreedUnitRate: '',
  scopeText: DEFAULT_PO_SCOPE_TEXT,
  expectedStartDate: '',
}

function suggestedProjectName(client: string, poReference: string): string {
  const c = client.trim()
  const po = poReference.trim()
  if (!c && !po) return ''
  if (!po) return c
  if (!c) return `PO ${po}`
  return `${c} — PO ${po}`
}

function formFromInitial(
  initial?: Partial<PoIntakeFormValues>,
): PoIntakeFormValues {
  return {
    ...EMPTY_FORM,
    ...initial,
    scopeText: initial?.scopeText?.trim() || DEFAULT_PO_SCOPE_TEXT,
  }
}

function toSubmitInput(form: PoIntakeFormValues): CreateDrywallProjectFromPoInput {
  return {
    name: form.name.trim(),
    client: form.client.trim(),
    address: form.address.trim() || undefined,
    poData: {
      poReference: form.poReference.trim(),
      customerSqft: parseFloat(form.customerSqft),
      agreedUnitRate: parseFloat(form.agreedUnitRate),
      scopeText: form.scopeText.trim() || DEFAULT_PO_SCOPE_TEXT,
      ...(form.expectedStartDate.trim()
        ? { expectedStartDate: form.expectedStartDate.trim() }
        : {}),
      ...(form.customerContact.trim()
        ? { customerContact: form.customerContact.trim() }
        : {}),
    },
  }
}

interface PoIntakeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode?: 'create' | 'edit'
  projectId?: string
  initialValues?: Partial<PoIntakeFormValues>
  onCreated?: (projectId: string) => void
  onUpdated?: () => void
}

export function PoIntakeDialog({
  open,
  onOpenChange,
  mode = 'create',
  projectId,
  initialValues,
  onCreated,
  onUpdated,
}: PoIntakeDialogProps) {
  const [form, setForm] = useState<PoIntakeFormValues>(() => formFromInitial(initialValues))
  const [busy, setBusy] = useState(false)
  const nameTouchedRef = useRef(false)

  useEffect(() => {
    if (!open) return
    setForm(formFromInitial(initialValues))
    nameTouchedRef.current = Boolean(initialValues?.name?.trim())
  }, [open, initialValues])

  useEffect(() => {
    if (nameTouchedRef.current || mode === 'edit') return
    const suggestion = suggestedProjectName(form.client, form.poReference)
    if (!suggestion) return
    setForm((prev) => ({ ...prev, name: suggestion }))
  }, [form.client, form.poReference, mode])

  const sqft = parseFloat(form.customerSqft)
  const rate = parseFloat(form.agreedUnitRate)
  const totalBid = Number.isFinite(sqft) && Number.isFinite(rate) ? sqft * rate : null

  const canSubmit = useMemo(() => {
    if (!form.name.trim() || !form.client.trim() || !form.poReference.trim()) return false
    if (!Number.isFinite(sqft) || sqft <= 0) return false
    if (!Number.isFinite(rate) || rate <= 0) return false
    return true
  }, [form.name, form.client, form.poReference, sqft, rate])

  const setField = <K extends keyof PoIntakeFormValues>(key: K, value: PoIntakeFormValues[K]) => {
    if (key === 'name') nameTouchedRef.current = true
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || busy) return
    if (mode === 'edit' && !projectId) return

    setBusy(true)
    try {
      const input = toSubmitInput(form)
      if (mode === 'edit' && projectId) {
        await updateDrywallProjectPoData(projectId, input)
        toast.success('PO updated')
        onOpenChange(false)
        await onUpdated?.()
      } else {
        const id = await createDrywallProjectFromPo(input)
        toast.success('Project created from PO')
        onOpenChange(false)
        onCreated?.(id)
      }
    } catch (err: unknown) {
      if (err instanceof DrywallProjectPermissionError) {
        toast.error(err.message)
      } else {
        toast.error(err instanceof Error ? err.message : 'Failed to save PO')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'edit' ? 'Edit PO' : 'Create from PO'}</DialogTitle>
          <DialogDescription>
            {mode === 'edit'
              ? 'Update purchase order details. The bid baseline will be recalculated from sqft × rate.'
              : 'Enter PO details to create a project at Field Measurement with an approved bid baseline.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="po-name">Project Name *</Label>
              <Input
                id="po-name"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="Customer — PO 12345"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-client">Customer / Client *</Label>
              <Input
                id="po-client"
                value={form.client}
                onChange={(e) => setField('client', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-contact">Customer Contact</Label>
              <Input
                id="po-contact"
                value={form.customerContact}
                onChange={(e) => setField('customerContact', e.target.value)}
                placeholder="Name, phone, or email"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="po-address">Address</Label>
              <Input
                id="po-address"
                value={form.address}
                onChange={(e) => setField('address', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-number">PO Number *</Label>
              <Input
                id="po-number"
                value={form.poReference}
                onChange={(e) => setField('poReference', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-start">Expected Start Date</Label>
              <Input
                id="po-start"
                type="date"
                value={form.expectedStartDate}
                onChange={(e) => setField('expectedStartDate', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-sqft">Customer&apos;s Sqft *</Label>
              <Input
                id="po-sqft"
                type="number"
                min={0}
                step="any"
                value={form.customerSqft}
                onChange={(e) => setField('customerSqft', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-rate">Agreed Unit Rate $/sqft *</Label>
              <Input
                id="po-rate"
                type="number"
                min={0}
                step="any"
                value={form.agreedUnitRate}
                onChange={(e) => setField('agreedUnitRate', e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="po-scope">Scope Text</Label>
              <Textarea
                id="po-scope"
                rows={3}
                value={form.scopeText}
                onChange={(e) => setField('scopeText', e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
            <span className="text-muted-foreground">Total Bid = </span>
            {totalBid != null && totalBid > 0 ? (
              <span className="font-semibold tabular-nums">
                {Number.isFinite(sqft) ? sqft.toLocaleString() : '—'} ×{' '}
                {formatCurrency(rate)} = {formatCurrency(totalBid)}
              </span>
            ) : (
              <span className="text-muted-foreground">Enter sqft and rate</span>
            )}
          </div>

          {mode === 'edit' && totalBid != null && totalBid > 0 && (
            <p className="text-xs text-muted-foreground">
              Saving will refresh the bid baseline to {formatCurrency(totalBid)}.
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || busy}>
              {busy ? 'Saving…' : mode === 'edit' ? 'Save PO' : 'Create Project'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function poDataToFormValues(
  project: { name: string; client: string; address: string },
  po: DrywallPoData,
): PoIntakeFormValues {
  return {
    name: project.name,
    client: project.client,
    customerContact: po.customerContact ?? '',
    address: project.address,
    poReference: po.poReference,
    customerSqft: String(po.customerSqft),
    agreedUnitRate: String(po.agreedUnitRate),
    scopeText: po.scopeText || DEFAULT_PO_SCOPE_TEXT,
    expectedStartDate: po.expectedStartDate?.slice(0, 10) ?? '',
  }
}
