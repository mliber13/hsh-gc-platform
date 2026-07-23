// ============================================================================
// Supplier view P2 — cross-project material order board.
// Reads flat order rows via the drywall_supplier_orders RPC (server-side extraction
// from projects.metadata.legacy.orders — never ships full metadata).
// ============================================================================

import { supabase, isOnlineMode } from '@/lib/supabase'

export interface SupplierOrderRow {
  projectId: string
  projectName: string
  orderId: string
  orderNumber: string | null
  supplierId: string | null
  supplier: string | null
  deliveryDate: string | null
  status: string
  itemCount: number
  updatedAt: string | null
  scheduleItemId: string | null
  scheduleItemName: string | null
}

type RpcRow = {
  project_id: string
  project_name: string | null
  order_id: string | null
  order_number: string | null
  supplier_id: string | null
  supplier: string | null
  delivery_date: string | null
  status: string | null
  item_count: number | null
  updated_at: string | null
  schedule_item_id: string | null
  schedule_item_name: string | null
}

export async function fetchSupplierOrders(): Promise<SupplierOrderRow[]> {
  if (!isOnlineMode()) return []
  const { data, error } = await supabase.rpc('drywall_supplier_orders')
  if (error) {
    console.error('fetchSupplierOrders:', error)
    return []
  }
  return ((data ?? []) as RpcRow[])
    .filter((r) => r.order_id)
    .map((r) => ({
      projectId: r.project_id,
      projectName: r.project_name?.trim() || 'Untitled',
      orderId: r.order_id as string,
      orderNumber: r.order_number,
      supplierId: r.supplier_id,
      supplier: r.supplier,
      deliveryDate: r.delivery_date,
      status: r.status || 'draft',
      itemCount: Number(r.item_count) || 0,
      updatedAt: r.updated_at,
      scheduleItemId: r.schedule_item_id,
      scheduleItemName: r.schedule_item_name,
    }))
}
