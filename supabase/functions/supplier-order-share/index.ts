/**
 * Supplier order share (P3) — public, no-login endpoint for a supplier's order sheet.
 * The share token is the capability; this function validates it with the service role
 * (the token is never exposed to anon at the table level).
 *
 * Actions:
 *   list    → that supplier's active orders (status sent/confirmed/partial), read-only.
 *   confirm → supplier acknowledges (status sent → confirmed). Whitelisted status write only.
 *   deliver → supplier marks delivered (status confirmed|partial → complete).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const shareCors = {
  ...corsHeaders,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...shareCors, 'Content-Type': 'application/json' },
  })
}

/** Mirror the app's formatListAddress (string or {street/city/state/zip} object). */
function formatAddress(a: unknown): string {
  if (typeof a === 'string') return a.trim()
  if (a && typeof a === 'object') {
    const o = a as Record<string, unknown>
    const street = String(o.street || o.address || o.line1 || '')
    const zip = String(o.zip || o.zip_code || '')
    return [street, o.city, o.state, zip].filter(Boolean).join(', ')
  }
  return ''
}

/** Mirror the app's formatListClient (string or {name/company} object). */
function formatClient(c: unknown): string {
  if (typeof c === 'string') return c.trim()
  if (c && typeof c === 'object') {
    const o = c as Record<string, unknown>
    return String(o.name || o.company || '')
  }
  return ''
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: shareCors })

  try {
    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !serviceKey) return json({ error: 'Function not configured' }, 500)

    const admin = createClient(url, serviceKey)

    const body = await req.json().catch(() => ({}))
    const token = String(body.token ?? '').trim()
    const action = String(body.action ?? 'list').trim()
    if (!token) return json({ error: 'Missing token' }, 400)

    // Validate the capability token → supplier + org.
    const { data: link } = await admin
      .from('supplier_share_links')
      .select('supplier_id, organization_id')
      .eq('token', token)
      .is('revoked_at', null)
      .maybeSingle()
    if (!link) return json({ error: 'This link is not valid.' }, 403)

    // ---- READ ----
    if (action === 'list') {
      const { data, error } = await admin.rpc('supplier_share_orders', { p_token: token })
      if (error) return json({ error: error.message }, 500)
      const rows = (data ?? []) as Array<{
        supplier_name: string | null
        project_id: string
        project_name: string | null
        project_address: unknown
        project_client: unknown
        order_json: Record<string, unknown>
        delivery_date: string | null
      }>
      // Advance-notice estimates: supplier-assigned future stock items with no order yet.
      const { data: upData } = await admin.rpc('supplier_share_upcoming', { p_token: token })
      const upcoming = ((upData ?? []) as Array<Record<string, unknown>>).map((u) => ({
        projectName: (u.project_name as string | null) ?? 'Project',
        itemName: (u.item_name as string | null) ?? '',
        stockDate: (u.stock_date as string | null) ?? null,
        quotedSqft: u.quoted_sqft == null ? null : Number(u.quoted_sqft),
      }))

      return json({
        supplierName: rows[0]?.supplier_name ?? null,
        orders: rows.map((r) => ({
          projectId: r.project_id,
          projectName: r.project_name ?? 'Project',
          projectAddress: formatAddress(r.project_address),
          projectClient: formatClient(r.project_client),
          deliveryDate: r.delivery_date,
          order: r.order_json,
        })),
        upcoming,
      })
    }

    // ---- CONSTRAINED WRITE (confirm / deliver) ----
    if (action === 'confirm' || action === 'deliver') {
      const projectId = String(body.project_id ?? '').trim()
      const orderId = String(body.order_id ?? '').trim()
      if (!projectId || !orderId) return json({ error: 'Missing project/order id' }, 400)

      const { data: project } = await admin
        .from('projects')
        .select('id, metadata')
        .eq('id', projectId)
        .eq('organization_id', link.organization_id)
        .maybeSingle()
      if (!project) return json({ error: 'Order not found' }, 404)

      const metadata = (project.metadata ?? {}) as Record<string, unknown>
      const legacy = (metadata.legacy ?? {}) as Record<string, unknown>
      const orders = Array.isArray(legacy.orders) ? (legacy.orders as Record<string, unknown>[]) : []
      const idx = orders.findIndex((o) => o && o.id === orderId)
      if (idx < 0) return json({ error: 'Order not found' }, 404)

      const order = orders[idx]
      // The order must belong to this supplier (token owner).
      if (String(order.supplierId ?? '') !== String(link.supplier_id)) {
        return json({ error: 'Not authorized for this order' }, 403)
      }

      const now = new Date().toISOString()
      const status = String(order.status ?? 'draft')
      if (action === 'confirm') {
        if (status !== 'sent') return json({ error: 'This order is not awaiting confirmation.' }, 409)
        orders[idx] = { ...order, status: 'confirmed', supplierConfirmedAt: now, updatedAt: now }
      } else {
        if (status !== 'confirmed' && status !== 'partial') {
          return json({ error: 'This order is not ready to mark delivered.' }, 409)
        }
        orders[idx] = { ...order, status: 'complete', supplierDeliveredAt: now, updatedAt: now }
      }

      // Only legacy.orders changes; visibility/app_scope/quote/etc. are preserved.
      const newMetadata = { ...metadata, legacy: { ...legacy, orders } }
      const { error: upErr } = await admin
        .from('projects')
        .update({ metadata: newMetadata, updated_at: now })
        .eq('id', projectId)
      if (upErr) return json({ error: upErr.message }, 500)

      return json({ success: true, status: orders[idx].status })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    console.error('supplier-order-share error', e)
    return json({ error: String(e) }, 500)
  }
})
