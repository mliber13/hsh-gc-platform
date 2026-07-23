// ============================================================================
// Supplier view P3 — per-supplier no-login share link.
// Office side generates/copies the link; the public page reads + confirms via the
// supplier-order-share edge function (token is the capability; validated server-side).
// ============================================================================

import { supabase } from '@/lib/supabase'
import { requireUserOrgId } from '@/services/userService'
import type { DrywallOrder } from '@/types/drywall'

/** 64 hex chars — unguessable capability token. */
function generateShareToken(): string {
  const rand = () => crypto.randomUUID().replace(/-/g, '')
  return rand() + rand()
}

/** Office: get the supplier's existing active share link, or create one. Returns the full URL. */
export async function getOrCreateSupplierShareLink(supplierId: string): Promise<string> {
  const orgId = await requireUserOrgId()

  const { data: existing, error: readError } = await supabase
    .from('supplier_share_links')
    .select('token')
    .eq('supplier_id', supplierId)
    .is('revoked_at', null)
    .maybeSingle()
  if (readError) throw new Error(readError.message || 'Failed to read supplier link')

  let token = existing?.token as string | undefined
  if (!token) {
    token = generateShareToken()
    const { error: insertError } = await supabase.from('supplier_share_links').insert({
      organization_id: orgId,
      supplier_id: supplierId,
      token,
    })
    if (insertError) throw new Error(insertError.message || 'Failed to create supplier link')
  }

  return `${window.location.origin}/supplier/${token}`
}

// ---- Public (no-login) side — invoked from the /supplier/:token page ----

export interface SupplierShareOrder {
  projectId: string
  projectName: string
  projectAddress: string
  projectClient: string
  deliveryDate: string | null
  order: DrywallOrder
}

export interface SupplierShareData {
  supplierName: string | null
  orders: SupplierShareOrder[]
}

export async function fetchSupplierShareOrders(token: string): Promise<SupplierShareData> {
  const { data, error } = await supabase.functions.invoke('supplier-order-share', {
    body: { token, action: 'list' },
  })
  if (error) throw new Error(error.message || 'Failed to load orders')
  if (data?.error) throw new Error(String(data.error))
  return {
    supplierName: data?.supplierName ?? null,
    orders: (data?.orders ?? []) as SupplierShareOrder[],
  }
}

export async function supplierUpdateOrderStatus(
  token: string,
  projectId: string,
  orderId: string,
  action: 'confirm' | 'deliver',
): Promise<void> {
  const { data, error } = await supabase.functions.invoke('supplier-order-share', {
    body: { token, action, project_id: projectId, order_id: orderId },
  })
  if (error) throw new Error(error.message || 'Action failed')
  if (data?.error) throw new Error(String(data.error))
}
