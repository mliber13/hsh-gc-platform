import { Copy, FileDown, Plus, Trash2 } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  DRYWALL_ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  ORDER_UNIT_OPTIONS,
} from '@/lib/drywall/orderConstants'
import { downloadDrywallOrderPdf } from '@/lib/drywallOrderPdf'
import { generateFieldId } from '@/lib/drywall/fieldMeasurementUtils'
import type { DrywallOrder, DrywallOrderItem, DrywallProject } from '@/types/drywall'
import { OrderStatusBadge } from './OrderStatusBadge'

interface OrderEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: DrywallOrder | null
  project: Pick<DrywallProject, 'name' | 'address' | 'client'>
  readOnly: boolean
  onChange: (order: DrywallOrder) => void
  onDuplicate: () => void
  onDelete: () => void
}

function emptyItem(): DrywallOrderItem {
  return {
    id: generateFieldId(),
    description: '',
    quantity: '',
    unit: 'pcs',
    notes: '',
  }
}

export function OrderEditorDialog({
  open,
  onOpenChange,
  order,
  project,
  readOnly,
  onChange,
  onDuplicate,
  onDelete,
}: OrderEditorDialogProps) {
  if (!order) return null

  const update = (patch: Partial<DrywallOrder>) => onChange({ ...order, ...patch })

  const updateItem = (itemId: string, patch: Partial<DrywallOrderItem>) => {
    onChange({
      ...order,
      items: order.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    })
  }

  const addItem = () => {
    onChange({ ...order, items: [...order.items, emptyItem()] })
  }

  const removeItem = (itemId: string) => {
    onChange({ ...order, items: order.items.filter((i) => i.id !== itemId) })
  }

  const label = order.orderNumber?.trim() || `Order ${order.id.slice(-6)}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {label}
            <OrderStatusBadge status={order.status} />
          </DialogTitle>
          <DialogDescription>Supplier order line items and delivery details.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="orderNumber">Order #</Label>
            <Input
              id="orderNumber"
              value={order.orderNumber ?? ''}
              onChange={(e) => update({ orderNumber: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={order.status || 'draft'}
              onValueChange={(v) => update({ status: v })}
              disabled={readOnly}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DRYWALL_ORDER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {ORDER_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplier">Supplier</Label>
            <Input
              id="supplier"
              value={order.supplier ?? ''}
              onChange={(e) => update({ supplier: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplierContact">Supplier contact</Label>
            <Input
              id="supplierContact"
              value={order.supplierContact ?? ''}
              onChange={(e) => update({ supplierContact: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="deliveryDate">Delivery date</Label>
            <Input
              id="deliveryDate"
              type="date"
              value={order.deliveryDate ?? ''}
              onChange={(e) => update({ deliveryDate: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="deliveryAddress">Delivery address</Label>
            <Input
              id="deliveryAddress"
              value={order.deliveryAddress ?? ''}
              onChange={(e) => update({ deliveryAddress: e.target.value })}
              disabled={readOnly}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="orderNotes">Notes</Label>
            <Textarea
              id="orderNotes"
              rows={2}
              value={order.notes ?? ''}
              onChange={(e) => update({ notes: e.target.value })}
              disabled={readOnly}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Line items</Label>
            {!readOnly && (
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="mr-1 h-4 w-4" />
                Add item
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {order.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">No line items yet.</p>
            ) : (
              order.items.map((item) => (
                <div
                  key={item.id}
                  className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-12"
                >
                  <div className="sm:col-span-5">
                    <Input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateItem(item.id, { description: e.target.value })}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Input
                      placeholder="Qty"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, { quantity: e.target.value })}
                      disabled={readOnly}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Select
                      value={item.unit || 'pcs'}
                      onValueChange={(v) => updateItem(item.id, { unit: v })}
                      disabled={readOnly}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ORDER_UNIT_OPTIONS.map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2 sm:col-span-3">
                    <Input
                      placeholder="Notes"
                      value={item.notes ?? ''}
                      onChange={(e) => updateItem(item.id, { notes: e.target.value })}
                      disabled={readOnly}
                      className="flex-1"
                    />
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeItem(item.id)}
                        aria-label="Remove line item"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => downloadDrywallOrderPdf(project, order)}
            >
              <FileDown className="mr-2 h-4 w-4" />
              Download Order PDF
            </Button>
            {!readOnly && (
              <>
                <Button type="button" variant="outline" onClick={onDuplicate}>
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate
                </Button>
                <Button type="button" variant="destructive" onClick={onDelete}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </>
            )}
          </div>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
