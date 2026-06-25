import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { FileDown, Plus, Save, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { DrywallProjectShellContext } from '@/components/drywall/DrywallProjectShell'
import { generateFieldId } from '@/lib/drywall/fieldMeasurementUtils'
import { extractMaterialsFromFieldTakeoff } from '@/lib/drywall/fieldMaterialsPdfData'
import { suggestOrderItemsFromFieldTakeoff } from '@/lib/drywall/orderSuggest'
import { buildOrderFinancialComparison } from '@/lib/drywall/orderFinancialComparison'
import {
  downloadDrywallFieldMaterialsPdf,
  downloadDrywallLaborRateCardPdf,
} from '@/lib/drywallOrderPdf'
import { usePermissions } from '@/hooks/usePermissions'
import { canWriteDrywallProject } from '@/routes/RequirePermission'
import { ReopenProjectConfirmDialog } from '@/components/drywall/ReopenProjectConfirmDialog'
import { projectV3QuoteToV2Shape } from '@/lib/drywall/projectV3QuoteToV2Shape'
import {
  DrywallProjectPermissionError,
  fetchChangeOrders,
  fetchDrywallProjectById,
  fetchDrywallQuoteV2V3,
  fetchFieldTakeoff,
  fetchOrders,
  markDrywallProjectComplete,
  saveFieldTakeoff,
  saveOrderStageSnapshot,
} from '@/services/drywallProjectsService'
import { fetchOrgDrywallCatalogs } from '@/services/drywallCatalogsService'
import type {
  DrywallChangeOrder,
  DrywallOrder,
  DrywallProject,
  DrywallQuote,
  FieldTakeoff,
} from '@/types/drywall'
import { isDrywallProjectClosed, isDrywallQuoteV3 } from '@/types/drywall'
import { ChangeOrdersSection } from './ChangeOrdersSection'
import { OrderEditorDialog } from './OrderEditorDialog'
import { OrderFinancialCard } from './OrderFinancialCard'
import { OrderStatusBadge } from './OrderStatusBadge'

type StageSnapshot = {
  orders: DrywallOrder[]
  changeOrders: DrywallChangeOrder[]
}

function sortOrders(orders: DrywallOrder[]): DrywallOrder[] {
  return [...orders].sort((a, b) => {
    const ta = new Date(a.updatedAt || a.createdAt || 0).getTime()
    const tb = new Date(b.updatedAt || b.createdAt || 0).getTime()
    return tb - ta
  })
}

export function OrderPage() {
  const { projectId, setProjectName } = useOutletContext<DrywallProjectShellContext>()
  const { effectiveRole } = usePermissions()
  const readOnly = !canWriteDrywallProject(effectiveRole)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [project, setProject] = useState<DrywallProject | null>(null)
  const [fieldTakeoff, setFieldTakeoff] = useState<FieldTakeoff | null>(null)
  const [quote, setQuote] = useState<DrywallQuote | null>(null)
  const [orders, setOrders] = useState<DrywallOrder[]>([])
  const [changeOrders, setChangeOrders] = useState<DrywallChangeOrder[]>([])
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, qRaw, t, o, co, catalogs] = await Promise.all([
        fetchDrywallProjectById(projectId),
        fetchDrywallQuoteV2V3(projectId),
        fetchFieldTakeoff(projectId),
        fetchOrders(projectId),
        fetchChangeOrders(projectId),
        fetchOrgDrywallCatalogs(),
      ])
      if (!p) {
        toast.error('Project not found')
        return
      }
      const q = isDrywallQuoteV3(qRaw)
        ? projectV3QuoteToV2Shape(qRaw, catalogs)
        : qRaw
      setProject(p)
      setProjectName(p.name)
      setQuote(q)
      setFieldTakeoff(t)
      setOrders(sortOrders(o))
      setChangeOrders(co)
      const snap: StageSnapshot = { orders: sortOrders(o), changeOrders: co }
      setSavedSnapshot(JSON.stringify(snap))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load order stage')
    } finally {
      setLoading(false)
    }
  }, [projectId, setProjectName])

  useEffect(() => {
    void load()
  }, [load])

  const isDirty = useMemo(() => {
    const current: StageSnapshot = { orders, changeOrders }
    return JSON.stringify(current) !== savedSnapshot
  }, [orders, changeOrders, savedSnapshot])

  const editingOrder = useMemo(
    () => orders.find((o) => o.id === editingOrderId) ?? null,
    [orders, editingOrderId],
  )

  const projectPdfMeta = useMemo(
    () =>
      project
        ? { name: project.name, address: project.address, client: project.client }
        : { name: '', address: '', client: '' },
    [project],
  )

  const handleSave = async () => {
    if (readOnly) return
    setSaving(true)
    try {
      await saveOrderStageSnapshot(projectId, { orders, changeOrders })
      const snap: StageSnapshot = { orders, changeOrders }
      setSavedSnapshot(JSON.stringify(snap))
      toast.success('Orders saved')
    } catch (e) {
      if (e instanceof DrywallProjectPermissionError) {
        toast.error(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to save orders')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleCreateOrder = () => {
    if (readOnly || !fieldTakeoff) return
    const suggested = suggestOrderItemsFromFieldTakeoff(fieldTakeoff)
    const now = new Date().toISOString()
    const order: DrywallOrder = {
      id: generateFieldId(),
      status: 'draft',
      items: suggested,
      deliveryAddress: project?.address,
      createdAt: now,
      updatedAt: now,
    }
    setOrders((prev) => sortOrders([order, ...prev]))
    setEditingOrderId(order.id)
    if (suggested.length > 0) {
      toast.message('Line items suggested from field takeoff')
    }
  }

  const handleDuplicateOrder = (order: DrywallOrder) => {
    const now = new Date().toISOString()
    const copy: DrywallOrder = {
      ...order,
      id: generateFieldId(),
      orderNumber: order.orderNumber ? `${order.orderNumber} (copy)` : undefined,
      status: 'draft',
      items: order.items.map((i) => ({ ...i, id: generateFieldId() })),
      createdAt: now,
      updatedAt: now,
    }
    setOrders((prev) => sortOrders([copy, ...prev]))
    setEditingOrderId(copy.id)
  }

  const handleDeleteOrder = (orderId: string) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId))
    setEditingOrderId(null)
  }

  const handleMarkStatus = (orderId: string, status: DrywallOrder['status']) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, status, updatedAt: new Date().toISOString() } : o,
      ),
    )
  }

  const handleFieldMaterialsPdf = () => {
    if (!fieldTakeoff) return
    const { boards, accessories } = extractMaterialsFromFieldTakeoff(fieldTakeoff)
    if (boards.length === 0 && accessories.length === 0) {
      toast.error('Add field measurements or accessories first')
      return
    }
    downloadDrywallFieldMaterialsPdf(projectPdfMeta, fieldTakeoff)
    toast.success('Order PDF downloaded')
  }

  const handleLaborRateCardPdf = () => {
    if (!quote || !fieldTakeoff) return
    if ((fieldTakeoff.totalMeasuredSqft || 0) <= 0) {
      toast.error('Add field measurements before downloading the labor rate card')
      return
    }
    const approved = fieldTakeoff.reviewApprovedRates as Record<string, unknown> | undefined
    const fin = buildOrderFinancialComparison(quote, fieldTakeoff, changeOrders, {
      hangerRate: String(approved?.hangerRate ?? quote.hangerRate ?? ''),
      finisherRate: String(approved?.finisherRate ?? quote.finisherRate ?? ''),
      prepCleanRate: String(approved?.prepCleanRate ?? quote.prepCleanRate ?? ''),
      reviewNotes: String(fieldTakeoff.rejectionNotes ?? ''),
    })
    downloadDrywallLaborRateCardPdf(projectPdfMeta, fin, {
      reviewNotes: String(fieldTakeoff.rejectionNotes ?? ''),
    })
    toast.success('Labor rate card PDF downloaded')
  }

  const handleMarkComplete = async () => {
    if (readOnly) return
    if (isDirty) {
      toast.error('Save pending changes before marking the project complete')
      return
    }
    setCompleting(true)
    try {
      await markDrywallProjectComplete(projectId)
      toast.success('Project marked complete')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to mark project complete')
    } finally {
      setCompleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground">
        <div className="inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  const isComplete =
    isDrywallProjectClosed(project?.status) ||
    isDrywallProjectClosed(String(project?.legacy?.status ?? ''))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Order</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Material supplier orders, change orders, and office review. Save explicitly before leaving
            this page.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleFieldMaterialsPdf}
            disabled={!fieldTakeoff}
          >
            <FileDown className="mr-2 h-4 w-4" />
            Field materials PDF
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleLaborRateCardPdf}
            disabled={!fieldTakeoff || !quote || (fieldTakeoff.totalMeasuredSqft || 0) <= 0}
          >
            <FileDown className="mr-2 h-4 w-4" />
            Labor rate card PDF
          </Button>
          {!readOnly && (
            <>
              <Button type="button" variant="outline" onClick={handleCreateOrder}>
                <Plus className="mr-2 h-4 w-4" />
                Create order
              </Button>
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={!isDirty || saving}
              >
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </>
          )}
        </div>
      </div>

      {isComplete && (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
          This project is marked complete.
        </p>
      )}

      <OrderFinancialCard
        quote={quote}
        fieldTakeoff={fieldTakeoff}
        changeOrders={changeOrders}
        readOnly={readOnly}
        projectName={projectPdfMeta.name}
        onSaveFieldTakeoff={async (takeoff) => {
          await saveFieldTakeoff(projectId, takeoff)
          setFieldTakeoff(takeoff)
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Truck className="h-5 w-5" />
            Material orders
          </CardTitle>
          <CardDescription>
            {orders.length} order{orders.length === 1 ? '' : 's'} — newest first
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No orders yet. Create one from field takeoff or add manually.
            </p>
          ) : (
            <div className="space-y-2">
              {orders.map((order) => {
                const label = order.orderNumber?.trim() || `Order ${order.id.slice(-6)}`
                return (
                  <div
                    key={order.id}
                    className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <button
                      type="button"
                      className="text-left min-w-0 flex-1"
                      onClick={() => setEditingOrderId(order.id)}
                    >
                      <p className="font-medium truncate">{label}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {order.supplier || 'No supplier'} · {order.items.length} item
                        {order.items.length === 1 ? '' : 's'}
                        {order.updatedAt
                          ? ` · ${new Date(order.updatedAt).toLocaleDateString()}`
                          : ''}
                      </p>
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      <OrderStatusBadge status={order.status} />
                      {!readOnly && (
                        <>
                          {order.status !== 'sent' && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleMarkStatus(order.id, 'sent')}
                            >
                              Mark sent
                            </Button>
                          )}
                          {order.status === 'sent' && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleMarkStatus(order.id, 'confirmed')}
                            >
                              Mark confirmed
                            </Button>
                          )}
                        </>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditingOrderId(order.id)}
                      >
                        Edit
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ChangeOrdersSection
        changeOrders={changeOrders}
        readOnly={readOnly}
        onChange={setChangeOrders}
      />

      {!readOnly && (
        <div className="flex justify-end border-t border-border pt-4">
          {isComplete ? (
            <Button type="button" variant="outline" onClick={() => setReopenDialogOpen(true)}>
              Reopen project
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleMarkComplete()}
              disabled={completing}
            >
              {completing ? 'Updating…' : 'Mark project complete'}
            </Button>
          )}
        </div>
      )}

      <ReopenProjectConfirmDialog
        open={reopenDialogOpen}
        onOpenChange={setReopenDialogOpen}
        projectId={projectId}
        onReopened={load}
      />

      <OrderEditorDialog
        open={Boolean(editingOrderId)}
        onOpenChange={(open) => {
          if (!open) setEditingOrderId(null)
        }}
        order={editingOrder}
        project={projectPdfMeta}
        readOnly={readOnly}
        onChange={(next) => {
          setOrders((prev) => prev.map((o) => (o.id === next.id ? next : o)))
        }}
        onDuplicate={() => {
          if (editingOrder) handleDuplicateOrder(editingOrder)
        }}
        onDelete={() => {
          if (editingOrderId) handleDeleteOrder(editingOrderId)
        }}
      />
    </div>
  )
}
