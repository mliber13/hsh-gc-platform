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
import type { DrywallChangeOrder } from '@/types/drywall'

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
        reason: '',
        scopeChanges: '',
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
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>CO #</Label>
                  <Input
                    value={co.changeOrderNumber ?? ''}
                    onChange={(e) => update(co.id, { changeOrderNumber: e.target.value })}
                    disabled={!editable}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Reason (Optional)</Label>
                  <Input
                    value={co.reason ?? ''}
                    onChange={(e) => update(co.id, { reason: e.target.value })}
                    disabled={!editable}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Scope changes</Label>
                  <Textarea
                    rows={2}
                    value={co.scopeChanges ?? ''}
                    onChange={(e) => update(co.id, { scopeChanges: e.target.value })}
                    disabled={!editable}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Requested amount ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={co.requestedAmount ?? ''}
                    onChange={(e) => update(co.id, { requestedAmount: e.target.value })}
                    disabled={!editable}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
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
