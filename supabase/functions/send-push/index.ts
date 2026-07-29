import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import {
  createApplicationServer,
  sendToUsers,
  type PushPayload,
} from '../_shared/webpush.ts'

const pushCors = {
  ...corsHeaders,
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
}

type CommsBody = {
  kind: 'comms'
  projectId: string
  authorUserId: string
  projectName?: string
  authorName?: string
  preview?: string
}

type ScheduleBody = {
  kind: 'schedule'
  projectId: string
  authorUserId: string
  assignedPersonIds: string[]
  itemName?: string
  newDate?: string
}

type RequestBody = CommsBody | ScheduleBody

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...pushCors, 'Content-Type': 'application/json' },
  })
}

async function resolveCommsRecipients(
  admin: SupabaseClient,
  projectId: string,
  authorUserId: string,
): Promise<string[]> {
  const { data: project, error: projErr } = await admin
    .from('projects')
    .select('organization_id')
    .eq('id', projectId)
    .maybeSingle()
  if (projErr || !project?.organization_id) return []

  const orgId = project.organization_id as string

  const { data: profiles, error: profErr } = await admin
    .from('profiles')
    .select('id, roles, is_field_foreman, linked_employee_id, linked_contractor_id')
    .eq('organization_id', orgId)
  if (profErr || !profiles) return []

  const { data: scheduleRows } = await admin
    .from('schedule_items')
    .select('assigned_persons')
    .eq('project_id', projectId)
    .eq('organization_id', orgId)

  const assigned = new Set<string>()
  for (const row of scheduleRows ?? []) {
    for (const id of (row.assigned_persons as string[] | null) ?? []) {
      if (id) assigned.add(id)
    }
  }

  const operatorRoles = new Set(['owner', 'office_drywall', 'office_gc'])
  const userIds = new Set<string>()

  for (const p of profiles) {
    const roles = (p.roles as string[] | null) ?? []
    const isOperator = roles.some((r) => operatorRoles.has(r))
    const isForeman = Boolean(p.is_field_foreman)
    const personId = (p.linked_employee_id as string | null) || (p.linked_contractor_id as string | null)
    const isAssignedCrew = Boolean(personId && assigned.has(personId))
    if (isOperator || isForeman || isAssignedCrew) {
      userIds.add(p.id as string)
    }
  }

  userIds.delete(authorUserId)
  return [...userIds]
}

async function resolveScheduleRecipients(
  admin: SupabaseClient,
  assignedPersonIds: string[],
  authorUserId: string,
): Promise<string[]> {
  const unique = [...new Set(assignedPersonIds.filter(Boolean))]
  if (unique.length === 0) return []

  const [{ data: byEmp }, { data: byCon }] = await Promise.all([
    admin.from('profiles').select('id').in('linked_employee_id', unique),
    admin.from('profiles').select('id').in('linked_contractor_id', unique),
  ])

  const userIds = new Set<string>()
  for (const p of byEmp ?? []) userIds.add(p.id as string)
  for (const p of byCon ?? []) userIds.add(p.id as string)
  userIds.delete(authorUserId)
  return [...userIds]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: pushCors })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return jsonResponse({ error: 'Supabase env not configured' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'No authorization header' }, 401)

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !user) return jsonResponse({ error: 'Not authenticated' }, 401)

    const admin = createClient(supabaseUrl, serviceRoleKey)

    const body = (await req.json()) as RequestBody

    let appServer
    try {
      appServer = await createApplicationServer()
    } catch (e) {
      return jsonResponse(
        { error: e instanceof Error ? e.message : 'VAPID secrets not configured' },
        500,
      )
    }

    let userIds: string[] = []
    let payload: PushPayload

    if ('kind' in body && body.kind === 'comms') {
      userIds = await resolveCommsRecipients(admin, body.projectId, body.authorUserId)
      const name = body.projectName?.trim() || 'Project'
      const author = body.authorName?.trim() || 'Someone'
      const preview = (body.preview ?? '').trim().slice(0, 120)
      payload = {
        title: `${name} — new message`,
        body: preview ? `${author}: ${preview}` : `${author} posted a message`,
        url: `/drywall/projects/${body.projectId}/info`,
        tag: `comms-${body.projectId}`,
      }
    } else if ('kind' in body && body.kind === 'schedule') {
      userIds = await resolveScheduleRecipients(
        admin,
        body.assignedPersonIds ?? [],
        body.authorUserId,
      )
      const item = body.itemName?.trim() || 'Schedule item'
      const dateBit = body.newDate ? ` moved to ${body.newDate}` : ' updated'
      payload = {
        title: 'Schedule updated',
        body: `${item}${dateBit}`,
        url: `/crew/projects/${body.projectId}`,
        tag: `sched-${body.projectId}`,
      }
    } else {
      return jsonResponse({ error: 'Invalid send-push body' }, 400)
    }

    // Caller must be the author — basic anti-abuse.
    if (body.authorUserId !== user.id) {
      return jsonResponse({ error: 'authorUserId must match caller' }, 403)
    }

    const summary = await sendToUsers(admin, appServer, userIds, payload)
    return jsonResponse({ ok: true, recipients: userIds.length, ...summary })
  } catch (e) {
    console.error('send-push error:', e)
    return jsonResponse({ error: e instanceof Error ? e.message : 'send-push failed' }, 500)
  }
})
