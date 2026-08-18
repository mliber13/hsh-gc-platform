// ============================================================================
// Supabase Edge Function: Email a material Purchase Order to the supplier
// ============================================================================
//
// Built for suppliers whose corporate IT blocks our no-login share link: this
// delivers the order the way any corporate security posture accepts it — a PDF
// purchase order ATTACHED to an email, with the full order (grouped by area,
// including per-area delivery/stocking notes) also written inline in the body
// so it's readable even if the attachment is stripped.
//
// Recipient is derived server-side from the supplier record (never trusted from
// the client), and the project is read through the caller's JWT so RLS ensures
// they can only email orders in their own org.
//
// Setup (same secrets as send-quote-email):
//   supabase secrets set RESEND_API_KEY=re_...
//   supabase secrets set FROM_EMAIL="HSH Drywall <orders@your-verified-domain>"
// Deploy: supabase functions deploy send-supplier-order
//
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'onboarding@resend.dev'

const BRAND = '#cf533e'
const TEXT = '#1e293b'
const MUTED = '#64748b'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

type OrderItem = { description?: string; quantity?: string; unit?: string; notes?: string; area?: string }
type Order = Record<string, unknown> & { items?: OrderItem[] }

const GENERAL = 'Accessories & general'

/** Group items by field area, keeping the general bucket last (mirrors groupOrderItemsByArea). */
function groupByArea(items: OrderItem[]): Array<{ area: string; items: OrderItem[] }> {
  const groups: Array<{ area: string; items: OrderItem[] }> = []
  const byKey = new Map<string, { area: string; items: OrderItem[] }>()
  for (const item of items) {
    const area = (item.area || '').trim() || GENERAL
    let g = byKey.get(area)
    if (!g) {
      g = { area, items: [] }
      byKey.set(area, g)
      groups.push(g)
    }
    g.items.push(item)
  }
  return groups.sort((a, b) => (a.area === GENERAL ? 1 : b.area === GENERAL ? -1 : 0))
}

function renderHtml(opts: {
  projectName: string
  projectAddress: string
  supplierName: string
  order: Order
}): string {
  const { projectName, projectAddress, supplierName, order } = opts
  const items = Array.isArray(order.items) ? order.items : []
  const groups = groupByArea(items)
  const showAreas = groups.length > 1
  const orderLabel = String(order.orderNumber || `Order ${String(order.id ?? '').slice(-6)}`)

  const metaRows: string[] = []
  if (order.deliveryDate) metaRows.push(`<strong>Delivery / stock date:</strong> ${esc(order.deliveryDate)}`)
  if (order.deliveryAddress) metaRows.push(`<strong>Ship to:</strong> ${esc(order.deliveryAddress)}`)
  else if (projectAddress) metaRows.push(`<strong>Job site:</strong> ${esc(projectAddress)}`)

  const groupsHtml = groups
    .map((g) => {
      const rows = g.items
        .map(
          (it) => `
          <tr>
            <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;">${esc(it.description || '—')}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap;">${esc(it.quantity || '')}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap;">${esc(it.unit || 'pcs')}</td>
            <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;color:${MUTED};">${esc(it.notes || '')}</td>
          </tr>`,
        )
        .join('')
      const header = showAreas
        ? `<tr><td colspan="4" style="padding:8px;background:#e8ecf4;font-weight:700;font-size:13px;">${esc(g.area)}</td></tr>`
        : ''
      return header + rows
    })
    .join('')

  return `<!DOCTYPE html>
  <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
  <body style="font-family:'Segoe UI',system-ui,-apple-system,sans-serif;line-height:1.5;color:${TEXT};background:#f1f5f9;margin:0;">
    <div style="max-width:640px;margin:0 auto;padding:24px 16px;">
      <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.08);">
        <div style="background:${BRAND};color:#fff;padding:22px 24px;">
          <div style="font-size:13px;letter-spacing:0.06em;opacity:0.9;">HSH DRYWALL</div>
          <div style="font-size:20px;font-weight:700;margin-top:2px;">Material Purchase Order</div>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 12px;">Hello${supplierName ? ` ${esc(supplierName)}` : ''},</p>
          <p style="margin:0 0 16px;">Please find our material order below and attached as a PDF.</p>
          <div style="background:#f8fafc;border-left:4px solid ${BRAND};border-radius:8px;padding:12px 16px;margin:0 0 18px;font-size:14px;">
            <div><strong>Project:</strong> ${esc(projectName)}</div>
            <div><strong>Order:</strong> ${esc(orderLabel)}</div>
            ${metaRows.map((r) => `<div>${r}</div>`).join('')}
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr>
                <th style="padding:8px;text-align:left;background:${BRAND};color:#fff;">Description</th>
                <th style="padding:8px;text-align:right;background:${BRAND};color:#fff;">Qty</th>
                <th style="padding:8px;text-align:right;background:${BRAND};color:#fff;">Unit</th>
                <th style="padding:8px;text-align:left;background:${BRAND};color:#fff;">Notes</th>
              </tr>
            </thead>
            <tbody>${groupsHtml || '<tr><td colspan="4" style="padding:8px;color:#64748b;">No line items</td></tr>'}</tbody>
          </table>
          ${
            order.notes
              ? `<div style="margin-top:18px;"><div style="font-weight:700;font-size:13px;margin-bottom:4px;">Delivery / stocking notes</div>
                 <div style="white-space:pre-wrap;font-size:13px;background:#f8fafc;padding:12px;border-radius:8px;">${esc(order.notes)}</div></div>`
              : ''
          }
          <p style="margin:20px 0 0;font-size:13px;color:${MUTED};">Please reply to this email or call to confirm receipt and expected delivery.</p>
        </div>
        <div style="padding:16px 24px;text-align:center;color:${MUTED};font-size:12px;border-top:1px solid #e2e8f0;">
          Thank you,<br><strong>HSH Drywall</strong>
        </div>
      </div>
    </div>
  </body></html>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: { ...corsHeaders, 'Access-Control-Allow-Methods': 'POST, OPTIONS' },
    })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

    let body: {
      projectId?: string
      orderId?: string
      pdfBase64?: string
      pdfFilename?: string
    }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'Invalid JSON in request body' }, 400)
    }

    const projectId = String(body.projectId ?? '').trim()
    const orderId = String(body.orderId ?? '').trim()
    if (!projectId || !orderId) return json({ error: 'Missing projectId or orderId' }, 400)

    if (!RESEND_API_KEY) {
      return json({ success: false, error: 'Email service not configured' }, 200)
    }

    // Caller-scoped client → RLS restricts reads to the caller's org.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } },
    )

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) return json({ error: 'Unauthorized' }, 401)

    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('id, name, address, metadata')
      .eq('id', projectId)
      .single()
    if (projErr || !project) return json({ error: 'Order not found or access denied' }, 404)

    const metadata = (project.metadata ?? {}) as Record<string, unknown>
    const legacy = (metadata.legacy ?? {}) as Record<string, unknown>
    const orders = Array.isArray(legacy.orders) ? (legacy.orders as Order[]) : []
    const order = orders.find((o) => o && String(o.id ?? '') === orderId)
    if (!order) return json({ error: 'Order not found' }, 404)

    const supplierId = String(order.supplierId ?? '').trim()
    if (!supplierId) {
      return json(
        { error: 'This order has no supplier assigned. Pick a supplier on the order first.' },
        400,
      )
    }

    // Recipient is authoritative from the supplier record (RLS-scoped), never the client.
    const { data: supplier } = await supabase
      .from('suppliers')
      .select('name, email')
      .eq('id', supplierId)
      .maybeSingle()
    const to = String(supplier?.email ?? '').trim()
    if (!to) {
      return json(
        { error: 'No email on file for this supplier. Add one under Suppliers, then resend.' },
        400,
      )
    }

    const projectName = String(project.name || 'Project')
    const projectAddress =
      typeof project.address === 'string' ? project.address : ''
    const supplierName = String(supplier?.name ?? order.supplier ?? '')
    const orderLabel = String(order.orderNumber || `Order ${orderId.slice(-6)}`)

    const html = renderHtml({ projectName, projectAddress, supplierName, order })

    const attachments =
      typeof body.pdfBase64 === 'string' && body.pdfBase64.length > 0
        ? [
            {
              filename: String(body.pdfFilename || `PO-${projectName}.pdf`).replace(
                /[^a-z0-9._-]/gi,
                '-',
              ),
              content: body.pdfBase64,
            },
          ]
        : undefined

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject: `Material Order — ${projectName} (${orderLabel})`,
        html,
        ...(attachments ? { attachments } : {}),
      }),
    })

    if (!resendResponse.ok) {
      let errorMessage = 'Failed to send email'
      try {
        const errorData = await resendResponse.json()
        errorMessage = errorData.message || errorData.error?.message || errorMessage
      } catch {
        errorMessage = (await resendResponse.text()) || errorMessage
      }
      console.error('Resend API error:', errorMessage)
      return json({ success: false, error: errorMessage }, 500)
    }

    const result = await resendResponse.json()
    return json({ success: true, messageId: result.id, to })
  } catch (error) {
    console.error('send-supplier-order error', error)
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
