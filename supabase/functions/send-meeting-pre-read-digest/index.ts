import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

type Lead = {
  id: string
  display_name: string
  area_label: string
  user_id: string
}

type RequestBody = {
  dry_run?: boolean
  force?: boolean
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function parseBody(req: Request): Promise<RequestBody> {
  const raw = await req.text()
  if (!raw.trim()) return {}
  return JSON.parse(raw) as RequestBody
}

function nyHour(): number {
  const nowNY = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
  })
  return parseInt(nowNY.split(',')[1].trim().split(':')[0], 10)
}

function sanitize(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function preReadHtml(displayName: string, areaLabel: string, preReadUrl: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="font-family: Arial, sans-serif; line-height: 1.5; color: #1f2937; margin: 0; padding: 24px; background: #f8fafc;">
    <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 24px;">
      <p style="margin: 0 0 12px;">Hi ${sanitize(displayName)},</p>
      <p style="margin: 0 0 16px;">It's Monday - please submit your pre-read for ${sanitize(areaLabel)} by end of day.</p>
      <p style="margin: 0 0 20px;">
        <a href="${preReadUrl}" style="display: inline-block; padding: 10px 14px; background: #0e79c9; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">
          Open pre-read
        </a>
      </p>
      <p style="margin: 0; color: #6b7280;">Thanks,<br>HSH GC Platform</p>
    </div>
  </body>
</html>`
}

async function sendResendEmail(params: {
  apiKey: string
  from: string
  to: string
  subject: string
  html: string
}): Promise<string> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Resend failed: ${response.status} ${text}`)
  }

  const result = await response.json()
  return result.id as string
}

async function getUserEmailMap(
  supabase: ReturnType<typeof createClient>,
  userIds: string[],
): Promise<Map<string, string>> {
  const target = new Set(userIds)
  const out = new Map<string, string>()
  let page = 1
  const perPage = 1000

  while (target.size > out.size) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    const users = data?.users ?? []

    for (const user of users) {
      if (user.id && user.email && target.has(user.id)) {
        out.set(user.id, user.email)
      }
    }

    if (users.length < perPage) break
    page += 1
  }

  return out
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }

  try {
    let body: RequestBody
    try {
      body = await parseBody(req)
    } catch {
      return jsonResponse({ error: 'Invalid JSON in request body' }, 400)
    }
    const dryRun = Boolean(body.dry_run)
    const force = Boolean(body.force)

    // Skip the run if we're not in the 8 AM NY hour. The cron fires daily at
    // 13:00 UTC, which lands on 8 AM EST or 9 AM EDT depending on DST.
    // Rather than running two cron rows or accepting hourly drift, the function
    // checks NY local time and exits early outside the 8 AM hour. Manual invokes
    // (and dry_run) bypass this check so testing isn't blocked by clock time.
    if (!dryRun && !force) {
      const hour = nyHour()
      if (hour !== 8) {
        return jsonResponse({ skipped: true, reason: `NY hour is ${hour}, expected 8` })
      }
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const fromEmail = Deno.env.get('FROM_EMAIL')
    const appBaseUrl = Deno.env.get('APP_BASE_URL')

    if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !fromEmail || !appBaseUrl) {
      return jsonResponse(
        { error: 'Missing required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, FROM_EMAIL, APP_BASE_URL' },
        500,
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const { data: weekOf, error: weekError } = await supabase.rpc('meeting_week_of')
    if (weekError || !weekOf) throw weekError ?? new Error('Could not resolve week_of')

    const { data: leads, error: leadsError } = await supabase
      .from('meeting_leads')
      .select('id, display_name, area_label, user_id')
      .eq('is_active', true)
      .not('user_id', 'is', null)
      .order('display_order', { ascending: true })

    if (leadsError) throw leadsError
    const activeLeads = (leads ?? []) as Lead[]

    const emailMap = await getUserEmailMap(
      supabase,
      activeLeads.map((lead) => lead.user_id),
    )

    const summary = {
      week_of: weekOf as string,
      sent: 0,
      skipped_already_sent: 0,
      skipped_no_items: 0,
      errors: [] as Array<{ lead: string; message: string }>,
      preview: [] as Array<{ lead: string; email: string; html: string }>,
    }

    for (const lead of activeLeads) {
      try {
        const email = emailMap.get(lead.user_id)
        if (!email) {
          summary.errors.push({ lead: lead.display_name, message: 'No auth.users email found' })
          continue
        }

        const { data: sendRecord, error: sendLookupError } = await supabase
          .from('meeting_digest_sends')
          .select('id')
          .eq('lead_id', lead.id)
          .eq('week_of', weekOf)
          .eq('digest_type', 'pre_read')
          .maybeSingle()

        if (sendLookupError) throw sendLookupError
        if (sendRecord) {
          summary.skipped_already_sent += 1
          continue
        }

        const html = preReadHtml(
          lead.display_name,
          lead.area_label,
          `${appBaseUrl.replace(/\/$/, '')}/pre-read`,
        )

        if (dryRun) {
          summary.preview.push({ lead: lead.display_name, email, html })
          continue
        }

        const messageId = await sendResendEmail({
          apiKey: resendApiKey,
          from: fromEmail,
          to: email,
          subject: `Pre-read for this week - ${lead.area_label}`,
          html,
        })

        const { error: insertError } = await supabase.from('meeting_digest_sends').insert({
          lead_id: lead.id,
          week_of: weekOf,
          digest_type: 'pre_read',
          resend_message_id: messageId,
        })
        if (insertError) throw insertError

        summary.sent += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('send-meeting-pre-read-digest lead error', {
          leadId: lead.id,
          leadName: lead.display_name,
          error: message,
        })
        summary.errors.push({ lead: lead.display_name, message })
      }
    }

    return jsonResponse(dryRun ? summary : { ...summary, preview: undefined })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('send-meeting-pre-read-digest fatal error', { error: message })
    return jsonResponse({ error: message }, 500)
  }
})
