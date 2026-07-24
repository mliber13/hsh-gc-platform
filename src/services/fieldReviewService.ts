// ============================================================================
// Field-review notification — projects with a field takeoff submitted for review.
// Reads scalars via the drywall_pending_field_reviews RPC (no metadata shipped).
// ============================================================================

import { supabase, isOnlineMode } from '@/lib/supabase'

export interface PendingFieldReview {
  projectId: string
  projectName: string
  submittedAt: string | null
  measuredSqft: number | null
}

export async function fetchPendingFieldReviews(): Promise<PendingFieldReview[]> {
  if (!isOnlineMode()) return []
  const { data, error } = await supabase.rpc('drywall_pending_field_reviews')
  if (error) {
    console.error('fetchPendingFieldReviews:', error)
    return []
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    projectId: r.project_id as string,
    projectName: (r.project_name as string | null)?.trim() || 'Untitled',
    submittedAt: (r.submitted_at as string | null) ?? null,
    measuredSqft: r.measured_sqft == null ? null : Number(r.measured_sqft),
  }))
}
