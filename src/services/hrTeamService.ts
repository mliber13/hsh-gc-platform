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

// ----------------------------------------------------------------------------
// Read cache
// ----------------------------------------------------------------------------
//
// Seventeen places call `fetchTeam`, and some screens call it more than once per render pass
// — the schedule item dialog renders two assignee pickers, and before this each open read the
// whole org_team payload twice. The roster changes a few times a month, so re-reading it per
// component is pure latency.
//
// Two separate jobs here:
//  - `inFlight` collapses concurrent callers onto ONE request, which is what fixes two
//    pickers mounting together. A TTL alone would not: both start before either finishes.
//  - `cached` serves repeat reads for TTL_MS afterwards, so moving between screens is free.
//
// `saveTeam` clears both, and it is the only writer in the app (`hrTimeService` only reads
// this table), so an edit on the Team page is visible immediately rather than up to a minute
// later. Keyed by organization id so a cached roster can never leak across orgs.

const TEAM_CACHE_TTL_MS = 60_000

let cached: { organizationId: string; payload: OrgTeamPayload; at: number } | null = null
let inFlight: { organizationId: string; promise: Promise<OrgTeamPayload> } | null = null

/**
 * Drop the cached roster. Called by `saveTeam`; exported for anything that changes team data
 * by another route (a script, an RPC) and needs the app to re-read.
 */
export function invalidateTeamCache(): void {
  cached = null
  inFlight = null
}

async function readTeam(organizationId: string): Promise<OrgTeamPayload> {
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

export async function fetchTeam(): Promise<OrgTeamPayload> {
  if (!isOnlineMode()) {
    throw new Error('Team data requires an online connection to Supabase.')
  }

  const organizationId = await requireUserOrgId()

  if (
    cached &&
    cached.organizationId === organizationId &&
    Date.now() - cached.at < TEAM_CACHE_TTL_MS
  ) {
    return cached.payload
  }

  if (inFlight && inFlight.organizationId === organizationId) {
    return inFlight.promise
  }

  const promise = readTeam(organizationId)
    .then((payload) => {
      cached = { organizationId, payload, at: Date.now() }
      return payload
    })
    .finally(() => {
      // Cleared whether it resolved or threw, so a failed read is never cached as in-flight.
      if (inFlight?.promise === promise) inFlight = null
    })

  inFlight = { organizationId, promise }
  return promise
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

  // After the write, not before: a failed save must not drop a still-correct cache.
  invalidateTeamCache()
}
