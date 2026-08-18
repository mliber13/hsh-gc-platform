// ============================================================================
// Standard schedule template — per-org storage on org_drywall_catalogs.
// Kept separate from drywallCatalogsService (that file is intentionally
// double-spaced on disk; touching it is error-prone). One column, own I/O.
// ============================================================================

import { supabase, isOnlineMode } from '@/lib/supabase'
import { requireUserOrgId } from '@/services/userService'
import {
  normalizeStandardScheduleTemplate,
  type StandardScheduleTemplate,
} from '@/lib/drywall/standardScheduleTemplate'

/** Returns the org's saved template, or null when unset (caller falls back to default). */
export async function fetchStandardScheduleTemplate(): Promise<StandardScheduleTemplate | null> {
  if (!isOnlineMode()) return null
  const organizationId = await requireUserOrgId()
  const { data, error } = await supabase
    .from('org_drywall_catalogs')
    .select('standard_schedule_template')
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) {
    console.error('fetchStandardScheduleTemplate:', error)
    return null
  }
  return normalizeStandardScheduleTemplate(data?.standard_schedule_template)
}

export async function saveStandardScheduleTemplate(
  steps: StandardScheduleTemplate,
): Promise<void> {
  if (!isOnlineMode()) {
    throw new Error('Saving the schedule template requires an online connection.')
  }
  const organizationId = await requireUserOrgId()
  // Upsert only this column; on conflict the other catalog columns are untouched.
  const { error } = await supabase.from('org_drywall_catalogs').upsert(
    {
      organization_id: organizationId,
      standard_schedule_template: steps,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' },
  )
  if (error) {
    console.error('saveStandardScheduleTemplate:', error)
    throw new Error(error.message || 'Failed to save the schedule template')
  }
}
