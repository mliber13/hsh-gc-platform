// ============================================================================
// Drywall project labor — Supabase read layer (D.1.3)
// ============================================================================

import { isOnlineMode } from '@/lib/supabase'
import {
  extractProjectLaborEntries,
  summarizeProjectLabor,
  splitLaborByProductionWindow,
  type DrywallProjectLaborSummary,
  type PayPeriodForLabor,
  type ProfileRatesByPersonKey,
} from '@/lib/drywall/projectLaborMath'
import { personKey } from '@/lib/payrollMath'
import { fetchPayPeriods } from '@/services/hrPayrollService'
import { fetchTeam } from '@/services/hrTeamService'
import { fetchOrgDrywallCatalogs } from '@/services/drywallCatalogsService'
import {
  fetchDrywallProjectById,
  getProductionTimestampsFromLegacy,
} from '@/services/drywallProjectsService'
import { requireUserOrgId } from '@/services/userService'
import type { PayPeriod } from '@/types/payroll'

export type { DrywallProjectLaborSummary, PayPeriodForLabor } from '@/lib/drywall/projectLaborMath'

export type DrywallLaborWindow = 'all' | 'production' | 'after-production' | 'pre-production'

function mapPayPeriodForLabor(period: PayPeriod): PayPeriodForLabor {
  return {
    id: period.id,
    startDate: period.startDate,
    endDate: period.endDate,
    locked: Boolean(period.locked),
    completedAt: period.completedAt ?? null,
    entries: period.entries ?? [],
  }
}

function buildProfileRatesByPersonKey(): Promise<ProfileRatesByPersonKey> {
  return fetchTeam().then((team) => {
    const out: ProfileRatesByPersonKey = {}
    for (const emp of team.employees) {
      out[personKey(emp.id, 'w2')] = parseFloat(String(emp.hourlyRate)) || 0
    }
    for (const c of team.contractors1099) {
      out[personKey(c.id, '1099')] = parseFloat(String(c.hourlyRate)) || 0
    }
    return out
  })
}

export async function fetchPayPeriodsForDrywallLabor(): Promise<PayPeriodForLabor[]> {
  if (!isOnlineMode()) {
    throw new Error('Drywall labor summary requires an online connection to Supabase.')
  }

  await requireUserOrgId()
  const periods = await fetchPayPeriods()
  return periods
    .map(mapPayPeriodForLabor)
    .sort((a, b) => b.endDate.localeCompare(a.endDate))
}

export async function fetchDrywallProjectLaborSummary(
  projectId: string,
  options?: { window?: DrywallLaborWindow },
): Promise<DrywallProjectLaborSummary> {
  if (!isOnlineMode()) {
    throw new Error('Drywall labor summary requires an online connection to Supabase.')
  }

  await requireUserOrgId()

  const [periods, catalogs, profileRates] = await Promise.all([
    fetchPayPeriodsForDrywallLabor(),
    fetchOrgDrywallCatalogs().catch(() => null),
    buildProfileRatesByPersonKey().catch(() => ({} as ProfileRatesByPersonKey)),
  ])

  let entries = extractProjectLaborEntries(periods, projectId, catalogs, profileRates)

  const window = options?.window ?? 'all'
  if (window !== 'all') {
    const project = await fetchDrywallProjectById(projectId)
    const timestamps = getProductionTimestampsFromLegacy(project?.legacy ?? {})
    const split = splitLaborByProductionWindow(entries, timestamps)

    switch (window) {
      case 'pre-production':
        entries = split.preProduction
        break
      case 'production':
        entries = split.duringProduction
        break
      case 'after-production':
        entries = split.afterProduction
        break
      default:
        break
    }
  }

  return summarizeProjectLabor(entries)
}
