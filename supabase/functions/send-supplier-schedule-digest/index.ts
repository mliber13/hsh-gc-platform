// ============================================================================
// Supabase Edge Function: Supplier delivery-schedule digest
// ============================================================================
//
// Emails each supplier a "your upcoming HSH deliveries" schedule. Two modes:
//
//   CRON  (empty body, called with the service-role key): iterate every
//         supplier and email only those whose schedule CHANGED since the last
//         digest they received. Time-gated to the 8am America/New_York hour so
//         a weekday cron firing at 12:00 & 13:00 UTC sends once across DST.
//
//   MANUAL ({ supplierId }, called with an operator's JWT): send that one
//         supplier their current schedule right now, regardless of change.
//
// The delivery schedule is a fresh snapshot each time, so a schedule that
// changes a lot self-corrects — the supplier just trusts the latest email.
//
// Setup: reuses RESEND_API_KEY / FROM_EMAIL. Deploy:
//   supabase functions deploy send-supplier-schedule-digest
//
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'onboarding@resend.dev'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

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

type Row = {
  organization_id: string
  supplier_id: string
  supplier_name: string | null
  supplier_email: string | null
  project_id: string
  project_name: string | null
  item_id: string
  item_name: string | null
  stock_date: string | null
  quoted_sqft: number | null
}

/** Is it currently the 8 o'clock hour in New York? (DST-safe via Intl.) */
function isEightAmNY(): boolean {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false,
  }).format(new Date())
  return Number(hour) === 8
}

/** Stable fingerprint of a supplier's schedule — changes when a delivery is added, removed, or re-dated. */
async function signature(rows: Row[]): Promise<string> {
  const basis = rows
    .map((r) => `${r.item_id}:${r.stock_date ?? ''}`)
    .sort()
    .join('\n')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(basis))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'TBD'
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  })
}

function renderHtml(supplierName: string, rows: Row[]): string {
  const body = rows
    .map(
      (r) => `
      <tr>
        <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;white-space:nowrap;font-weight:600;">${esc(fmtDate(r.stock_date))}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;">${esc(r.project_name || 'Project')}</td>
        <td style="padding:7px 8px;border-bottom:1px solid #e2e8f0;color:${MUTED};">${esc(r.item_name || '')}</td>
      </tr>`,
    )
    .join('')

  return `<!DOCTYPE html>
  <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
  <body style="font-family:'Segoe UI',system-ui,-apple-system,sans-serif;line-height:1.5;color:${TEXT};background:#f1f5f9;margin:0;">
    <div style="max-width:640px;margin:0 auto;padding:24px 16px;">
      <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.08);">
        <div style="background:${BRAND};color:#fff;padding:22px 24px;">
          <div style="font-size:13px;letter-spacing:0.06em;opacity:0.9;">HSH DRYWALL</div>
          <div style="font-size:20px;font-weight:700;margin-top:2px;">Upcoming Deliveries</div>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 12px;">Hello${supplierName ? ` ${esc(supplierName)}` : ''},</p>
          <p style="margin:0 0 16px;">Here is our current delivery schedule. Dates can shift — this reflects today's plan, and we'll send an update whenever it changes.</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr>
                <th style="padding:8px;text-align:left;background:${BRAND};color:#fff;">Date</th>
                <th style="padding:8px;text-align:left;background:${BRAND};color:#fff;">Project</th>
                <th style="padding:8px;text-align:left;background:${BRAND};color:#fff;">Material</th>
              </tr>
            </thead>
            <tbody>${body || '<tr><td colspan="3" style="padding:8px;color:#64748b;">No upcoming deliveries.</td></tr>'}</tbody>
          </table>
          <p style="margin:20px 0 0;font-size:13px;color:${MUTED};">Questions on any delivery? Reply to this email or give us a call.</p>
        </div>
        <div style="padding:16px 24px;text-align:center;color:${MUTED};font-size:12px;border-top:1px solid #e2e8f0;">
          Thank you,<br><strong>HSH Drywall</strong>
        </div>
      </div>
    </div>
  </body></html>`
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
  })
  if (!res.ok) {
    let msg = 'Failed to send email'
    try {
      const b = await res.json()
      msg = b.message || b.error?.message || msg
    } catch {
      msg = (await res.text()) || msg
    }
    throw new Error(msg)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: { ...corsHeaders, 'Access-Control-Allow-Methods': 'POST, OPTIONS' },
    })
  }

  try {
    if (!RESEND_API_KEY) return json({ success: false, error: 'Email service not configured' }, 200)
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return json({ error: 'Function not configured' }, 500)

    const authHeader = req.headers.get('Authorization') ?? ''
    const body = await req.json().catch(() => ({}))
    const supplierId = String((body as { supplierId?: string }).supplierId ?? '').trim()

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    // Load the full delivery schedule once (service role; RPC is service-role only).
    const { data, error } = await admin.rpc('drywall_supplier_delivery_schedule')
    if (error) return json({ error: error.message }, 500)
    const allRows = (data ?? []) as Row[]

    // ---- MANUAL: one supplier, on demand (operator JWT) ----
    if (supplierId) {
      if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      })
      const {
        data: { user },
        error: userErr,
      } = await userClient.auth.getUser()
      if (userErr || !user) return json({ error: 'Unauthorized' }, 401)

      // RLS check: the caller can only see suppliers in their own org.
      const { data: supplier } = await userClient
        .from('suppliers')
        .select('id, name, email')
        .eq('id', supplierId)
        .maybeSingle()
      if (!supplier) return json({ error: 'Supplier not found or access denied' }, 404)

      const to = String(supplier.email ?? '').trim()
      if (!to) {
        return json({ error: 'No email on file for this supplier. Add one under Suppliers.' }, 400)
      }

      const rows = allRows.filter((r) => r.supplier_id === supplierId)
      const supplierName = String(supplier.name ?? rows[0]?.supplier_name ?? '')
      await sendEmail(to, `Upcoming HSH deliveries — ${supplierName || 'schedule'}`, renderHtml(supplierName, rows))

      await admin.from('supplier_schedule_digest_sends').upsert({
        supplier_id: supplierId,
        organization_id: rows[0]?.organization_id ?? null,
        last_signature: await signature(rows),
        last_sent_at: new Date().toISOString(),
      })

      return json({ success: true, to, itemCount: rows.length })
    }

    // ---- CRON: all suppliers, only-if-changed ----
    // Only the service role (the pg_cron job) may trigger the org-wide run.
    if (authHeader !== `Bearer ${SERVICE_ROLE_KEY}`) {
      return json({ error: 'Forbidden' }, 403)
    }
    // Send once per day, in the 8am NY hour (cron fires at 12:00 & 13:00 UTC).
    if (!isEightAmNY()) return json({ success: true, skipped: 'outside 8am NY hour' })

    // Group rows by supplier.
    const bySupplier = new Map<string, Row[]>()
    for (const r of allRows) {
      const arr = bySupplier.get(r.supplier_id)
      if (arr) arr.push(r)
      else bySupplier.set(r.supplier_id, [r])
    }

    const { data: sends } = await admin
      .from('supplier_schedule_digest_sends')
      .select('supplier_id, last_signature')
    const lastSig = new Map<string, string>(
      (sends ?? []).map((s: { supplier_id: string; last_signature: string | null }) => [
        s.supplier_id,
        s.last_signature ?? '',
      ]),
    )

    let sent = 0
    let skippedUnchanged = 0
    let noEmail = 0
    for (const [sid, rows] of bySupplier) {
      const to = String(rows[0]?.supplier_email ?? '').trim()
      if (!to) {
        noEmail++
        continue
      }
      const sig = await signature(rows)
      if (lastSig.get(sid) === sig) {
        skippedUnchanged++
        continue
      }
      const supplierName = String(rows[0]?.supplier_name ?? '')
      try {
        await sendEmail(
          to,
          `Upcoming HSH deliveries — ${supplierName || 'schedule'}`,
          renderHtml(supplierName, rows),
        )
        await admin.from('supplier_schedule_digest_sends').upsert({
          supplier_id: sid,
          organization_id: rows[0]?.organization_id ?? null,
          last_signature: sig,
          last_sent_at: new Date().toISOString(),
        })
        sent++
      } catch (e) {
        console.error(`digest failed for supplier ${sid}:`, e)
      }
    }

    return json({ success: true, sent, skippedUnchanged, noEmail, suppliers: bySupplier.size })
  } catch (error) {
    console.error('send-supplier-schedule-digest error', error)
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
