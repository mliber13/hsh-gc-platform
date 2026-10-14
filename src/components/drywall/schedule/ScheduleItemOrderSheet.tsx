// ============================================================================
// Supplier view — attach a material order sheet to a stock schedule item.
// The order is linked via scheduleItemId; the schedule item's date drives the
// delivery date on the supplier board. Reuses the Order-stage OrderEditorDialog.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { FileDown, Mail, Package, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { generateFieldId } from '@/lib/drywall/fieldMeasurementUtils'
import {
  deleteOrder,
  fetchDrywallProjectById,
  fetchFieldTakeoff,
  getOrdersFromLegacy,
  markOrderStatus,
  saveOrder,
} from '@/services/drywallProjectsService'
import { suggestOrderItemsFromFieldTakeoff } from '@/lib/drywall/orderSuggest'
import { orderForScheduleItem } from '@/lib/drywall/adoptDraftOrder'
import { downloadDrywallFieldMaterialsPdf } from '@/lib/drywall/fieldMaterialsOrderPdf'
import { downloadDrywallOrderPdf } from '@/lib/drywallOrderPdf'
import { fetchSuppliers } from '@/services/partnerDirectoryService'
import type { DrywallOrder, DrywallProject } from '@/types/drywall'
import type { Supplier } from '@/types/partners'
import { OrderEditorDialog } from '@/components/drywall/order/OrderEditorDialog'
import { OrderStatusBadge } from '@/components/drywall/order/OrderStatusBadge'
import { SendOrderToSupplierDialog } from '@/components/drywall/order/SendOrderToSupplierDialog'

type ProjectMeta = Pick<DrywallProject, 'name' | 'address' | 'client'>

interface ScheduleItemOrderSheetProps {
  projectId: string
  scheduleItemId: string
  /** The schedule item's start date — defaults the order's delivery date. */
  scheduleItemDate: string
  readOnly: boolean
  /**
   * After this sheet writes the project, with the new timestamp. A page showing several sheets
   * (Field step 4) needs it: each holds its own updated_at, and one sheet's write leaves the
   * others' stale — their next save would be refused as "changed somewhere else".
   */
  onChanged?: (nextLoadedAt: string) => void
}

export function ScheduleItemOrderSheet({
  projectId,
  scheduleItemId,
  scheduleItemDate,
  readOnly,
  onChanged,
}: ScheduleItemOrderSheetProps) {
  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState<DrywallOrder | null>(null)
  const [otherOrders, setOtherOrders] = useState<DrywallOrder[]>([])
  // The draft the field → order advance seeded, waiting for a schedule item. Attaching here
  // takes it over instead of creating a second order beside it (adoptDraftOrder.ts).
  const [adoptable, setAdoptable] = useState<DrywallOrder | null>(null)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [projectMeta, setProjectMeta] = useState<ProjectMeta>({ name: '', address: '', client: '' })
  const [loadedAt, setLoadedAt] = useState('')
  const [draft, setDraft] = useState<DrywallOrder | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [project, sup] = await Promise.all([
        fetchDrywallProjectById(projectId),
        fetchSuppliers().catch(() => [] as Supplier[]),
      ])
      setSuppliers(sup)
      if (project) {
        setProjectMeta({ name: project.name, address: project.address, client: project.client })
        setLoadedAt(project.updatedAtRaw)
        const orders = getOrdersFromLegacy(project.legacy)
        const resolved = orderForScheduleItem(orders, scheduleItemId)
        const waiting = resolved.adopted ? resolved.order : null
        setOrder(resolved.adopted ? null : resolved.order)
        setAdoptable(waiting)
        // Every other order on the job, so the suggestion can subtract what is already
        // committed — this sheet is the usual way a second delivery gets created.
        setOtherOrders(
          orders.filter((o) => o.scheduleItemId !== scheduleItemId && o.id !== waiting?.id),
        )
      }
    } finally {
      setLoading(false)
    }
  }, [projectId, scheduleItemId])

  useEffect(() => {
    void load()
  }, [load])

  const defaultSupplier = suppliers.length === 1 ? suppliers[0] : null

  const openEditor = async () => {
    // Existing order that already has line items → open as-is.
    if (order && (order.items?.length ?? 0) > 0) {
      setDraft(order)
      setEditorOpen(true)
      return
    }
    // The seeded draft, with its items and any edits made on the supplier board, becomes this
    // item's order. Saving links it (saveOrder replaces by id), so no second order appears.
    if (!order && adoptable && (adoptable.items?.length ?? 0) > 0) {
      setDraft({
        ...adoptable,
        scheduleItemId,
        deliveryDate: scheduleItemDate || adoptable.deliveryDate,
        deliveryAddress: adoptable.deliveryAddress || projectMeta.address,
        updatedAt: new Date().toISOString(),
      })
      toast.message('Using the draft order created when the job moved to Order')
      setEditorOpen(true)
      return
    }
    // New order, OR an existing linked order still empty → suggest items from the field takeoff
    // (same source as the Order stage + the material-list PDF).
    setAttaching(true)
    try {
      let suggestedItems: DrywallOrder['items'] = []
      try {
        const suggestion = suggestOrderItemsFromFieldTakeoff(
          await fetchFieldTakeoff(projectId),
          otherOrders,
        )
        suggestedItems = suggestion.items
        const alreadyOrdered = suggestion.suppressed + suggestion.reduced
        if (alreadyOrdered > 0) {
          toast.message(`${alreadyOrdered} line(s) already on earlier orders — not suggested here`)
        }
      } catch {
        suggestedItems = []
      }
      const now = new Date().toISOString()
      if (order) {
        // Keep the existing (empty) linked order, just fill in the suggested items.
        setDraft({ ...order, items: suggestedItems, updatedAt: now })
      } else if (adoptable) {
        // An empty seeded draft: take it over and fill it, rather than add a second order.
        setDraft({
          ...adoptable,
          scheduleItemId,
          deliveryDate: scheduleItemDate || adoptable.deliveryDate,
          deliveryAddress: adoptable.deliveryAddress || projectMeta.address,
          items: suggestedItems,
          updatedAt: now,
        })
      } else {
        setDraft({
          id: generateFieldId(),
          status: 'draft',
          scheduleItemId,
          deliveryDate: scheduleItemDate || undefined,
          deliveryAddress: projectMeta.address,
          items: suggestedItems,
          ...(defaultSupplier
            ? {
                supplierId: defaultSupplier.id,
                supplier: defaultSupplier.name,
                supplierContact:
                  [defaultSupplier.contactName, defaultSupplier.phone].filter(Boolean).join(' · ') ||
                  undefined,
              }
            : {}),
          createdAt: now,
          updatedAt: now,
        })
      }
      setEditorOpen(true)
    } finally {
      setAttaching(false)
    }
  }

  const persistDraft = async () => {
    if (!draft) return
    try {
      // Keep the link tied to this schedule item regardless of edits.
      const toSave: DrywallOrder = { ...draft, scheduleItemId }
      const nextRaw = await saveOrder(projectId, toSave, loadedAt)
      setLoadedAt(nextRaw)
      setOrder(toSave)
      if (adoptable?.id === toSave.id) setAdoptable(null)
      toast.success('Order sheet saved')
      onChanged?.(nextRaw)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save order sheet')
    }
  }

  const handleDelete = async () => {
    if (!draft) return
    try {
      const nextRaw = await deleteOrder(projectId, draft.id, loadedAt)
      setLoadedAt(nextRaw)
      setOrder(null)
      setEditorOpen(false)
      toast.success('Order sheet removed')
      onChanged?.(nextRaw)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove order sheet')
    }
  }

  /**
   * The materials-by-area PDF, straight from the field takeoff. Deliberately
   * independent of the order sheet and of any supplier: it takes only the
   * project and the takeoff, so the list can go to whoever is actually making
   * the delivery — an employee running material out to a small job — without
   * inventing a supplier record for them.
   */
  /**
   * The PDF for whatever this card is showing.
   *
   * With an order attached that is the order itself — the card is about that order, and a
   * button beside "L&W Supply · 5 items" that produced the whole job's takeoff read as the
   * order being wrong. Without one there is nothing to print but the field materials list.
   */
  const downloadMaterialList = async () => {
    if (order) {
      downloadDrywallOrderPdf(projectMeta, order)
      return
    }
    setDownloading(true)
    try {
      const takeoff = await fetchFieldTakeoff(projectId)
      const hasAnything =
        (takeoff.measurements?.length ?? 0) > 0 || (takeoff.accessories?.length ?? 0) > 0
      if (!hasAnything) {
        toast.error('No field measurements on this project yet.')
        return
      }
      downloadDrywallFieldMaterialsPdf(projectMeta, takeoff)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not build the material list')
    } finally {
      setDownloading(false)
    }
  }

  const markConfirmed = async () => {
    if (!order) return
    setConfirming(true)
    try {
      const next = await markOrderStatus(projectId, order.id, 'confirmed', loadedAt)
      setLoadedAt(next)
      toast.success('Order marked confirmed')
      await load()
      onChanged?.(next)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update the order')
    } finally {
      setConfirming(false)
    }
  }

  const recipientEmail =
    (order?.supplierId && suppliers.find((s) => s.id === order.supplierId)?.email?.trim()) || ''

  // Nothing to show for a read-only viewer with no attached order.
  if (readOnly && !order) return null

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <Package className="h-4 w-4" />
          Material order sheet
        </Label>
        <div className="flex items-center gap-2">
          {order ? <OrderStatusBadge status={order.status} /> : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => void downloadMaterialList()}
            disabled={loading || downloading}
            title={
              order
                ? 'This order sheet, grouped by area'
                : 'Materials by area from the field measurements — no supplier needed'
            }
          >
            <FileDown className="h-3.5 w-3.5" />
            {downloading ? 'Building…' : order ? 'Order PDF' : 'Material list PDF'}
          </Button>
        </div>
      </div>

      {order ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {order.supplier || 'No supplier'} · {order.items?.length ?? 0} item
            {(order.items?.length ?? 0) === 1 ? '' : 's'}
          </span>
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              {order.status === 'draft' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={(order.items?.length ?? 0) === 0}
                  title={(order.items?.length ?? 0) === 0 ? 'Add line items first' : undefined}
                  onClick={() => setSendOpen(true)}
                >
                  <Mail className="mr-1.5 h-3.5 w-3.5" />
                  Send to supplier
                </Button>
              ) : null}
              {order.status === 'sent' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={confirming}
                  onClick={() => void markConfirmed()}
                >
                  Mark confirmed
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="outline" onClick={() => void openEditor()}>
                Edit order sheet
              </Button>
            </div>
          )}
        </div>
      ) : (
        !readOnly && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {adoptable
                ? `The draft order from the field measurement (${adoptable.items?.length ?? 0} items) will be attached here — the delivery date follows this schedule item.`
                : 'Attach a supplier order for this stock item — items are suggested from the field measurements, and the delivery date follows this schedule item.'}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void openEditor()}
              disabled={loading || attaching}
            >
              <Plus className="mr-1 h-4 w-4" />
              {attaching ? 'Attaching…' : 'Attach order sheet'}
            </Button>
          </div>
        )
      )}

      <SendOrderToSupplierDialog
        projectId={projectId}
        project={projectMeta}
        order={sendOpen ? order : null}
        recipientEmail={recipientEmail}
        loadedAt={loadedAt}
        onClose={() => setSendOpen(false)}
        onSent={(next) => {
          setLoadedAt(next)
          setSendOpen(false)
          void load()
          onChanged?.(next)
        }}
      />

      <OrderEditorDialog
        open={editorOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditorOpen(false)
            void persistDraft()
          }
        }}
        order={draft}
        project={projectMeta}
        suppliers={suppliers}
        readOnly={readOnly}
        onChange={setDraft}
        onDelete={() => void handleDelete()}
      />
    </div>
  )
}
