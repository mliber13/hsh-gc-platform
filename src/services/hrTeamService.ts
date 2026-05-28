// ============================================================================
// HR Team service — org_team JSONB blob (replace-all upsert)
// ============================================================================

import { supabase, isOnlineMode } from '@/lib/supabase'
import type { OrgTeamPayload } from '@/types/hr'
import { parseOrgTeamPayload, prepareOrgTeamPayload } from '@/lib/hrTeamUtils'
import { requireUserOrgId } from './userService'

export class HrTeamPermissionError extends Error {
  constructor(message = 'You do not have permission to update the team roster.') {
    super(message)
    this.name = 'HrTeamPermissionError'
  }
}

function isRlsOrPermissionError(error: { code?: string; message?: string }): boolean {
  const code = error.code ?? ''
  const msg = (error.message ?? '').toLowerCase()
  return (
    code === '42501' ||
    code === 'PGRST301' ||
    msg.includes('permission') ||
    msg.includes('row-level security') ||
    msg.includes('violates row-level')
  )
}

export async function fetchTeam(): Promise<OrgTeamPayload> {
  if (!isOnlineMode()) {
    throw new Error('Team data requires an online connection to Supabase.')
  }

  const organizationId = await requireUserOrgId()

  const { data, error } = await supabase
    .from('org_team')
    .select('payload')
    .eq('organization_id', organizationId)
    .maybeSingle()

  if (error) {
    console.error('fetchTeam:', error)
    throw new Error(error.message || 'Failed to load team')
  }

  if (!data?.payload) {
    return parseOrgTeamPayload({ employees: [], contractors1099: [], positions: [] })
  }

  return parseOrgTeamPayload(data.payload)
}

export async function saveTeam(payload: OrgTeamPayload): Promise<void> {
  if (!isOnlineMode()) {
    throw new Error('Team data requires an online connection to Supabase.')
  }

  const organizationId = await requireUserOrgId()
  const prepared = prepareOrgTeamPayload(payload)
  const now = new Date().toISOString()

  const row = {
    organization_id: organizationId,
    payload: {
      employees: prepared.employees,
      contractors1099: prepared.contractors1099,
      positions: prepared.positions,
    },
    updated_at: now,
  }

  const { error } = await supabase.from('org_team').upsert(row, {
    onConflict: 'organization_id',
  })

  if (error) {
    console.error('saveTeam:', error)
    if (isRlsOrPermissionError(error)) {
      throw new HrTeamPermissionError()
    }
    throw new Error(error.message || 'Failed to save team')
  }
}
