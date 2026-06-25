// ============================================================================
// Crew invite tokens — D.6.1 operator provisioning + public signup validation
// ============================================================================

import { supabase, isOnlineMode } from '@/lib/supabase'
import type { CrewInviteToken } from '@/types/crew'
import { requireUserOrgId } from './userService'

const DEFAULT_TTL_HOURS = 168

function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function mapInviteRow(row: Record<string, unknown>): CrewInviteToken {
  return {
    id: String(row.id),
    token: String(row.token),
    linkedEmployeeId:
      typeof row.linked_employee_id === 'string' ? row.linked_employee_id : null,
    linkedContractorId:
      typeof row.linked_contractor_id === 'string' ? row.linked_contractor_id : null,
    invitedEmail: typeof row.invited_email === 'string' ? row.invited_email : null,
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    consumedAt: typeof row.consumed_at === 'string' ? row.consumed_at : null,
  }
}

function isInviteActive(invite: CrewInviteToken, now = Date.now()): boolean {
  if (invite.consumedAt) return false
  return new Date(invite.expiresAt).getTime() > now
}

export async function generateCrewInviteToken(args: {
  linkedEmployeeId?: string
  linkedContractorId?: string
  invitedEmail?: string
  ttlHours?: number
}): Promise<CrewInviteToken> {
  if (!isOnlineMode()) {
    throw new Error('Crew invites require an online connection.')
  }

  const hasEmployee = Boolean(args.linkedEmployeeId)
  const hasContractor = Boolean(args.linkedContractorId)
  if (hasEmployee === hasContractor) {
    throw new Error('Provide exactly one of linkedEmployeeId or linkedContractorId.')
  }

  const organizationId = await requireUserOrgId()
  const ttlHours = args.ttlHours ?? DEFAULT_TTL_HOURS
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString()
  const token = generateToken()

  const { data: userData } = await supabase.auth.getUser()
  const createdBy = userData.user?.id ?? null

  const { data, error } = await supabase
    .from('crew_invite_tokens')
    .insert({
      token,
      organization_id: organizationId,
      linked_employee_id: args.linkedEmployeeId ?? null,
      linked_contractor_id: args.linkedContractorId ?? null,
      invited_email: args.invitedEmail?.trim() || null,
      created_by: createdBy,
      expires_at: expiresAt,
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message || 'Failed to create crew invite')
  return mapInviteRow(data as Record<string, unknown>)
}

export async function fetchCrewInvitesForOrg(): Promise<CrewInviteToken[]> {
  if (!isOnlineMode()) return []

  const organizationId = await requireUserOrgId()
  const nowIso = new Date().toISOString()

  const { data, error } = await supabase
    .from('crew_invite_tokens')
    .select('*')
    .eq('organization_id', organizationId)
    .is('consumed_at', null)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || 'Failed to load crew invites')
  return (data ?? []).map((row) => mapInviteRow(row as Record<string, unknown>))
}

export async function revokeCrewInviteToken(tokenId: string): Promise<void> {
  if (!isOnlineMode()) {
    throw new Error('Crew invites require an online connection.')
  }

  const { error } = await supabase
    .from('crew_invite_tokens')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', tokenId)
    .is('consumed_at', null)

  if (error) throw new Error(error.message || 'Failed to revoke crew invite')
}

export async function fetchCrewInviteByToken(token: string): Promise<CrewInviteToken | null> {
  if (!token.trim() || !isOnlineMode()) return null

  const { data, error } = await supabase
    .from('crew_invite_tokens')
    .select('*')
    .eq('token', token.trim())
    .maybeSingle()

  if (error) {
    console.error('fetchCrewInviteByToken:', error)
    return null
  }

  if (!data) return null
  const invite = mapInviteRow(data as Record<string, unknown>)
  return isInviteActive(invite) ? invite : null
}

export async function consumeCrewInviteToken(
  token: string,
  signupResult: { userId: string },
): Promise<void> {
  if (!isOnlineMode()) {
    throw new Error('Crew signup requires an online connection.')
  }

  const { error } = await supabase.rpc('consume_crew_invite_token', {
    p_token: token.trim(),
    p_user_id: signupResult.userId,
  })

  if (error) throw new Error(error.message || 'Failed to complete crew signup')
}

export function buildCrewSignupUrl(token: string): string {
  return `${window.location.origin}/crew-signup?token=${encodeURIComponent(token)}`
}
