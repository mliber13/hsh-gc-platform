import { isOnlineMode, supabase } from '@/lib/supabase'

export type CommsFeedEntry = {
  projectId: string
  projectName: string
  entryId: string
  at: string
  author: string
  authorRole: string
  body: string
}

type Row = {
  project_id: string
  project_name: string | null
  entry_id: string | null
  at: string | null
  author: string | null
  author_role: string | null
  body: string | null
}

/** Recent comms across the caller's accessible projects (operators: all; others: assigned). */
export async function fetchRecentComms(limit = 100): Promise<CommsFeedEntry[]> {
  if (!isOnlineMode()) return []
  const { data, error } = await supabase.rpc('recent_comms_for_user', { p_limit: limit })
  if (error) {
    console.error('fetchRecentComms:', error)
    return []
  }
  return ((data ?? []) as Row[]).map((r) => ({
    projectId: r.project_id,
    projectName: r.project_name?.trim() || 'Project',
    entryId: r.entry_id ?? '',
    at: r.at ?? '',
    author: r.author?.trim() || 'Unknown',
    authorRole: r.author_role ?? 'operator',
    body: r.body ?? '',
  }))
}
