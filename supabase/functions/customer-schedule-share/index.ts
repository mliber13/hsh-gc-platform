/**
 * Customer schedule share — public, no-login endpoint for a customer/GC-super.
 * The share token (keyed to their phone) is the capability; validated with the service role.
 *
 * Actions:
 *   list    → the customer's projects + curated schedule (name/dates/status only), read-only.
 *   request → a "request a change" lands as an inbound customer_messages row (same thread as SMS).
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

    const { data: link } = await admin
      .from('customer_share_links')
      .select('contact_phone, organization_id')
      .eq('token', token)
      .is('revoked_at', null)
      .maybeSingle()
    if (!link) return json({ error: 'This link is not valid.' }, 403)

    // ---- READ: curated schedule grouped by project ----
    if (action === 'list') {
      const { data, error } = await admin.rpc('customer_share_schedule', { p_token: token })
      if (error) return json({ error: error.message }, 500)
      const rows = (data ?? []) as Array<{
        contact_name: string | null
        project_id: string
        project_name: string | null
        item_id: string | null
        item_name: string | null
        start_date: string | null
        end_date: string | null
        status: string | null
        assigned_persons: string[] | null
        project_client: unknown
      }>

      // Resolve assigned-person ids → names from the org_team roster (one payload per org).
      const nameById = new Map<string, string>()
      const { data: team } = await admin
        .from('org_team')
        .select('payload')
        .eq('organization_id', link.organization_id)
        .maybeSingle()
      const payload = (team?.payload ?? {}) as Record<string, unknown>
      for (const key of ['employees', 'contractors1099']) {
        const list = payload[key]
        if (Array.isArray(list)) {
          for (const m of list as Array<Record<string, unknown>>) {
            if (m && typeof m.id === 'string' && typeof m.name === 'string') {
              nameById.set(m.id, m.name)
            }
          }
        }
      }

      let contactName: string | null = null
      let clientName: string | null = null
      const projects = new Map<
        string,
        {
          projectId: string
          projectName: string
          items: Array<{
            id: string
            name: string
            startDate: string | null
            endDate: string | null
            status: string | null
            assignees: string[]
          }>
        }
      >()
      for (const r of rows) {
        contactName = r.contact_name ?? contactName
        if (!clientName) {
          const c = formatClient(r.project_client)
          if (c) clientName = c
        }
        let proj = projects.get(r.project_id)
        if (!proj) {
          proj = { projectId: r.project_id, projectName: r.project_name ?? 'Project', items: [] }
          projects.set(r.project_id, proj)
        }
        if (r.item_id) {
          const assignees = (r.assigned_persons ?? [])
            .map((id) => nameById.get(id))
            .filter((n): n is string => Boolean(n))
          proj.items.push({
            id: r.item_id,
            name: r.item_name ?? '',
            startDate: r.start_date,
            endDate: r.end_date,
            status: r.status,
            assignees,
          })
        }
      }

      // Attach the full project conversation (all contacts, both directions) per project — a
      // superintendent taking over sees the history, same as the office. Companies never change
      // per project, so this stays within the customer's own org/jobs.
      const projectIds = [...projects.keys()]
      const { data: msgs } = projectIds.length
        ? await admin
            .from('customer_messages')
            .select('id, direction, body, project_id, created_at')
            .eq('organization_id', link.organization_id)
            .in('project_id', projectIds)
            .order('created_at', { ascending: true })
        : { data: [] }
      const msgsByProject = new Map<string, Array<Record<string, unknown>>>()
      for (const m of (msgs ?? []) as Array<Record<string, unknown>>) {
        const pid = m.project_id as string | null
        if (!pid) continue
        if (!msgsByProject.has(pid)) msgsByProject.set(pid, [])
        msgsByProject.get(pid)!.push({
          id: m.id,
          direction: m.direction,
          body: m.body,
          createdAt: m.created_at,
        })
      }

      const out = [...projects.values()].map((p) => ({
        ...p,
        messages: msgsByProject.get(p.projectId) ?? [],
      }))
      return json({ contactName, clientName, projects: out })
    }

    // ---- WRITE: a change request → inbound customer message ----
    if (action === 'request') {
      const projectId = String(body.project_id ?? '').trim()
      const message = String(body.message ?? '').trim()
      if (!message) return json({ error: 'Please enter your request.' }, 400)

      if (projectId) {
        const { data: contact } = await admin
          .from('customer_project_contacts')
          .select('id')
          .eq('organization_id', link.organization_id)
          .eq('project_id', projectId)
          .eq('contact_phone', link.contact_phone)
          .maybeSingle()
        if (!contact) return json({ error: 'Not authorized for this project' }, 403)
      }

      const { error: insErr } = await admin.from('customer_messages').insert({
        organization_id: link.organization_id,
        contact_phone: link.contact_phone,
        direction: 'inbound',
        body: message,
        project_id: projectId || null,
        status: 'via_link',
      })
      if (insErr) return json({ error: insErr.message }, 500)
      return json({ success: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    console.error('customer-schedule-share error', e)
    return json({ error: String(e) }, 500)
  }
})
