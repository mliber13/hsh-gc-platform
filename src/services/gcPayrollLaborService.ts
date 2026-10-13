/**
 * GC job labor from payroll.
 *
 * Decided 2026-10-13 (docs/briefs/GC_LABOR_SOURCE_DECISION.md): payroll is GC's labor source.
 * Lines whose division resolves to GC (payrollLaborDivision — a tag, or the person's division
 * on a shared job) are read live from pay_periods, the same way drywall cost reads its half.
 * They are not copied into labor_entries: a copy is a second ledger, which is how the QBO
 * labor import went stale. Drywall's call to extractAllProjectLaborEntries takes the drywall
 * half of the same lines, so a payroll dollar lands on exactly one side.
 *
 * labor_entries (the QBO import) stays as history from before payroll ran in the app; rows that
 * duplicate a payroll line are flagged superseded_at and excluded by the actuals readers.
 *
 * Burden: 25% on W2, none on 1099 — the same applyW2LaborBurden drywall uses (Mark).
 *
 * Read-only: these entries have ids starting `payroll:` and are changed in the payroll editor,
 * never in GC actuals.
 */
import { isOnlineMode } from '@/lib/supabase'
import { deriveEffectiveRole, isOwnerRole } from '@/lib/rbac'
import {
  applyW2LaborBurden,
  extractAllProjectLaborEntries,
  type DrywallProjectLaborEntryFlat,
} from '@/lib/drywall/projectLaborMath'
import { fetchOrgDrywallCatalogs } from '@/services/drywallCatalogsService'
import {
  buildPayrollProfileRatesForLabor,
  fetchLaborDivisionContext,
  fetchPayPeriodsForDrywallLabor,
} from '@/services/drywallLaborService'
import { getCurrentUserProfile } from '@/services/userService'
import type { LaborEntry } from '@/types'

export const PAYROLL_LABOR_ID_PREFIX = 'payroll:'

export function isPayrollLaborEntryId(id: unknown): boolean {
  return typeof id === 'string' && id.startsWith(PAYROLL_LABOR_ID_PREFIX)
}

export interface GcPayrollLabor {
  byProject: Map<string, LaborEntry[]>
  /**
   * False when this user cannot read payroll. RLS then returns no pay periods rather than an
   * error, so without this flag GC labor would read short with nothing on screen to say so.
   */
  visible: boolean
}

function toLaborEntry(e: DrywallProjectLaborEntryFlat, projectId: string): LaborEntry {
  const { burdened, burdenAdded } = applyW2LaborBurden(e.amount, e.personType)
  // Local noon, so the week does not slide a day in a negative-offset zone.
  const date = new Date(`${e.periodStart}T12:00:00`)
  const hours = e.source === 'hour' ? Number(e.hours) || 0 : 0
  const what = e.source === 'hour' ? `${hours} h` : 'piece pay'
  return {
    id: `${PAYROLL_LABOR_ID_PREFIX}${e.payPeriodId}:${e.personType}-${e.personId}:${e.source}:${e.entryIndex}`,
    projectId,
    date,
    crew: [],
    trade: 'other',
    description: `Payroll · ${e.personName ?? 'Unknown'} · ${what} · week of ${e.periodStart}`,
    totalHours: hours,
    laborRate: hours > 0 ? e.amount / hours : 0,
    totalCost: burdened,
    grossWages: e.amount,
    burdenAmount: burdenAdded,
    createdAt: date,
  } as LaborEntry
}

async function currentUserCanReadPayroll(): Promise<boolean> {
  const profile = await getCurrentUserProfile()
  if (!profile) return false
  return isOwnerRole(deriveEffectiveRole(profile)) || Boolean(profile.can_run_payroll ?? profile.canRunPayroll)
}

/** GC payroll labor for the given projects, or for every project when omitted. */
export async function fetchGcPayrollLabor(projectIds?: string[]): Promise<GcPayrollLabor> {
  const byProject = new Map<string, LaborEntry[]>()
  if (!isOnlineMode()) return { byProject, visible: true }
  if (!(await currentUserCanReadPayroll())) return { byProject, visible: false }

  // No .catch on rates or division: zero rates or "everything is drywall" on a failed read
  // would quietly under-count GC labor.
  const [periods, catalogs, profileRates, division] = await Promise.all([
    fetchPayPeriodsForDrywallLabor(),
    fetchOrgDrywallCatalogs().catch(() => null),
    buildPayrollProfileRatesForLabor(),
    fetchLaborDivisionContext(),
  ])
  const wanted = projectIds ? new Set(projectIds) : null
  const flat = extractAllProjectLaborEntries(periods, catalogs, profileRates, new Map(), division, 'gc')
  for (const [projectId, entries] of flat) {
    if (wanted && !wanted.has(projectId)) continue
    byProject.set(
      projectId,
      entries.map((e) => toLaborEntry(e, projectId)).sort((a, b) => b.date.getTime() - a.date.getTime()),
    )
  }
  return { byProject, visible: true }
}
