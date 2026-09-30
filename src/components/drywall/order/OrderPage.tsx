import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { FileDown, Mail, Save, Truck } from 'lucide-react'
import { toast } from 'sonner'
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
import { sendSupplierOrderEmail } from '@/services/supplierOrdersService'
import type { DrywallProjectShellContext } from '@/components/drywall/DrywallProjectShell'
import { generateFieldId } from '@/lib/drywall/fieldMeasurementUtils'
import { extractMaterialsFromFieldTakeoff } from '@/lib/drywall/fieldMaterialsPdfData'
import { downloadDrywallChangeOrderPdf } from '@/lib/drywallChangeOrderPdf'
import {
  downloadDrywallFieldMaterialsPdf,
} from '@/lib/drywallOrderPdf'
import { usePermissions } from '@/hooks/usePermissions'
import { canWriteDrywallProject } from '@/routes/RequirePermission'
import { projectV3QuoteToV2Shape } from '@/lib/drywall/projectV3QuoteToV2Shape'
import {
  DrywallProjectPermissionError,
  DrywallProjectStaleError,
  fetchChangeOrders,
  fetchDrywallProjectById,
  fetchDrywallQuoteV2V3,
  fetchFieldTakeoff,
  fetchOrders,
  markProductionStarted,
  markOrderStatus,
  saveOrderStageSnapshot,
  transitionDrywallChangeOrder,
} from '@/services/drywallProjectsService'
import { fetchOrgDrywallCatalogs } from '@/services/drywallCatalogsService'
import { fetchSuppliers } from '@/services/partnerDirectoryService'
import type { Supplier } from '@/types/partners'
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
import { MaterialReconcileCard } from './MaterialReconcileCard'
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
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [changeOrders, setChangeOrders] = useState<DrywallChangeOrder[]>([])
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
  const [changeOrderBusyId, setChangeOrderBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, qRaw, t, o, co, catalogs, sup] = await Promise.all([
        fetchDrywallProjectById(projectId),
        fetchDrywallQuoteV2V3(projectId),
        fetchFieldTakeoff(projectId),
        fetchOrders(projectId),
        fetchChangeOrders(projectId),
        fetchOrgDrywallCatalogs(),
        fetchSuppliers().catch(() => [] as Supplier[]),
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
      setSuppliers(sup)
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
    if (readOnly || !project) return
    setSaving(true)
    try {
      const nextRaw = await saveOrderStageSnapshot(projectId, { orders, changeOrders }, project.updatedAtRaw)
      setProject((prev) => (prev ? { ...prev, updatedAtRaw: nextRaw } : prev))
      const snap: StageSnapshot = { orders, changeOrders }
      setSavedSnapshot(JSON.stringify(snap))
      toast.success('Orders saved')
    } catch (e) {
      if (
        e instanceof DrywallProjectPermissionError ||
        e instanceof DrywallProjectStaleError
      ) {
        toast.error(e.message)
      } else {
        toast.error(e instanceof Error ? e.message : 'Failed to save orders')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleChangeOrderTransition = async (
    changeOrder: DrywallChangeOrder,
    transition:
      | { action: 'submit' }
      | { action: 'accept'; acceptedAmount: string; acceptanceReference: string }
      | { action: 'reject'; rejectionNotes: string },
  ) => {
    if (readOnly || !project) return
    setChangeOrderBusyId(changeOrder.id)
    try {
      // Persist current draft fields first; the transition service then validates the latest JSON.
      const afterSnap = await saveOrderStageSnapshot(
        projectId,
        { orders, changeOrders },
        project.updatedAtRaw,
      )
      await transitionDrywallChangeOrder(projectId, changeOrder.id, transition, afterSnap)
      toast.success(
        transition.action === 'submit'
          ? 'Change order submitted'
          : transition.action === 'accept'
            ? 'Change order accepted'
            : 'Change order rejected',
      )
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update change order')
      throw e
    } finally {
      setChangeOrderBusyId(null)
    }
  }

  // Division has one main supplier (L&W): a single active supplier is the default; otherwise
  // fall back to the most-recently-used supplier across existing orders.
  const defaultSupplier = useMemo<Supplier | null>(() => {
    if (suppliers.length === 1) return suppliers[0]
    for (const o of orders) {
      if (o.supplierId) {
        const match = suppliers.find((s) => s.id === o.supplierId)
        if (match) return match
      }
    }
    return null
  }, [suppliers, orders])

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

  // ── Email the PO to the supplier (their corporate IT blocks the share link) ──
  const [sendConfirm, setSendConfirm] = useState<DrywallOrder | null>(null)
  const [sending, setSending] = useState(false)

  const sendRecipientEmail = useMemo(() => {
    if (!sendConfirm?.supplierId) return ''
    return suppliers.find((s) => s.id === sendConfirm.supplierId)?.email?.trim() || ''
  }, [sendConfirm, suppliers])

  const requestSendToSupplier = (order: DrywallOrder) => {
    if (readOnly) return
    if (isDirty) {
      toast.error('Save your changes before emailing the supplier.')
      return
    }
    if (!order.items || order.items.length === 0) {
      toast.error('Add line items before sending this order.')
      return
    }
    setSendConfirm(order)
  }

  const confirmSendToSupplier = async (withEmail: boolean) => {
    const order = sendConfirm
    if (!order || !project) return
    setSending(true)
    try {
      let sentTo = ''
      if (withEmail) {
        const res = await sendSupplierOrderEmail(projectId, projectPdfMeta, order, fieldTakeoff)
        sentTo = res.to
      }
      await markOrderStatus(projectId, order.id, 'sent', project.updatedAtRaw)
      toast.success(
        withEmail
          ? `PO emailed to ${sentTo || 'the supplier'} and marked sent`
          : 'Order marked sent',
      )
      setSendConfirm(null)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send order')
    } finally {
      setSending(false)
    }
  }

  const handleFieldMaterialsPdf = () => {
    if (!fieldTakeoff) return
    const { boards, accessories } = extractMaterialsFromFieldTakeoff(fieldTakeoff)
    if (boards.length === 0 && accessories.length === 0) {
      toast.error('Add field measurements or accessories first')
      return
    }
    downloadDrywallFieldMaterialsPdf(projectPdfMeta, fieldTakeoff)
    // Not an order — this prints the whole field takeoff, regardless of what has been
    // ordered. Calling it an order PDF sent an operator looking for one order's lines in a
    // document that never had them.
    toast.success('Field materials PDF downloaded')
  }


  const handleChangeOrderPdf = async (changeOrder: DrywallChangeOrder) => {
    if (!project) return
    try {
      await downloadDrywallChangeOrderPdf({
        project: projectPdfMeta,
        quote,
        po: project.legacy.poData ?? project.legacy.po,
        changeOrder,
        changeOrders,
      })
      toast.success('Change order PDF downloaded')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to generate change order PDF')
      throw error
    }
  }

  /**
   * Order → production, the one step the lifecycle actually allows from here.
   *
   * This used to jump straight to `closed` with no guard and no productionCompletedAt, so
   * the job vanished from Financials, Labor and Estimating — they key off that timestamp.
   * Closing out now happens where closing out belongs, on the Closeout stage, after
   * production has actually run.
   */
  const handleStartProduction = async () => {
    if (readOnly || !project) return
    if (isDirty) {
      toast.error('Save pending changes before starting production')
      return
    }
    setCompleting(true)
    try {
      const nextRaw = await markProductionStarted(projectId, project.updatedAtRaw)
      setProject((prev) => (prev ? { ...prev, updatedAtRaw: nextRaw } : prev))
      toast.success('Production started')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to start production')
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

  const isOrderStage =
    String(project?.legacy?.status ?? project?.status ?? '') === 'order'
  const isComplete =
    isDrywallProjectClosed(project?.status) ||
    isDrywallProjectClosed(String(project?.legacy?.status ?? ''))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Order</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Orders for this job, and whether they still fit the bid. New orders start from a
            stock or delivery item on the schedule, which supplies the date. Save explicitly
            before leaving this page.
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
          {!readOnly && (
            <>
              {/*
                Creating an order starts from the schedule, not here.

                Both paths existed and the schedule one won on its own: of 51 orders, every
                one created from a stock item carries a supplier, a delivery date and a real
                status, while this page produced nine abandoned drafts — four of them exact
                twins of the order that was actually sent, same job, same day, same item
                count. The date and the supplier link come for free from the item; started
                here they have to be set by hand, and usually never were.

                Mark, 2026-09-30, on the one case that might have justified keeping it:
                "If we need a top-up, we should still create the schedule item and have the
                order attached to that schedule item." Their own driver delivering does not
                change that.
              */}
              <Button type="button" variant="outline" asChild>
                <Link to={`/drywall/projects/${projectId}/schedule`}>
                  <Truck className="mr-2 h-4 w-4" />
                  Order from a delivery
                </Link>
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

      <MaterialReconcileCard fieldTakeoff={fieldTakeoff} orders={orders} />

      <OrderFinancialCard
        quote={quote}
        fieldTakeoff={fieldTakeoff}
        changeOrders={changeOrders}
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
                              onClick={() => requestSendToSupplier(order)}
                            >
                              <Mail className="mr-1.5 h-3.5 w-3.5" />
                              Send to supplier
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
        busyId={changeOrderBusyId}
        onSubmit={(changeOrder) =>
          handleChangeOrderTransition(changeOrder, { action: 'submit' })
        }
        onAccept={(changeOrder, acceptedAmount, acceptanceReference) =>
          handleChangeOrderTransition(changeOrder, {
            action: 'accept',
            acceptedAmount,
            acceptanceReference,
          })
        }
        onReject={(changeOrder, rejectionNotes) =>
          handleChangeOrderTransition(changeOrder, { action: 'reject', rejectionNotes })
        }
        onDownloadPdf={handleChangeOrderPdf}
      />

      {/* Closing out is not an Order-stage action. The only forward step from here is into
          production; Closeout owns the end of the job, after production has run. */}
      {!readOnly && !isComplete && isOrderStage ? (
        <div className="flex justify-end border-t border-border pt-4">
          <Button type="button" onClick={() => void handleStartProduction()} disabled={completing}>
            {completing ? 'Starting…' : 'Start production'}
          </Button>
        </div>
      ) : null}

      <Dialog
        open={Boolean(sendConfirm)}
        onOpenChange={(open) => {
          if (!open && !sending) setSendConfirm(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send order to supplier</DialogTitle>
            <DialogDescription>
              {sendRecipientEmail ? (
                <>
                  Email this purchase order (PDF attachment + full order with area/stocking
                  notes) to{' '}
                  <span className="font-medium text-foreground">{sendRecipientEmail}</span> and
                  mark it sent.
                </>
              ) : (
                <>
                  {sendConfirm?.supplier || 'This supplier'} has no email on file. Add one under{' '}
                  Suppliers to email the PO, or mark the order sent without emailing.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSendConfirm(null)}
              disabled={sending}
            >
              Cancel
            </Button>
            {sendRecipientEmail ? (
              <Button
                type="button"
                onClick={() => void confirmSendToSupplier(true)}
                disabled={sending}
              >
                <Mail className="mr-2 h-4 w-4" />
                {sending ? 'Sending…' : 'Email PO & mark sent'}
              </Button>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void confirmSendToSupplier(false)}
                disabled={sending}
              >
                {sending ? 'Saving…' : 'Mark sent without email'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OrderEditorDialog
        open={Boolean(editingOrderId)}
        onOpenChange={(open) => {
          if (!open) setEditingOrderId(null)
        }}
        order={editingOrder}
        project={projectPdfMeta}
        suppliers={suppliers}
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
