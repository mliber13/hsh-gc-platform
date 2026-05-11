import { supabase } from '@/lib/supabase'
import type {
  CommunicationLogEntry,
  CommLogAttachment,
  CommLogChannel,
  CommLogDirection,
} from '@/types/communicationLog'

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
