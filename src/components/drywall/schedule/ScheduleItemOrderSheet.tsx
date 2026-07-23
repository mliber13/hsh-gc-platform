// ============================================================================
// Supplier view — attach a material order sheet to a stock schedule item.
// The order is linked via scheduleItemId; the schedule item's date drives the
// delivery date on the supplier board. Reuses the Order-stage OrderEditorDialog.
// ============================================================================

import { useCallback, useEffect, useState } from 'react'
import { Package, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { generateFieldId } from '@/lib/drywall/fieldMeasurementUtils'
import {
  deleteOrder,
  fetchDrywallProjectById,
  fetchFieldTakeoff,
  getOrdersFromLegacy,
  saveOrder,
} from '@/services/drywallProjectsService'
import { suggestOrderItemsFromFieldTakeoff } from '@/lib/drywall/orderSuggest'
import { fetchSuppliers } from '@/services/partnerDirectoryService'
import type { DrywallOrder, DrywallProject } from '@/types/drywall'
import type { Supplier } from '@/types/partners'
import { OrderEditorDialog } from '@/components/drywall/order/OrderEditorDialog'
import { OrderStatusBadge } from '@/components/drywall/order/OrderStatusBadge'

type ProjectMeta = Pick<DrywallProject, 'name' | 'address' | 'client'>

interface ScheduleItemOrderSheetProps {
  projectId: string
  scheduleItemId: string
  /** The schedule item's start date — defaults the order's delivery date. */
  scheduleItemDate: string
  readOnly: boolean
}

export function ScheduleItemOrderSheet({
  projectId,
  scheduleItemId,
  scheduleItemDate,
  readOnly,
}: ScheduleItemOrderSheetProps) {
  const [loading, setLoading] = useState(true)
  const [order, setOrder] = useState<DrywallOrder | null>(null)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [projectMeta, setProjectMeta] = useState<ProjectMeta>({ name: '', address: '', client: '' })
  const [draft, setDraft] = useState<DrywallOrder | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [attaching, setAttaching] = useState(false)

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
        const orders = getOrdersFromLegacy(project.legacy)
        setOrder(orders.find((o) => o.scheduleItemId === scheduleItemId) ?? null)
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
    // New order, OR an existing linked order still empty → suggest items from the field takeoff
    // (same source as the Order stage + the material-list PDF).
    setAttaching(true)
    try {
      let suggestedItems: DrywallOrder['items'] = []
      try {
        suggestedItems = suggestOrderItemsFromFieldTakeoff(await fetchFieldTakeoff(projectId))
      } catch {
        suggestedItems = []
      }
      const now = new Date().toISOString()
      if (order) {
        // Keep the existing (empty) linked order, just fill in the suggested items.
        setDraft({ ...order, items: suggestedItems, updatedAt: now })
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
      await saveOrder(projectId, toSave)
      setOrder(toSave)
      toast.success('Order sheet saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save order sheet')
    }
  }

  const handleDelete = async () => {
    if (!draft) return
    try {
      await deleteOrder(projectId, draft.id)
      setOrder(null)
      setEditorOpen(false)
      toast.success('Order sheet removed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to remove order sheet')
    }
  }

  // Nothing to show for a read-only viewer with no attached order.
  if (readOnly && !order) return null

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <Package className="h-4 w-4" />
          Material order sheet
        </Label>
        {order ? <OrderStatusBadge status={order.status} /> : null}
      </div>

      {order ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {order.supplier || 'No supplier'} · {order.items?.length ?? 0} item
            {(order.items?.length ?? 0) === 1 ? '' : 's'}
          </span>
          {!readOnly && (
            <Button type="button" size="sm" variant="outline" onClick={() => void openEditor()}>
              Edit order sheet
            </Button>
          )}
        </div>
      ) : (
        !readOnly && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Attach a supplier order for this stock item — items are suggested from the field
              measurements, and the delivery date follows this schedule item.
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
        allowDuplicate={false}
        onChange={setDraft}
        onDuplicate={() => undefined}
        onDelete={() => void handleDelete()}
      />
    </div>
  )
}
