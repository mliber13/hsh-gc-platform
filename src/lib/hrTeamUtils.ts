// ============================================================================
// HR Team — payload normalization + IDs (no Supabase)
// ============================================================================

import type {
  Contractor1099,
  Employee,
  JobPosition,
  MemberStatus,
  OrgTeamPayload,
  PayType,
  SalaryHistoryEntry,
} from '@/types/hr'
import { EMPTY_ORG_TEAM_PAYLOAD } from '@/types/hr'

export function generateHrId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

export function isArchivedMember(person: { status?: string | null; active?: boolean }): boolean {
  return (
    person?.status === 'archived' ||
    person?.status === 'inactive' ||
    person?.active === false
  )
}

export function normalizeMemberStatus<T extends { status?: string | null; active?: boolean }>(
  person: T,
): T & { status: MemberStatus } {
  return {
    ...person,
    status: isArchivedMember(person) ? 'archived' : 'active',
  }
}

const DEFAULT_POSITION_NAMES = [
  'Foreman',
  'Finisher',
  'Hanger',
  'Apprentice',
  'Lead',
  'Carpenter',
  'Laborer',
  'Administrative',
]

export function defaultJobPositions(): JobPosition[] {
  return DEFAULT_POSITION_NAMES.map((name, i) => ({
    id: `pos-${i + 1}`,
    name,
  }))
}

function normalizePositions(raw: unknown): JobPosition[] {
  if (!Array.isArray(raw) || raw.length === 0) return defaultJobPositions()

  const out: JobPosition[] = []
  const seen = new Set<string>()

  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) {
      const name = item.trim()
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ id: generateHrId(), name })
      continue
    }
    if (item && typeof item === 'object') {
      const row = item as Record<string, unknown>
      const name = typeof row.name === 'string' ? row.name.trim() : ''
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      const id =
        typeof row.id === 'string' && row.id.trim() ? row.id.trim() : generateHrId()
      out.push({ id, name })
    }
  }

  return out.length > 0 ? out : defaultJobPositions()
}

function normalizePeople<T extends Employee | Contractor1099>(raw: unknown): T[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((p) => p && typeof p === 'object' && typeof (p as Employee).id === 'string')
    .map((p) => normalizeMemberStatus(p as T))
}

export function parseOrgTeamPayload(raw: unknown): OrgTeamPayload {
  const base =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}

  const contractorsRaw =
    base.contractors1099 ?? base.contractors ?? []

  return {
    employees: normalizePeople<Employee>(base.employees),
    contractors1099: normalizePeople<Contractor1099>(contractorsRaw),
    positions: normalizePositions(base.positions),
  }
}

export function dedupePositions(positions: JobPosition[]): JobPosition[] {
  const out: JobPosition[] = []
  const seen = new Set<string>()
  for (const p of positions) {
    const name = p.name?.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ id: p.id || generateHrId(), name })
  }
  return out
}

export function prepareOrgTeamPayload(payload: OrgTeamPayload): OrgTeamPayload {
  return {
    employees: payload.employees.map((e) => normalizeMemberStatus(e)),
    contractors1099: payload.contractors1099.map((c) => normalizeMemberStatus(c)),
    positions: dedupePositions(payload.positions),
  }
}

export function emptyOrgTeamPayload(): OrgTeamPayload {
  return {
    employees: [],
    contractors1099: [],
    positions: [...defaultJobPositions()],
  }
}

export function getPositionName(
  positions: JobPosition[],
  positionId?: string | null,
): string {
  if (!positionId) return '—'
  return positions.find((p) => p.id === positionId)?.name ?? '—'
}

export function payTypeLabel(payType?: string | null): string {
  if (payType === 'salary') return 'Salary'
  if (payType === 'piece') return 'Piece'
  return 'Hourly'
}

export function formatPayType(payType?: PayType | string | null): PayType {
  if (payType === 'salary' || payType === 'piece') return payType
  return 'hourly'
}

/**
 * The salary in effect for a pay period. Chooses the latest salaryHistory entry whose
 * effectiveDate <= the period's start date; if the period predates all history, uses the
 * earliest entry; if there's no history at all, falls back to the flat salaryAmount.
 */
export function resolveEffectiveSalary(
  person: { salaryAmount?: number | string | null; salaryHistory?: SalaryHistoryEntry[] | null },
  periodStartDate: string,
): number {
  const valid = (Array.isArray(person.salaryHistory) ? person.salaryHistory : [])
    .filter((h) => h && h.effectiveDate && Number.isFinite(Number(h.salaryAmount)))
    .sort((a, b) => String(a.effectiveDate).localeCompare(String(b.effectiveDate)))
  if (valid.length) {
    const applicable = valid.filter((h) => String(h.effectiveDate) <= String(periodStartDate))
    const chosen = applicable.length ? applicable[applicable.length - 1] : valid[0]
    return Number(chosen.salaryAmount) || 0
  }
  return Number(person.salaryAmount) || 0
}

export { EMPTY_ORG_TEAM_PAYLOAD }
