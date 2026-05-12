import { supabase } from '@/lib/supabase'
import type {
  CommunicationLogEntry,
  CommLogAttachment,
  CommLogChannel,
  CommLogDirection,
} from '@/types/communicationLog'

export interface InboxEntry {
  id: string
  project_id: string
  project_name: string
  schedule_item_id: string | null
  schedule_item_name: string | null
  direction: 'inbound' | 'outbound' | 'system'
  channel: 'sms' | 'email' | 'in-app' | 'phone' | 'system'
  body: string
  author_label: string
  created_at: string
}

type InboxRow = {
  id: string
  project_id: string
  schedule_item_id: string | null
  direction: InboxEntry['direction']
  channel: InboxEntry['channel']
  body: string
  author_label: string | null
  created_at: string
  projects?: { name: string | null } | Array<{ name: string | null }> | null
  schedule_items?: { name: string | null } | Array<{ name: string | null }> | null
  profiles?: { full_name: string | null; email: string | null } | Array<{ full_name: string | null; email: string | null }> | null
  subcontractors?: { name: string | null } | Array<{ name: string | null }> | null
}

function joinedOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function resolveAuthorLabel(row: InboxRow): string {
  const company = joinedOne(row.subcontractors)
  if (company?.name) return company.name

  const profile = joinedOne(row.profiles)
  const userLabel = profile?.full_name || profile?.email
  if (userLabel) return userLabel

  return 'System'
}

function toCommunicationLogEntry(row: any): CommunicationLogEntry {
  return {
    id: row.id,
    organization_id: row.organization_id,
    project_id: row.project_id,
    schedule_item_id: row.schedule_item_id,
    direction: row.direction,
    channel: row.channel,
    author_user_id: row.author_user_id,
    author_company_id: row.author_company_id,
    author_label: row.author_label,
    body: row.body,
    attachments: (row.attachments ?? []) as CommLogAttachment[],
    metadata: row.metadata ?? null,
    created_at: row.created_at,
  }
}

export async function fetchCommsForProject(
  projectId: string,
): Promise<CommunicationLogEntry[]> {
  const { data, error } = await supabase
    .from('communication_log_entries')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(toCommunicationLogEntry)
}

export async function fetchCommsForScheduleItem(
  scheduleItemId: string,
): Promise<CommunicationLogEntry[]> {
  const { data, error } = await supabase
    .from('communication_log_entries')
    .select('*')
    .eq('schedule_item_id', scheduleItemId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(toCommunicationLogEntry)
}

export async function fetchRecentInboxEntries(
  sinceIso: string,
  limit = 50,
): Promise<InboxEntry[]> {
  const { data, error } = await supabase
    .from('communication_log_entries')
    .select(`
      id, project_id, schedule_item_id, direction, channel, body,
      author_user_id, author_company_id, author_label, created_at,
      projects:project_id(name),
      schedule_items:schedule_item_id(name),
      profiles:author_user_id(full_name,email),
      subcontractors:author_company_id(name)
    `)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error

  return ((data ?? []) as InboxRow[]).map((row) => ({
    id: row.id,
    project_id: row.project_id,
    project_name: joinedOne(row.projects)?.name ?? '(unknown project)',
    schedule_item_id: row.schedule_item_id,
    schedule_item_name: joinedOne(row.schedule_items)?.name ?? null,
    direction: row.direction,
    channel: row.channel,
    body: row.body,
    author_label: resolveAuthorLabel(row),
    created_at: row.created_at,
  }))
}

export interface CreateCommsEntryInput {
  organization_id: string
  project_id: string
  schedule_item_id?: string | null
  direction: CommLogDirection
  channel: CommLogChannel
  body: string
  author_user_id: string
  author_company_id?: string | null
  metadata?: Record<string, unknown> | null
}

export async function createCommsEntry(
  input: CreateCommsEntryInput,
): Promise<CommunicationLogEntry> {
  const { data, error } = await supabase
    .from('communication_log_entries')
    .insert({
      organization_id: input.organization_id,
      project_id: input.project_id,
      schedule_item_id: input.schedule_item_id ?? null,
      direction: input.direction,
      channel: input.channel,
      body: input.body,
      author_user_id: input.author_user_id,
      author_company_id: input.author_company_id ?? null,
      author_label: null,
      metadata: input.metadata ?? null,
    })
    .select('*')
    .single()

  if (error) throw error
  return toCommunicationLogEntry(data)
}
