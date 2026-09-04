import { isOnlineMode, supabase } from '@/lib/supabase'
import { DrywallProjectPermissionError, isRlsOrPermissionError } from '@/services/drywallProjectsService'
import { requestPushNotify } from '@/services/pushService'

/**
 * Message lanes. Visibility is enforced by RLS on `project_comms`, not here —
 * this module only shapes the UI.
 *
 *  office        → office only (operators + field foreman). Internal notes.
 *  job           → everyone assigned to the project, plus office. Broadcasts.
 *  crew:<person> → a private lane between the office and one crew person.
 */
export type CommsAudience = 'office' | 'job' | 'crew'

export interface ProjectCommsMessage {
  id: string
  projectId: string
  at: string
  authorUserId: string | null
  authorPersonId: string | null
  author: string
  authorRole: 'operator' | 'crew' | 'sub'
  audience: CommsAudience
  audiencePersonId: string | null
  body: string
}

interface Row {
  id: string
  project_id: string
  created_at: string
  author_user_id: string | null
  author_person_id: string | null
  author_name: string | null
  author_role: string | null
  audience: string | null
  audience_person_id: string | null
  body: string | null
}

const SELECT_COLS =
  'id, project_id, created_at, author_user_id, author_person_id, author_name, author_role, audience, audience_person_id, body'

function mapRow(r: Row): ProjectCommsMessage {
  const role = r.author_role === 'crew' || r.author_role === 'sub' ? r.author_role : 'operator'
  const audience =
    r.audience === 'job' || r.audience === 'crew' ? (r.audience as CommsAudience) : 'office'
  return {
    id: r.id,
    projectId: r.project_id,
    at: r.created_at,
    authorUserId: r.author_user_id,
    authorPersonId: r.author_person_id,
    author: r.author_name?.trim() || 'Unknown',
    authorRole: role,
    audience,
    audiencePersonId: r.audience_person_id,
    body: r.body ?? '',
  }
}

/** Messages on a project the caller is allowed to see. RLS does the gating. */
export async function fetchProjectComms(projectId: string): Promise<ProjectCommsMessage[]> {
  if (!isOnlineMode()) return []
  const { data, error } = await supabase
    .from('project_comms')
    .select(SELECT_COLS)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) {
    if (isRlsOrPermissionError(error)) throw new DrywallProjectPermissionError()
    throw new Error(error.message || 'Failed to load messages')
  }
  return ((data ?? []) as Row[]).map(mapRow)
}

/**
 * Post a message. Author identity and role are derived server-side from the
 * session — the client cannot supply them.
 *
 * Crew callers always land in their own private lane; `audience` is ignored for
 * them. Office callers choose the lane and default to an internal note.
 */
export async function postProjectComms(opts: {
  projectId: string
  body: string
  audience?: CommsAudience
  audiencePersonId?: string | null
}): Promise<ProjectCommsMessage> {
  if (!isOnlineMode()) throw new Error('Messages require an online connection.')
  const trimmed = opts.body.trim()
  if (!trimmed) throw new Error('Message body is required')

  const { data, error } = await supabase.rpc('post_project_comms', {
    p_project_id: opts.projectId,
    p_body: trimmed,
    p_audience: opts.audience ?? null,
    p_audience_person_id: opts.audiencePersonId ?? null,
  })

  if (error) {
    if (isRlsOrPermissionError(error)) throw new DrywallProjectPermissionError()
    throw new Error(error.message || 'Failed to send message')
  }
  if (!data) throw new Error('Failed to send message')
  const message = mapRow(data as Row)

  // Best-effort push. The lane is passed through so the edge function can hold
  // the preview to the same audience RLS allows to read the message.
  if (message.authorUserId) {
    void requestPushNotify({
      kind: 'comms',
      projectId: message.projectId,
      authorUserId: message.authorUserId,
      authorName: message.author,
      preview: message.body,
      audience: message.audience,
      audiencePersonId: message.audiencePersonId,
    })
  }

  return message
}

/** Stable key identifying the lane a message belongs to. */
export function laneKeyOf(message: ProjectCommsMessage): string {
  if (message.audience === 'crew') return `crew:${message.audiencePersonId ?? 'unknown'}`
  return message.audience
}

export interface CommsLane {
  key: string
  audience: CommsAudience
  personId: string | null
  /** Display name for the lane: the crew person's name, or a fixed label. */
  label: string
  messages: ProjectCommsMessage[]
  lastAt: string | null
}

/**
 * Group messages into lanes for the office view: one lane per crew person who
 * has traffic, plus Job-wide and Office-only. `nameFor` resolves an org_team
 * person id to a display name.
 */
export function groupIntoLanes(
  messages: ProjectCommsMessage[],
  nameFor?: (personId: string) => string | undefined,
): CommsLane[] {
  const byKey = new Map<string, CommsLane>()

  for (const m of messages) {
    const key = laneKeyOf(m)
    let lane = byKey.get(key)
    if (!lane) {
      const personId = m.audience === 'crew' ? m.audiencePersonId : null
      lane = {
        key,
        audience: m.audience,
        personId,
        label:
          m.audience === 'job'
            ? 'Job-wide'
            : m.audience === 'office'
              ? 'Office only'
              : (personId ? nameFor?.(personId) : undefined) ??
                // Fall back to the name on the person's own messages.
                messages.find((x) => x.audiencePersonId === personId && x.authorRole !== 'operator')
                  ?.author ??
                'Crew member',
        messages: [],
        lastAt: null,
      }
      byKey.set(key, lane)
    }
    lane.messages.push(m)
    if (!lane.lastAt || m.at > lane.lastAt) lane.lastAt = m.at
  }

  const order: Record<CommsAudience, number> = { crew: 0, job: 1, office: 2 }
  return [...byKey.values()].sort((a, b) => {
    if (a.audience !== b.audience) return order[a.audience] - order[b.audience]
    return (b.lastAt ?? '').localeCompare(a.lastAt ?? '')
  })
}
