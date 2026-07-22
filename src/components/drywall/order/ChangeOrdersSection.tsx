import { useState } from 'react'
import { Check, FileDown, Plus, Send, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { generateFieldId } from '@/lib/drywall/fieldMeasurementUtils'
import {
  changeOrderLineTotal,
  changeOrderOptionTotal,
  computeChangeOrderTotals,
  resolveChangeOrderRequestedAmount,
} from '@/lib/drywall/changeOrderTotals'
import type { DrywallChangeOrder, DrywallChangeOrderLineItem } from '@/types/drywall'

/**
 * Decimal-safe numeric field. A plain controlled number input truncates a mid-typed decimal
 * (typing "7.4" briefly renders "7", then the next keystroke lands as "74"). This owns a local
 * string and only pushes a parsed number upward, so decimals like rates type cleanly.
 */
function NumberCell({
  value,
  onChange,
  disabled,
  placeholder,
  className,
}: {
  value: number
  onChange: (next: number) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}) {
  const [text, setText] = useState(value ? String(value) : '')
  return (
    <Input
      type="number"
      inputMode="decimal"
      step="any"
      className={className}
      disabled={disabled}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const parsed = Number(e.target.value)
        onChange(Number.isFinite(parsed) ? parsed : 0)
      }}
    />
  )
}

function money(value: unknown): string {
  const amount = Number(value)
  return Number.isFinite(amount)
    ? amount.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
    : '—'
}

/**
 * Line-item editor + totals for one priced scope — used both for a single-scope CO and for each
 * option within a multi-option CO, so the two never drift.
 */
function ScopeEditor({
  lineItems,
  overheadPct,
  profitPct,
  editable,
  totalLabel,
  onAddLine,
  onUpdateLine,
  onRemoveLine,
  onMarkupChange,
}: {
  lineItems: DrywallChangeOrderLineItem[]
  overheadPct?: number
  profitPct?: number
  editable: boolean
  totalLabel: string
  onAddLine: () => void
  onUpdateLine: (lineId: string, patch: Partial<DrywallChangeOrderLineItem>) => void
  onRemoveLine: (lineId: string) => void
  onMarkupChange: (patch: { overheadPct?: number; profitPct?: number }) => void
}) {
  const totals = computeChangeOrderTotals({ lineItems, overheadPct, profitPct })
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Line items</Label>
        {editable && (
          <Button type="button" variant="outline" size="sm" onClick={onAddLine}>
            <Plus className="mr-1 h-4 w-4" />
            Add line
          </Button>
        )}
      </div>

      {lineItems.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No line items yet. Add lines to itemize by location.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="hidden gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-12">
            <span className="sm:col-span-2">Location</span>
            <span className="sm:col-span-2">Description</span>
            <span className="sm:col-span-1">Qty</span>
            <span className="sm:col-span-1">Unit</span>
            <span className="sm:col-span-2">Material ($)</span>
            <span className="sm:col-span-2">Labor ($)</span>
            <span className="sm:col-span-2 text-right">Total</span>
          </div>
          {lineItems.map((line) => (
            <div key={line.id} className="grid grid-cols-2 gap-2 sm:grid-cols-12 sm:items-center">
              <Input
                className="sm:col-span-2"
                placeholder="Location"
                value={line.location}
                onChange={(e) => onUpdateLine(line.id, { location: e.target.value })}
                disabled={!editable}
              />
              <Input
                className="sm:col-span-2"
                placeholder="Description"
                value={line.description}
                onChange={(e) => onUpdateLine(line.id, { description: e.target.value })}
                disabled={!editable}
              />
              <NumberCell
                className="sm:col-span-1"
                placeholder="Qty"
                value={line.quantity}
                onChange={(next) => onUpdateLine(line.id, { quantity: next })}
                disabled={!editable}
              />
              <Input
                className="sm:col-span-1"
                placeholder="unit"
                value={line.unit}
                onChange={(e) => onUpdateLine(line.id, { unit: e.target.value })}
                disabled={!editable}
              />
              <NumberCell
                className="sm:col-span-2"
                placeholder="Material"
                value={line.materialRate ?? 0}
                onChange={(next) => onUpdateLine(line.id, { materialRate: next })}
                disabled={!editable}
              />
              <NumberCell
                className="sm:col-span-2"
                placeholder="Labor"
                value={line.laborRate ?? 0}
                onChange={(next) => onUpdateLine(line.id, { laborRate: next })}
                disabled={!editable}
              />
              <div className="flex items-center justify-between gap-1 sm:col-span-2 sm:justify-end">
                <span className="text-sm font-medium tabular-nums">
                  {money(changeOrderLineTotal(line))}
                </span>
                {editable && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => onRemoveLine(line.id)}
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {totals.hasLineItems && (
        <div className="space-y-1.5 rounded-md border bg-muted/30 p-3 text-sm">
          {totals.groups.length > 1 &&
            totals.groups.map((group) => (
              <div
                key={group.location}
                className="flex justify-between text-xs text-muted-foreground"
              >
                <span>{group.location}</span>
                <span className="tabular-nums">{money(group.subtotal)}</span>
              </div>
            ))}
          <div className="flex justify-between border-t pt-1.5 text-xs text-muted-foreground">
            <span>Material</span>
            <span className="tabular-nums">{money(totals.materialSubtotal)}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Labor</span>
            <span className="tabular-nums">{money(totals.laborSubtotal)}</span>
          </div>
          <div className="flex justify-between border-t pt-1.5">
            <span>Subtotal</span>
            <span className="tabular-nums">{money(totals.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span>Overhead</span>
              <NumberCell
                className="h-7 w-16"
                placeholder="%"
                value={overheadPct ?? 0}
                onChange={(next) => onMarkupChange({ overheadPct: next })}
                disabled={!editable}
              />
              <span className="text-muted-foreground">%</span>
            </div>
            <span className="tabular-nums">{money(totals.overhead)}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span>Profit</span>
              <NumberCell
                className="h-7 w-16"
                placeholder="%"
                value={profitPct ?? 0}
                onChange={(next) => onMarkupChange({ profitPct: next })}
                disabled={!editable}
              />
              <span className="text-muted-foreground">%</span>
            </div>
            <span className="tabular-nums">{money(totals.profit)}</span>
          </div>
          <div className="flex justify-between border-t pt-1.5 text-base font-semibold">
            <span>{totalLabel}</span>
            <span className="tabular-nums">{money(totals.total)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

interface ChangeOrdersSectionProps {
  changeOrders: DrywallChangeOrder[]
  readOnly: boolean
  onChange: (next: DrywallChangeOrder[]) => void
  busyId?: string | null
  onSubmit: (changeOrder: DrywallChangeOrder) => void | Promise<void>
  onAccept: (
    changeOrder: DrywallChangeOrder,
    acceptedAmount: string,
    acceptanceReference: string,
  ) => void | Promise<void>
  onReject: (changeOrder: DrywallChangeOrder, rejectionNotes: string) => void | Promise<void>
  onDownloadPdf: (changeOrder: DrywallChangeOrder) => void | Promise<void>
}

function statusLabel(status: DrywallChangeOrder['status']): string {
  if (status === 'accepted' || status === 'approved') return 'Accepted'
  if (status === 'submitted') return 'Submitted'
  if (status === 'rejected') return 'Rejected'
  return 'Draft'
}

function formatTimestamp(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function formatMoney(value: unknown): string {
  const amount = Number(value)
  return Number.isFinite(amount)
    ? amount.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
    : '—'
}

export function ChangeOrdersSection({
  changeOrders,
  readOnly,
  onChange,
  busyId,
  onSubmit,
  onAccept,
  onReject,
  onDownloadPdf,
}: ChangeOrdersSectionProps) {
  const [accepting, setAccepting] = useState<DrywallChangeOrder | null>(null)
  const [acceptedAmount, setAcceptedAmount] = useState('')
  const [acceptanceReference, setAcceptanceReference] = useState('')
  const [rejecting, setRejecting] = useState<DrywallChangeOrder | null>(null)
  const [rejectionNotes, setRejectionNotes] = useState('')

  const add = () => {
    const n = changeOrders.length + 1
    onChange([
      ...changeOrders,
      {
        id: generateFieldId(),
        changeOrderNumber: `CO-${String(n).padStart(3, '0')}`,
        status: 'draft',
        description: '',
        lineItems: [],
        requestedAmount: '',
        notes: '',
      },
    ])
  }

  const update = (id: string, patch: Partial<DrywallChangeOrder>) => {
    onChange(changeOrders.map((co) => (co.id === id ? { ...co, ...patch } : co)))
  }

  const remove = (id: string) => {
    onChange(changeOrders.filter((co) => co.id !== id))
  }

  /** Keep requestedAmount in sync with computed line-item / option totals. */
  const withSyncedAmount = (co: DrywallChangeOrder): DrywallChangeOrder => {
    if (co.options && co.options.length > 0) {
      return { ...co, requestedAmount: resolveChangeOrderRequestedAmount(co).toFixed(2) }
    }
    const totals = computeChangeOrderTotals(co)
    if (!totals.hasLineItems) return co
    return { ...co, requestedAmount: totals.total.toFixed(2) }
  }

  const mutateCo = (id: string, mutator: (co: DrywallChangeOrder) => DrywallChangeOrder) => {
    onChange(changeOrders.map((co) => (co.id === id ? withSyncedAmount(mutator(co)) : co)))
  }

  const blankLine = (lastLocation: string): DrywallChangeOrderLineItem => ({
    id: generateFieldId(),
    location: lastLocation,
    description: '',
    quantity: 0,
    unit: '',
    materialRate: 0,
    laborRate: 0,
  })

  const addLine = (coId: string) => {
    mutateCo(coId, (co) => {
      const lines = co.lineItems ?? []
      const lastLocation = lines.length > 0 ? lines[lines.length - 1].location : ''
      return { ...co, lineItems: [...lines, blankLine(lastLocation)] }
    })
  }

  const updateLine = (
    coId: string,
    lineId: string,
    patch: Partial<DrywallChangeOrderLineItem>,
  ) => {
    mutateCo(coId, (co) => ({
      ...co,
      lineItems: (co.lineItems ?? []).map((li) =>
        li.id === lineId ? { ...li, ...patch } : li,
      ),
    }))
  }

  const removeLine = (coId: string, lineId: string) => {
    mutateCo(coId, (co) => ({
      ...co,
      lineItems: (co.lineItems ?? []).filter((li) => li.id !== lineId),
    }))
  }

  // --- Options (mutually-exclusive priced scopes) ---
  const addOption = (coId: string) => {
    mutateCo(coId, (co) => {
      const existing = co.options ?? []
      if (existing.length === 0) {
        // First split: move the current single scope into Option A, add a blank Option B.
        return {
          ...co,
          lineItems: [],
          options: [
            {
              id: generateFieldId(),
              name: 'Option A',
              lineItems: co.lineItems ?? [],
              overheadPct: co.overheadPct,
              profitPct: co.profitPct,
            },
            {
              id: generateFieldId(),
              name: 'Option B',
              lineItems: [],
              overheadPct: co.overheadPct,
              profitPct: co.profitPct,
            },
          ],
        }
      }
      return {
        ...co,
        options: [
          ...existing,
          {
            id: generateFieldId(),
            name: `Option ${String.fromCharCode(65 + existing.length)}`,
            lineItems: [],
            overheadPct: co.overheadPct,
            profitPct: co.profitPct,
          },
        ],
      }
    })
  }

  const removeOption = (coId: string, optionId: string) => {
    mutateCo(coId, (co) => {
      const next = (co.options ?? []).filter((o) => o.id !== optionId)
      return next.length === 0 ? { ...co, options: undefined } : { ...co, options: next }
    })
  }

  const patchOption = (
    coId: string,
    optionId: string,
    mutator: (option: NonNullable<DrywallChangeOrder['options']>[number]) => NonNullable<
      DrywallChangeOrder['options']
    >[number],
  ) => {
    mutateCo(coId, (co) => ({
      ...co,
      options: (co.options ?? []).map((o) => (o.id === optionId ? mutator(o) : o)),
    }))
  }

  const addOptionLine = (coId: string, optionId: string) => {
    patchOption(coId, optionId, (o) => {
      const lastLocation = o.lineItems.length ? o.lineItems[o.lineItems.length - 1].location : ''
      return { ...o, lineItems: [...o.lineItems, blankLine(lastLocation)] }
    })
  }

  const updateOptionLine = (
    coId: string,
    optionId: string,
    lineId: string,
    patch: Partial<DrywallChangeOrderLineItem>,
  ) => {
    patchOption(coId, optionId, (o) => ({
      ...o,
      lineItems: o.lineItems.map((li) => (li.id === lineId ? { ...li, ...patch } : li)),
    }))
  }

  const removeOptionLine = (coId: string, optionId: string, lineId: string) => {
    patchOption(coId, optionId, (o) => ({
      ...o,
      lineItems: o.lineItems.filter((li) => li.id !== lineId),
    }))
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-lg">Change orders</CardTitle>
          <CardDescription>Track scope and revenue adjustments after the original quote.</CardDescription>
        </div>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={add}>
            <Plus className="mr-1 h-4 w-4" />
            Add CO
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {changeOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No change orders yet.</p>
        ) : (
          changeOrders.map((co) => {
            const status = co.status === 'approved' ? 'accepted' : co.status || 'draft'
            const editable = !readOnly && (status === 'draft' || status === 'rejected')
            const busy = busyId === co.id
            const lineItems = co.lineItems ?? []
            const options = co.options ?? []
            return (
            <div key={co.id} className="space-y-3 rounded-md border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium">{co.changeOrderNumber || 'Change order'}</p>
                  <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
                    {statusLabel(status)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void Promise.resolve(onDownloadPdf(co)).catch(() => undefined)}
                    aria-label="Download change order PDF"
                  >
                    <FileDown className="h-4 w-4" />
                  </Button>
                {editable && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(co.id)}
                    aria-label="Remove change order"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
                </div>
              </div>
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>CO #</Label>
                    <Input
                      value={co.changeOrderNumber ?? ''}
                      onChange={(e) => update(co.id, { changeOrderNumber: e.target.value })}
                      disabled={!editable}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Description of change</Label>
                    <Textarea
                      rows={2}
                      value={co.description ?? ''}
                      placeholder="What changed and why — e.g. Owner added a basement bedroom; hang & finish new walls, add RC ceiling."
                      onChange={(e) => update(co.id, { description: e.target.value })}
                      disabled={!editable}
                    />
                  </div>
                </div>

                {/* Single priced scope, or a set of mutually-exclusive customer options */}
                {options.length === 0 ? (
                  <>
                    <ScopeEditor
                      lineItems={lineItems}
                      overheadPct={co.overheadPct}
                      profitPct={co.profitPct}
                      editable={editable}
                      totalLabel="CO total"
                      onAddLine={() => addLine(co.id)}
                      onUpdateLine={(lineId, patch) => updateLine(co.id, lineId, patch)}
                      onRemoveLine={(lineId) => removeLine(co.id, lineId)}
                      onMarkupChange={(patch) => mutateCo(co.id, (c) => ({ ...c, ...patch }))}
                    />
                    {lineItems.length === 0 && (
                      <div className="space-y-2 sm:max-w-xs">
                        <Label>Requested amount ($)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={co.requestedAmount ?? ''}
                          onChange={(e) => update(co.id, { requestedAmount: e.target.value })}
                          disabled={!editable}
                        />
                      </div>
                    )}
                    {editable && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => addOption(co.id)}
                      >
                        <Plus className="mr-1 h-4 w-4" />
                        Split into customer options (they pick one)
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="space-y-4">
                    <p className="text-xs text-muted-foreground">
                      This change order presents options — the customer picks one. Each option
                      prices separately, including its own overhead and profit.
                    </p>
                    {options.map((option, idx) => (
                      <div
                        key={option.id}
                        className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                            OPTION {String.fromCharCode(65 + idx)}
                          </span>
                          <Input
                            className="h-8 flex-1"
                            placeholder="Option name — e.g. Garage ceiling only"
                            value={option.name}
                            onChange={(e) =>
                              patchOption(co.id, option.id, (o) => ({ ...o, name: e.target.value }))
                            }
                            disabled={!editable}
                          />
                          <span className="shrink-0 text-sm font-semibold tabular-nums">
                            {formatMoney(changeOrderOptionTotal(option))}
                          </span>
                          {editable && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={() => removeOption(co.id, option.id)}
                              aria-label="Remove option"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                        <ScopeEditor
                          lineItems={option.lineItems}
                          overheadPct={option.overheadPct}
                          profitPct={option.profitPct}
                          editable={editable}
                          totalLabel="Option total"
                          onAddLine={() => addOptionLine(co.id, option.id)}
                          onUpdateLine={(lineId, patch) =>
                            updateOptionLine(co.id, option.id, lineId, patch)
                          }
                          onRemoveLine={(lineId) => removeOptionLine(co.id, option.id, lineId)}
                          onMarkupChange={(patch) =>
                            patchOption(co.id, option.id, (o) => ({ ...o, ...patch }))
                          }
                        />
                      </div>
                    ))}
                    {editable && (
                      <Button type="button" variant="outline" size="sm" onClick={() => addOption(co.id)}>
                        <Plus className="mr-1 h-4 w-4" />
                        Add option
                      </Button>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    rows={2}
                    value={co.notes ?? ''}
                    onChange={(e) => update(co.id, { notes: e.target.value })}
                    disabled={!editable}
                  />
                </div>
              </div>
              {status === 'submitted' && !readOnly ? (
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setAccepting(co)
                      setAcceptedAmount(co.requestedAmount ?? '')
                      setAcceptanceReference('')
                    }}
                  >
                    <Check className="mr-1 h-4 w-4" />
                    Accept
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setRejecting(co)
                      setRejectionNotes('')
                    }}
                  >
                    <X className="mr-1 h-4 w-4" />
                    Reject
                  </Button>
                </div>
              ) : null}
              {(status === 'draft' || status === 'rejected') && !readOnly ? (
                <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                  <Button
                    type="button"
                    size="sm"
                    disabled={busy}
                    onClick={() => void Promise.resolve(onSubmit(co)).catch(() => undefined)}
                  >
                    <Send className="mr-1 h-4 w-4" />
                    {status === 'rejected' ? 'Resubmit' : 'Submit'}
                  </Button>
                  {status === 'rejected' && co.rejectionNotes ? (
                    <p className="text-sm text-destructive">{co.rejectionNotes}</p>
                  ) : null}
                </div>
              ) : null}
              {status === 'accepted' ? (
                <div className="rounded-md bg-muted/50 p-3 text-sm">
                  <p className="font-medium">
                    Accepted amount: {formatMoney(co.acceptedAmount ?? co.requestedAmount)}
                  </p>
                  <p className="text-muted-foreground">
                    {co.acceptedByName || 'Office user'}
                    {co.acceptedAt ? ` · ${formatTimestamp(co.acceptedAt)}` : ''}
                  </p>
                  {co.acceptanceReference ? (
                    <p className="mt-1 whitespace-pre-wrap">Reference: {co.acceptanceReference}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )})
        )}
      </CardContent>
      <Dialog open={Boolean(accepting)} onOpenChange={(open) => !open && setAccepting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Accept change order</DialogTitle>
            <DialogDescription>
              Record the final customer-accepted amount and the email, conversation, or document reference.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {accepting?.options && accepting.options.length > 0 && (
              <div className="space-y-1.5">
                <Label>Which option did the customer choose?</Label>
                <div className="flex flex-wrap gap-2">
                  {accepting.options.map((option, idx) => (
                    <Button
                      key={option.id}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setAcceptedAmount(changeOrderOptionTotal(option).toFixed(2))
                      }
                    >
                      {`Option ${String.fromCharCode(65 + idx)}`}
                      {option.name ? ` — ${option.name}` : ''}: {formatMoney(changeOrderOptionTotal(option))}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="co-accepted-amount">Accepted amount ($)</Label>
              <Input
                id="co-accepted-amount"
                type="number"
                step="0.01"
                value={acceptedAmount}
                onChange={(event) => setAcceptedAmount(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="co-acceptance-reference">Customer acceptance reference</Label>
              <Textarea
                id="co-acceptance-reference"
                rows={3}
                value={acceptanceReference}
                placeholder="Email dated 7/15/2026, signed CO, phone approval, etc."
                onChange={(event) => setAcceptanceReference(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAccepting(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!accepting || busyId === accepting.id || !acceptedAmount || !acceptanceReference.trim()}
              onClick={() => {
                if (!accepting) return
                void (async () => {
                  try {
                    await onAccept(accepting, acceptedAmount, acceptanceReference.trim())
                    setAccepting(null)
                  } catch {
                    // The page displays the persistence error and leaves this dialog open.
                  }
                })()
              }}
            >
              Accept change order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(rejecting)} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject change order</DialogTitle>
            <DialogDescription>Record why this change order was not accepted.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="co-rejection-notes">Rejection notes</Label>
            <Textarea
              id="co-rejection-notes"
              rows={4}
              value={rejectionNotes}
              onChange={(event) => setRejectionNotes(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!rejecting || busyId === rejecting.id || !rejectionNotes.trim()}
              onClick={() => {
                if (!rejecting) return
                void (async () => {
                  try {
                    await onReject(rejecting, rejectionNotes.trim())
                    setRejecting(null)
                  } catch {
                    // The page displays the persistence error and leaves this dialog open.
                  }
                })()
              }}
            >
              Reject change order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
