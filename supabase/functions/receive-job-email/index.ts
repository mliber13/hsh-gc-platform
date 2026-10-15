/**
 * Inbound email → job documents (Resend webhook, event `email.received`).
 *
 * Mark, 2026-10-15: prints and POs arrive by email and were saved to Google Drive by hand.
 * Forwarding the email to the job's address (`<name>-<8 hex of project id>@files.hshdrywall.com`,
 * see src/lib/drywall/jobEmailAddress.ts) files its attachments on that job's Photos & Files.
 *
 * Public endpoint, no JWT — deploy with `--no-verify-jwt`. Auth is the Svix signature Resend
 * puts on every webhook (secret RESEND_INBOUND_WEBHOOK_SECRET, "whsec_…"). Writes use the
 * service role.
 *
 * Only forwards from an active OFFICE login of the org are filed (owner / office_gc /
 * office_drywall — the same people who can upload documents in the app). Anything else is
 * logged and dropped without a reply, so the address cannot be used to plant files or to
 * bounce mail at strangers. Failures the sender can act on (unknown job, nothing attached,
 * a file refused) get a short reply.
 *
 * Every email is written to inbound_email_log, which is also the guard against Resend's
 * retries filing the same attachments twice.
 *
 * Secrets: RESEND_RECEIVING_API_KEY (a FULL-access key — the app's RESEND_API_KEY is send-only,
 * and Resend refuses it on the receiving API with 401 restricted_api_key, 2026-10-15),
 * RESEND_API_KEY (replies), RESEND_INBOUND_WEBHOOK_SECRET, FROM_EMAIL (replies; optional).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const FILES_DOMAIN = 'files.hshdrywall.com'
const OFFICE_ROLES = new Set(['owner', 'office_gc', 'office_drywall'])
const BUCKET = 'project-documents'
const MAX_BYTES = 104_857_600 // the bucket's limit
// The bucket's MIME allowlist (src/lib/uploadLimits.ts).
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/zip',
  'application/x-zip-compressed',
  'text/plain',
  'text/csv',
])
const SIGNATURE_TOLERANCE_S = 5 * 60

// ---------------------------------------------------------------------------- signature

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

/** Svix scheme: HMAC-SHA256 over "id.timestamp.body", key = base64 secret after "whsec_". */
async function verifySvix(secret: string, headers: Headers, body: string): Promise<boolean> {
  const id = headers.get('svix-id')
  const ts = headers.get('svix-timestamp')
  const sigHeader = headers.get('svix-signature')
  if (!id || !ts || !sigHeader) return false
  const now = Math.floor(Date.now() / 1000)
  if (!/^\d+$/.test(ts) || Math.abs(now - Number(ts)) > SIGNATURE_TOLERANCE_S) return false

  const key = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(secret.replace(/^whsec_/, '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`))
  const expected = bytesToBase64(new Uint8Array(mac))
  return sigHeader
    .split(' ')
    .map((part) => part.split(','))
    .some(([version, sig]) => version === 'v1' && typeof sig === 'string' && timingSafeEqual(sig, expected))
}

// ---------------------------------------------------------------------------- parsing

/** "Mark Liber <Mark@hshdrywall.com>" → "mark@hshdrywall.com". */
function bareAddress(raw: unknown): string {
  const s = String(raw ?? '').trim()
  const m = s.match(/<([^>]+)>/)
  return (m ? m[1]! : s).trim().toLowerCase()
}

/** Mirror of parseJobEmailCode in src/lib/drywall/jobEmailAddress.ts. */
function jobCode(address: string): string | null {
  const m = address.match(/^([^@\s]+)@([^@\s]+)$/)
  if (!m || m[2] !== FILES_DOMAIN) return null
  const code = m[1]!.split('-').pop() ?? ''
  return /^[0-9a-f]{8}$/.test(code) ? code : null
}

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String)
  if (typeof v === 'string' && v) return [v]
  return []
}

/** Mirror of guessDrywallDocumentType in src/lib/drywall/jobDocuments.ts. */
function guessType(fileName: string, mime: string): string {
  const n = fileName.toLowerCase()
  if (/\bquote\b|\bestimate\b|\bbid\b/.test(n)) return 'quote'
  if (/\bp\.?o\b|purchase.?order/.test(n)) return 'purchase-order'
  if (/\binvoice\b/.test(n)) return 'invoice'
  if (/contract|agreement/.test(n)) return 'contract'
  if (/\bspec/.test(n)) return 'specification'
  if (mime === 'application/pdf' || n.endsWith('.pdf')) return 'plan'
  if (mime.startsWith('image/')) return 'photo'
  return 'other'
}

// ---------------------------------------------------------------------------- handler

type Attachment = {
  id: string
  filename?: string
  size?: number
  content_type?: string
  content_disposition?: string
  content_id?: string
  download_url?: string
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const webhookSecret = Deno.env.get('RESEND_INBOUND_WEBHOOK_SECRET')
  // Reading received mail needs full access; sending keeps its own restricted key.
  const receivingKey = Deno.env.get('RESEND_RECEIVING_API_KEY')
  const fromEmail = Deno.env.get('FROM_EMAIL')
  if (!supabaseUrl || !serviceKey || !resendKey || !webhookSecret || !receivingKey) {
    console.error('receive-job-email: missing secrets')
    return new Response('Not configured', { status: 500 })
  }

  const body = await req.text()
  if (!(await verifySvix(webhookSecret, req.headers, body))) {
    return new Response('Invalid signature', { status: 401 })
  }

  let event: { type?: string; data?: Record<string, unknown> }
  try {
    event = JSON.parse(body)
  } catch {
    return new Response('Bad JSON', { status: 400 })
  }
  if (event.type !== 'email.received' || !event.data) return new Response('Ignored', { status: 200 })

  const data = event.data
  const emailId = String(data.email_id ?? '')
  if (!emailId) return new Response('No email id', { status: 400 })

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // Resend retries a webhook it thinks failed. The log row is written once per email.
  const { data: seen } = await db.from('inbound_email_log').select('id').eq('resend_email_id', emailId).maybeSingle()
  if (seen) return new Response('Already handled', { status: 200 })

  const from = bareAddress(data.from)
  const subject = String(data.subject ?? '').slice(0, 500)
  const recipients = [
    ...new Set(
      [...asList(data.received_for), ...asList(data.to), ...asList(data.cc), ...asList(data.bcc)].map(bareAddress),
    ),
  ]
  const ourRecipients = recipients.filter((a) => a.endsWith(`@${FILES_DOMAIN}`))

  const log = async (row: {
    organization_id?: string | null
    project_id?: string | null
    status: string
    files_filed?: number
    detail?: string
  }) => {
    const { error } = await db.from('inbound_email_log').insert({
      resend_email_id: emailId,
      from_address: from,
      to_addresses: ourRecipients.length ? ourRecipients : recipients,
      subject,
      ...row,
    })
    if (error) console.error('receive-job-email: log insert failed', error.message)
  }

  const reply = async (text: string) => {
    if (!fromEmail) return
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: fromEmail,
        to: [from],
        subject: `Not filed: ${subject || '(no subject)'}`,
        text,
      }),
    })
    if (!res.ok) console.error('receive-job-email: reply failed', res.status, await res.text())
  }

  // 1. The sender must be an active office login. No reply otherwise.
  const { data: senders } = await db
    .from('profiles')
    .select('id, organization_id, role, roles, is_active')
    // ilike for case; escape its wildcards — an underscore in an address must match itself.
    .ilike('email', from.replace(/[%_\\]/g, (c) => `\\${c}`))
  const sender = (senders ?? []).find((p) => {
    const roles: string[] = Array.isArray(p.roles) && p.roles.length ? p.roles : [p.role]
    return p.is_active !== false && p.organization_id && roles.some((r) => OFFICE_ROLES.has(r))
  })
  if (!sender) {
    await log({ status: 'unknown_sender', detail: `No active office login uses ${from}` })
    return new Response('OK', { status: 200 })
  }
  const orgId: string = sender.organization_id

  // 2. The job, from the address it was forwarded to.
  let project: { id: string; name: string } | null = null
  for (const address of ourRecipients) {
    const code = jobCode(address)
    if (!code) continue
    const { data: matches } = await db
      .from('projects')
      .select('id, name')
      .eq('organization_id', orgId)
      .gte('id', `${code}-0000-0000-0000-000000000000`)
      .lte('id', `${code}-ffff-ffff-ffff-ffffffffffff`)
      .limit(2)
    if (matches && matches.length === 1) {
      project = matches[0]!
      break
    }
  }
  if (!project) {
    await log({ organization_id: orgId, status: 'unknown_job', detail: `No job for ${ourRecipients.join(', ') || 'these recipients'}` })
    await reply(
      `This email was not filed: the address it was sent to (${ourRecipients.join(', ') || 'none at ' + FILES_DOMAIN}) does not belong to a job.\n\n` +
        `Copy the job's address from its Photos & Files tab in the app and forward the email again.`,
    )
    return new Response('OK', { status: 200 })
  }

  // 3. The attachments. The webhook carries metadata only; the list call gives download URLs.
  const listRes = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}/attachments`, {
    headers: { Authorization: `Bearer ${receivingKey}` },
  })
  if (!listRes.ok) {
    const detail = `Attachment list failed: ${listRes.status} ${(await listRes.text()).slice(0, 300)}`
    await log({ organization_id: orgId, project_id: project.id, status: 'failed', detail })
    await reply(`This email was not filed on ${project.name}: the attachments could not be read. Forward it again, or upload the files from Photos & Files.`)
    return new Response('OK', { status: 200 })
  }
  const listed = ((await listRes.json())?.data ?? []) as Attachment[]

  // Signature logos and inline images are not documents.
  const files = listed.filter(
    (a) => !(a.content_disposition === 'inline' && String(a.content_type ?? '').startsWith('image/')),
  )
  if (files.length === 0) {
    await log({ organization_id: orgId, project_id: project.id, status: 'no_attachments' })
    await reply(
      `Nothing was filed on ${project.name}: the email had no attachments.\n\n` +
        `If the prints came as a link (Dropbox, Google Drive, WeTransfer), download them and upload from Photos & Files — links are not picked up yet.`,
    )
    return new Response('OK', { status: 200 })
  }

  let filed = 0
  const problems: string[] = []
  for (const att of files) {
    const name = (att.filename || 'attachment').slice(0, 200)
    const mime = String(att.content_type ?? 'application/octet-stream').toLowerCase()
    try {
      if (!ALLOWED_MIME.has(mime)) throw new Error(`file type ${mime} is not accepted`)
      if ((att.size ?? 0) > MAX_BYTES) throw new Error('larger than 100 MB')
      if (!att.download_url) throw new Error('no download link')

      const fileRes = await fetch(att.download_url)
      if (!fileRes.ok) throw new Error(`download failed (${fileRes.status})`)
      const bytes = new Uint8Array(await fileRes.arrayBuffer())
      if (bytes.byteLength > MAX_BYTES) throw new Error('larger than 100 MB')

      const path = `${orgId}/${project.id}/${Date.now()}-${name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false })
      if (up.error) throw new Error(`storage: ${up.error.message}`)

      const signed = await db.storage.from(BUCKET).createSignedUrl(path, 31_536_000)
      if (signed.error || !signed.data?.signedUrl) {
        await db.storage.from(BUCKET).remove([path])
        throw new Error('could not sign the stored file')
      }

      const ins = await db.from('project_documents').insert({
        project_id: project.id,
        organization_id: orgId,
        name,
        type: guessType(name, mime),
        file_url: signed.data.signedUrl,
        file_path: path,
        file_size: bytes.byteLength,
        mime_type: mime,
        category: 'Email',
        description: `Forwarded by ${from}${subject ? `: "${subject}"` : ''}`,
        uploaded_by: sender.id,
      })
      if (ins.error) {
        await db.storage.from(BUCKET).remove([path])
        throw new Error(`database: ${ins.error.message}`)
      }
      filed++
    } catch (e) {
      problems.push(`${name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const status = problems.length === 0 ? 'filed' : filed > 0 ? 'partly_filed' : 'failed'
  await log({
    organization_id: orgId,
    project_id: project.id,
    status,
    files_filed: filed,
    detail: problems.length ? problems.join('; ').slice(0, 2000) : undefined,
  })
  if (problems.length) {
    await reply(
      `${filed} of ${files.length} file(s) were filed on ${project.name}. These were not:\n\n` +
        problems.map((p) => `• ${p}`).join('\n') +
        `\n\nUpload them from the job's Photos & Files tab.`,
    )
  }
  return new Response('OK', { status: 200 })
})
