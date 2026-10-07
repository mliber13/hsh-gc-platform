/**
 * Inbound SMS webhook (Twilio → Supabase Edge).
 * Public endpoint; auth = X-Twilio-Signature (HMAC-SHA1). DB writes use service role.
 *
 * Optional secret `TWILIO_WEBHOOK_URL` — full URL exactly as configured in Twilio
 * (e.g. https://<ref>.supabase.co/functions/v1/receive-sms). If unset, uses Request.url
 * (must match Twilio or signature verification fails).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

async function verifyTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): Promise<boolean> {
  const sorted = Object.keys(params).sort()
  const data = url + sorted.map((k) => k + params[k]).join('')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  const bytes = new Uint8Array(sigBuf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  const computed = btoa(binary)
  return timingSafeEqualAscii(computed, signature)
}

/** Constant-time compare for base64 ASCII strings of equal length (Twilio sig length fixed). */
function timingSafeEqualAscii(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i)! ^ b.charCodeAt(i)!
  return out === 0
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.slice(-10)
}

const CONFIRM_RE =
  /^(y|yes|yep|yeah|ok|okay|k|confirmed|sure|👍|✅)$/iu
const DECLINE_RE =
  /^(n|no|nope|can't|cant|cannot|decline|declined|❌|🚫)$/iu

function parseBody(body: string): 'confirm' | 'decline' | 'ambiguous' {
  const trimmed = body.trim()
  if (CONFIRM_RE.test(trimmed)) return 'confirm'
  if (DECLINE_RE.test(trimmed)) return 'decline'
  return 'ambiguous'
}

/**
 * Tell the office about a text we could not attribute.
 *
 * Two paths below drop a real message: the sender matches no subcontractor, or the sub they
 * match has no schedule items. Both used to return 200 and warn into this function's own log,
 * which nobody reads — so a sub's "Y" vanished and the item sat on "Waiting on reply"
 * indefinitely. That happened on the first live test (2026-10-06) and was only found by
 * digging through these logs.
 *
 * Why an email and not a row: `communication_log_entries.project_id` is NOT NULL, and an
 * unmatched reply has no project by definition. Storing it properly needs a migration and a
 * queue UI; a loud failure is most of the value and needs neither.
 *
 * Silent when `UNMATCHED_SMS_ALERT_EMAIL` is unset — same behaviour as before, no surprise
 * for anyone who deploys this without configuring it. Never throws: a failed alert must not
 * change what Twilio is told.
 */
async function alertUnmatchedInbound(
  reason: string,
  from: string,
  body: string,
  detail: Record<string, unknown>,
): Promise<void> {
  try {
    const apiKey = Deno.env.get('RESEND_API_KEY')
    const to = Deno.env.get('UNMATCHED_SMS_ALERT_EMAIL')
    if (!apiKey || !to) return

    const fromEmail = Deno.env.get('FROM_EMAIL') || 'onboarding@resend.dev'
    const escape = (v: string) =>
      v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: `Unmatched text from ${from}`,
        html: [
          '<p>A text came in that could not be matched to a schedule item, so no confirmation was recorded.</p>',
          `<p><strong>From:</strong> ${escape(from)}<br/>`,
          `<strong>Message:</strong> ${escape(body || '(empty)')}<br/>`,
          `<strong>Why:</strong> ${escape(reason)}</p>`,
          `<pre style="font-size:12px;color:#555">${escape(JSON.stringify(detail, null, 2))}</pre>`,
          '<p>If this was a real reply, confirm the item by hand and check the number on the subcontractor record.</p>',
        ].join(''),
      }),
    })
  } catch (e) {
    console.error('alertUnmatchedInbound failed', e)
  }
}

function twilioSignatureUrl(req: Request): string {
  const fromEnv = Deno.env.get('TWILIO_WEBHOOK_URL')?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const u = new URL(req.url)
  const host = req.headers.get('x-forwarded-host') ?? u.host
  const proto = req.headers.get('x-forwarded-proto') ?? u.protocol.replace(':', '') ?? 'https'
  if (!u.host && host) {
    return `${proto}://${host}${u.pathname}`.replace(/\/$/, '')
  }
  return u.href.split('?')[0].replace(/\/$/, '')
}

function formDataToStringRecord(formData: FormData): Record<string, string> {
  const params: Record<string, string> = {}
  for (const [k, v] of formData.entries()) {
    if (typeof v === 'string') params[k] = v
  }
  return params
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!authToken || !supabaseUrl || !serviceKey) {
      console.error('receive-sms: missing TWILIO_AUTH_TOKEN, SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY')
      return new Response('', { status: 200 })
    }

    const formData = await req.formData()
    const params = formDataToStringRecord(formData)

    const signature = req.headers.get('X-Twilio-Signature') ?? ''
    const url = twilioSignatureUrl(req)
    const valid = await verifyTwilioSignature(authToken, signature, url, params)
    if (!valid) {
      console.warn('Invalid Twilio signature', { url, hasSig: !!signature })
      return new Response('Forbidden', { status: 403 })
    }

    const from = params.From ?? ''
    const body = params.Body ?? ''
    const messageSid = params.MessageSid ?? ''
    const numMedia = Math.max(0, parseInt(params.NumMedia ?? '0', 10) || 0)

    if (!from || !messageSid) {
      console.warn('Missing required fields', { from, messageSid })
      return new Response('', { status: 200 })
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const normalized = normalizePhone(from)
    if (normalized.length < 10) {
      console.warn('Phone too short', { from, normalized })
      return new Response('', { status: 200 })
    }

    const { data: subs, error: subErr } = await supabase
      .from('subcontractors')
      .select('id, name, organization_id, phone, updated_at')
      .not('phone', 'is', null)

    if (subErr) throw subErr

    const matches = (subs ?? []).filter((s) => normalizePhone(s.phone ?? '') === normalized)
    if (matches.length === 0) {
      console.warn('Unknown sender — no matching subcontractor', { from, normalized })
      // Each subcontractor carries ONE phone number, so a sub replying from a second
      // phone — the foreman's cell rather than the office line — lands here.
      await alertUnmatchedInbound(
        'No subcontractor has this phone number on file',
        from,
        body,
        { normalized_last10: normalized },
      )
      return new Response('', { status: 200 })
    }

    const sub = [...matches].sort((a, b) =>
      (b.updated_at ?? '').localeCompare(a.updated_at ?? ''),
    )[0]!

    const { data: pendingItems, error: pendingErr } = await supabase
      .from('schedule_items')
      .select('id, project_id, name, confirmation_status, confirmation_last_sent_at, updated_at')
      .eq('assigned_company_id', sub.id)
      .eq('confirmation_status', 'pending')
      .order('confirmation_last_sent_at', { ascending: false, nullsFirst: false })
      .limit(1)

    if (pendingErr) throw pendingErr

    let target = pendingItems?.[0] ?? null
    let targetIsPending = !!target
    if (!target) {
      const { data: anyItems, error: anyErr } = await supabase
        .from('schedule_items')
        .select('id, project_id, name, confirmation_status, updated_at')
        .eq('assigned_company_id', sub.id)
        .order('updated_at', { ascending: false })
        .limit(1)
      if (anyErr) throw anyErr
      target = anyItems?.[0] ?? null
    }

    if (!target) {
      console.warn('Sub has no schedule items', { sub_id: sub.id, sub_name: sub.name })
      await alertUnmatchedInbound(
        `${sub.name} has no schedule items to confirm`,
        from,
        body,
        { sub_id: sub.id, sub_name: sub.name },
      )
      return new Response('', { status: 200 })
    }

    const parseResult = parseBody(body)
    const displayBody =
      numMedia > 0 ? `[${numMedia} image(s)] ${body}`.trim() : body

    const metadata: Record<string, unknown> = {
      twilio_message_sid: messageSid,
      parsed: parseResult,
      from_phone: from,
      num_media: numMedia,
    }
    if (numMedia > 0) {
      metadata.media_urls = Array.from({ length: numMedia }, () => 'pending-ingest')
    }

    const { error: logErr } = await supabase.from('communication_log_entries').insert({
      organization_id: sub.organization_id,
      project_id: target.project_id,
      schedule_item_id: target.id,
      direction: 'inbound',
      channel: 'sms',
      author_user_id: null,
      author_company_id: sub.id,
      author_label: null,
      body: displayBody,
      attachments: [],
      metadata,
    })
    if (logErr) throw logErr

    if (targetIsPending && (parseResult === 'confirm' || parseResult === 'decline')) {
      const nextStatus = parseResult === 'confirm' ? 'confirmed' : 'declined'
      const { error: updateErr } = await supabase
        .from('schedule_items')
        .update({
          confirmation_status: nextStatus,
          confirmation_last_responded_at: new Date().toISOString(),
        })
        .eq('id', target.id)
      if (updateErr) console.error('Failed to update item status', updateErr)
    }

    return new Response('', {
      status: 200,
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
    })
  } catch (err) {
    console.error('receive-sms unexpected error', err)
    return new Response('', { status: 200 })
  }
})
