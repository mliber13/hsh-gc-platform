import type { CommsLogAuthorRole, DrywallCommsLogEntry } from '@/types/drywall'

export function normalizeCommsLogAuthorRole(
  value: unknown,
): CommsLogAuthorRole {
  if (value === 'crew' || value === 'sub' || value === 'operator') return value
  return 'operator'
}

export function normalizeCommsLogEntry(raw: unknown): DrywallCommsLogEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  if (typeof e.id !== 'string' || typeof e.at !== 'string' || typeof e.body !== 'string') {
    return null
  }
  return {
    id: e.id,
    at: e.at,
    author: typeof e.author === 'string' && e.author.trim() ? e.author.trim() : 'Unknown',
    authorUserId: typeof e.authorUserId === 'string' ? e.authorUserId : undefined,
    authorRole: normalizeCommsLogAuthorRole(e.authorRole),
    body: e.body,
  }
}

export function inferCommsAuthorRole(
  profile: {
    roles?: string[]
    linkedEmployeeId?: string | null
    linkedContractorId?: string | null
    linked_employee_id?: string | null
    linked_contractor_id?: string | null
  } | null
  | undefined,
  override?: CommsLogAuthorRole,
): CommsLogAuthorRole {
  if (override) return override
  if (profile?.roles?.includes('crew')) {
    const contractorId =
      profile.linkedContractorId ?? profile.linked_contractor_id ?? null
    if (contractorId) return 'sub'
    return 'crew'
  }
  return 'operator'
}
