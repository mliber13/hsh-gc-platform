// ============================================================================
// HSH GC Platform - Change Orders
// ============================================================================
//
// Track scope changes, cost impacts, and approval status
//

import React, { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { toast } from 'sonner'
import { Project, ChangeOrder, Trade } from '@/types'
import { getTradesForEstimate } from '@/services'
import {
  deleteChangeOrder,
  fetchChangeOrders,
  nextChangeOrderNumber,
  saveChangeOrder,
} from '@/services/changeOrderService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePageTitle } from '@/contexts/PageTitleContext'
import {
  ArrowLeft,
  PlusCircle,
  FileText,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Edit,
  Trash2,
} from 'lucide-react'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

interface ChangeOrdersProps {
  project: Project
  onBack: () => void
}

// ----------------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------------

export function ChangeOrders({ project, onBack }: ChangeOrdersProps) {
  const [changeOrders, setChangeOrders] = useState<ChangeOrder[]>([])
  const [showCOForm, setShowCOForm] = useState(false)
  const [editingCO, setEditingCO] = useState<ChangeOrder | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  usePageTitle('Change Orders')

  // Change orders come from the `change_orders` table now. They used to be read out of
  // `project.actuals.changeOrders`, which nothing online ever populated, so the page always
  // opened empty and every save went to localStorage (P0-GC-1).
  useEffect(() => {
    let cancelled = false
    const loadedTrades = getTradesForEstimate(project.estimate.id)
    setTrades(loadedTrades)

    setLoading(true)
    fetchChangeOrders(project.id)
      .then((rows) => {
        if (!cancelled) setChangeOrders(rows)
      })
      .catch((e) => {
        if (!cancelled) {
          toast.error(e instanceof Error ? e.message : 'Could not load change orders')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [project.id, project.estimate.id])

  const handleAddChangeOrder = () => {
    setEditingCO(null)
    setShowCOForm(true)
  }

  const handleEditChangeOrder = (co: ChangeOrder) => {
    setEditingCO(co)
    setShowCOForm(true)
  }

  const handleDeleteChangeOrder = async (coId: string) => {
    if (!confirm('Delete this change order?')) return
    try {
      await deleteChangeOrder(coId)
      setChangeOrders((prev) => prev.filter((co) => co.id !== coId))
      toast.success('Change order deleted')
    } catch (e) {
      // Local state is left alone on failure, so the row stays visible and the operator can
      // see that nothing happened.
      toast.error(e instanceof Error ? e.message : 'Could not delete the change order')
    }
  }

  const handleSaveChangeOrder = async (co: ChangeOrder) => {
    const isNew = !editingCO
    setSaving(true)
    try {
      // Keep what the database stored, not what the form sent — a column it defaulted or
      // rejected would otherwise sit in local state looking saved.
      const stored = await saveChangeOrder(project.id, co, { isNew })
      setChangeOrders((prev) =>
        isNew ? [...prev, stored] : prev.map((item) => (item.id === stored.id ? stored : item)),
      )
      setShowCOForm(false)
      setEditingCO(null)
      toast.success(isNew ? 'Change order added' : 'Change order saved')
    } catch (e) {
      // The form stays open with the operator's input intact.
      toast.error(e instanceof Error ? e.message : 'Could not save the change order')
    } finally {
      setSaving(false)
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const statusVisual = (status: ChangeOrder['status']) => {
    switch (status) {
      case 'approved':
      case 'implemented':
        return {
          bg: 'bg-sky-500/15',
          text: 'text-sky-500',
          border: 'border-sky-500/30',
          dot: 'bg-sky-500',
        }
      case 'pending-approval':
        return {
          bg: 'bg-amber-500/15',
          text: 'text-amber-500',
          border: 'border-amber-500/30',
          dot: 'bg-amber-500',
        }
      default:
        return {
          bg: 'bg-muted',
          text: 'text-muted-foreground',
          border: 'border-border',
          dot: 'bg-muted-foreground',
        }
    }
  }

  const getStatusIcon = (status: ChangeOrder['status']) => {
    switch (status) {
      case 'approved': return <CheckCircle className="w-4 h-4" />
      case 'rejected': return <XCircle className="w-4 h-4" />
      case 'pending-approval': return <Clock className="w-4 h-4" />
      case 'implemented': return <CheckCircle className="w-4 h-4" />
      default: return <FileText className="w-4 h-4" />
    }
  }

  const totalCostImpact = changeOrders
    .filter(co => co.status === 'approved' || co.status === 'implemented')
    .reduce((sum, co) => sum + co.costImpact, 0)

  const pendingCount = changeOrders.filter(co => co.status === 'pending-approval').length
  const approvedCount = changeOrders.filter(co => co.status === 'approved' || co.status === 'implemented').length

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Project Detail
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="relative overflow-hidden border-border/60 bg-card/50">
          <div className="absolute inset-y-0 left-0 w-1 bg-sky-500" aria-hidden />
          <CardContent className="p-4 pl-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Total Change Orders</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{changeOrders.length}</p>
              </div>
              <FileText className="size-6 text-sky-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-border/60 bg-card/50">
          <div className="absolute inset-y-0 left-0 w-1 bg-amber-500" aria-hidden />
          <CardContent className="p-4 pl-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Pending Approval</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{pendingCount}</p>
              </div>
              <Clock className="size-6 text-amber-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-border/60 bg-card/50">
          <div className="absolute inset-y-0 left-0 w-1 bg-emerald-500" aria-hidden />
          <CardContent className="p-4 pl-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Approved</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{approvedCount}</p>
              </div>
              <CheckCircle className="size-6 text-emerald-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-border bg-card">
          <div className="absolute inset-y-0 left-0 w-1 bg-rose-500" aria-hidden />
          <CardContent className="p-4 pl-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Cost Impact</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                  {formatCurrency(Math.abs(totalCostImpact))}
                </p>
                <p className="text-xs text-muted-foreground">{totalCostImpact >= 0 ? 'Added' : 'Saved'}</p>
              </div>
              <DollarSign className="size-6 text-rose-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">Change Orders</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleAddChangeOrder}>
              <PlusCircle className="mr-2 size-4" />
              Add Change Order
            </Button>
          </div>
        </div>

        <Card className="border-border/60 bg-card/50">
          <CardContent className="p-4">
            {loading ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Loading change orders…
              </p>
            ) : changeOrders.length === 0 ? (
              <div className="py-12 text-center">
                <FileText className="mx-auto mb-3 size-12 text-muted-foreground/50" />
                <p className="font-medium">No change orders yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Track scope changes and their impact on budget and schedule</p>
                <Button onClick={handleAddChangeOrder} size="sm" className="mt-4">
                  <PlusCircle className="mr-2 size-4" />
                  Add Change Order
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {changeOrders.map((co) => {
                  const visual = statusVisual(co.status)
                  return (
                    <Card key={co.id} className="border-border/60 bg-card">
                      <CardContent className="pt-4">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                          <div className="flex-1">
                            <div className="mb-2 flex items-start justify-between">
                              <div>
                                <div className="mb-1 flex items-center gap-2">
                                  <h4 className="font-semibold text-foreground">{co.title}</h4>
                                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${visual.bg} ${visual.text} ${visual.border}`}>
                                    <span className={`size-1.5 rounded-full ${visual.dot}`} />
                                    {co.status.replace('-', ' ').toUpperCase()}
                                  </span>
                                </div>
                                <p className="text-sm text-muted-foreground">{co.changeOrderNumber}</p>
                              </div>
                            </div>

                            <p className="mb-3 text-sm text-foreground">{co.description}</p>

                            {co.trades && co.trades.length > 0 && (
                              <div className="mb-3">
                                <p className="mb-1 text-xs font-semibold text-muted-foreground">Affected Items:</p>
                                <div className="flex flex-wrap gap-1">
                                  {co.trades.map((trade) => (
                                    <span key={trade.id} className="rounded border border-border/60 bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
                                      {trade.name}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                              <div>
                                <p className="text-muted-foreground">Requested By</p>
                                <p className="font-medium text-foreground">{co.requestedBy}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Date</p>
                                <p className="font-medium text-foreground">{co.requestDate.toLocaleDateString()}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Cost Impact</p>
                                <p className={`font-semibold tabular-nums ${co.costImpact >= 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                  {co.costImpact >= 0 ? '+' : ''}
                                  {formatCurrency(co.costImpact)}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Schedule Impact</p>
                                <p className={`font-medium tabular-nums ${
                                  co.scheduleImpact > 0
                                    ? 'text-rose-600 dark:text-rose-400'
                                    : co.scheduleImpact < 0
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-muted-foreground'
                                }`}>
                                  {co.scheduleImpact > 0 ? '+' : ''}
                                  {co.scheduleImpact} days
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2 sm:flex-col">
                            <Button size="sm" variant="outline" onClick={() => handleEditChangeOrder(co)}>
                              <Edit className="mr-1 h-3 w-3" />
                              Edit
                            </Button>
                            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => handleDeleteChangeOrder(co.id)}>
                              <Trash2 className="mr-1 h-3 w-3" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Change Order Form Modal */}
      {showCOForm && (
        <ChangeOrderForm
          project={project}
          trades={trades}
          changeOrder={editingCO}
          existing={changeOrders}
          saving={saving}
          onSave={handleSaveChangeOrder}
          onCancel={() => {
            setShowCOForm(false)
            setEditingCO(null)
          }}
        />
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Change Order Form Component
// ----------------------------------------------------------------------------

interface ChangeOrderFormProps {
  project: Project
  trades: Trade[]
  changeOrder: ChangeOrder | null
  /** Already-saved change orders on this project — the next number is derived from them. */
  existing: ChangeOrder[]
  saving: boolean
  onSave: (co: ChangeOrder) => void | Promise<void>
  onCancel: () => void
}

function ChangeOrderForm({
  project,
  trades,
  changeOrder,
  existing,
  saving,
  onSave,
  onCancel,
}: ChangeOrderFormProps) {
  // Was derived from `project.actuals.changeOrders` — always empty online — and from the
  // COUNT, which repeats a number as soon as one is deleted. The unique index now refuses
  // the duplicate, so take the highest number in use instead.
  const nextNumber = changeOrder?.changeOrderNumber || nextChangeOrderNumber(existing)

  const [formData, setFormData] = useState({
    changeOrderNumber: changeOrder?.changeOrderNumber || nextNumber,
    title: changeOrder?.title || '',
    description: changeOrder?.description || '',
    status: changeOrder?.status || 'draft',
    requestedBy: changeOrder?.requestedBy || '',
    costImpact: changeOrder?.costImpact?.toString() || '0',
    scheduleImpact: changeOrder?.scheduleImpact?.toString() || '0',
    notes: changeOrder?.notes || '',
    affectedTradeIds: changeOrder?.trades?.map(t => t.id) || [] as string[],
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Get the affected trades
    const affectedTrades = trades.filter(t => formData.affectedTradeIds.includes(t.id))

    const co: ChangeOrder = {
      id: changeOrder?.id || uuidv4(),
      projectId: project.id,
      changeOrderNumber: formData.changeOrderNumber,
      title: formData.title,
      description: formData.description,
      status: formData.status as any,
      requestedBy: formData.requestedBy,
      requestDate: changeOrder?.requestDate || new Date(),
      trades: affectedTrades,
      costImpact: parseFloat(formData.costImpact) || 0,
      scheduleImpact: parseInt(formData.scheduleImpact) || 0,
      notes: formData.notes,
      createdAt: changeOrder?.createdAt || new Date(),
      updatedAt: new Date(),
    }

    onSave(co)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border-border bg-card">
        <CardHeader>
          <CardTitle>{changeOrder ? 'Edit Change Order' : 'Add Change Order'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="coNumber">Change Order Number *</Label>
                <Input
                  id="coNumber"
                  value={formData.changeOrderNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, changeOrderNumber: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="status">Status *</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: any) => setFormData(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="pending-approval">Pending Approval</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                    <SelectItem value="implemented">Implemented</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Add skylight to master bedroom"
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description *</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Detailed description of the change"
                required
              />
            </div>

            <div>
              <Label htmlFor="requestedBy">Requested By *</Label>
              <Input
                id="requestedBy"
                value={formData.requestedBy}
                onChange={(e) => setFormData(prev => ({ ...prev, requestedBy: e.target.value }))}
                placeholder="e.g., Client, Architect, Contractor"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="costImpact">Cost Impact ($)</Label>
                <Input
                  id="costImpact"
                  type="number"
                  step="0.01"
                  value={formData.costImpact}
                  onChange={(e) => setFormData(prev => ({ ...prev, costImpact: e.target.value }))}
                  placeholder="Positive = added cost, Negative = savings"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Use negative numbers for cost reductions
                </p>
              </div>
              <div>
                <Label htmlFor="scheduleImpact">Schedule Impact (days)</Label>
                <Input
                  id="scheduleImpact"
                  type="number"
                  value={formData.scheduleImpact}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduleImpact: e.target.value }))}
                  placeholder="Positive = delay, Negative = time saved"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Use negative numbers for time savings
                </p>
              </div>
            </div>

            <div>
              <Label htmlFor="affectedItems">Affected Cost Items (Optional)</Label>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded border border-border/60 bg-card p-3">
                {trades.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No estimate items available</p>
                ) : (
                  trades.map((trade) => (
                    <label key={trade.id} className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-muted/30">
                      <input
                        type="checkbox"
                        checked={formData.affectedTradeIds.includes(trade.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData(prev => ({
                              ...prev,
                              affectedTradeIds: [...prev.affectedTradeIds, trade.id]
                            }))
                          } else {
                            setFormData(prev => ({
                              ...prev,
                              affectedTradeIds: prev.affectedTradeIds.filter(id => id !== trade.id)
                            }))
                          }
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-foreground">
                        {trade.name} - {trade.category}
                      </span>
                    </label>
                  ))
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Select which estimate items are affected by this change order
              </p>
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Additional notes or comments"
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
              <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
                Cancel
              </Button>
              {/* The save is a round trip now, so the button has to say so — and must not
                  accept a second click that would insert the change order twice. */}
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : changeOrder ? 'Save Changes' : 'Add Change Order'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

