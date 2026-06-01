import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { generateFieldId } from '@/lib/drywall/fieldMeasurementUtils'
import type { DrywallChangeOrder } from '@/types/drywall'

interface ChangeOrdersSectionProps {
  changeOrders: DrywallChangeOrder[]
  readOnly: boolean
  onChange: (next: DrywallChangeOrder[]) => void
}

export function ChangeOrdersSection({ changeOrders, readOnly, onChange }: ChangeOrdersSectionProps) {
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
          changeOrders.map((co) => (
            <div key={co.id} className="space-y-3 rounded-md border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{co.changeOrderNumber || 'Change order'}</p>
                {!readOnly && (
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
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>CO #</Label>
                  <Input
                    value={co.changeOrderNumber ?? ''}
                    onChange={(e) => update(co.id, { changeOrderNumber: e.target.value })}
                    disabled={readOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={co.status || 'draft'}
                    onValueChange={(v) => update(co.id, { status: v })}
                    disabled={readOnly}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="submitted">Submitted</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Reason</Label>
                  <Input
                    value={co.reason ?? ''}
                    onChange={(e) => update(co.id, { reason: e.target.value })}
                    disabled={readOnly}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Scope changes</Label>
                  <Textarea
                    rows={2}
                    value={co.scopeChanges ?? ''}
                    onChange={(e) => update(co.id, { scopeChanges: e.target.value })}
                    disabled={readOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Requested amount ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={co.requestedAmount ?? ''}
                    onChange={(e) => update(co.id, { requestedAmount: e.target.value })}
                    disabled={readOnly}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Notes</Label>
                  <Textarea
                    rows={2}
                    value={co.notes ?? ''}
                    onChange={(e) => update(co.id, { notes: e.target.value })}
                    disabled={readOnly}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
