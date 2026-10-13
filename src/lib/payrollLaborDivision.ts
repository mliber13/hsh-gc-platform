/**
 * Which division a payroll hour or piece line is labor for: drywall or the GC.
 *
 * One payroll run pays everyone, and a line only says which JOB it was for. On a job both
 * divisions work — a GC-type project the drywall side also quotes, like Goodwill Multi-1 —
 * the job alone cannot say whose labor it was, so every line on it was counted as drywall
 * cost. On 2026-10-13 that put Rich Petrock's and Yuri Garcia's carpentry and Jose
 * Dominquez's February–March work (all GC, per Mark) into Goodwill's drywall Financials.
 *
 * The rule, in order:
 *   1. A line tagged `division` says so — the payroll editor sets it on shared jobs.
 *   2. A line on a drywall-type project (or a project we cannot find) is drywall labor, as
 *      it always was. Only a GC-type project can carry GC labor.
 *   3. Otherwise the person's division for that pay period decides: HSH Contractor is GC.
 *      Dated from their allocation history, so Rich reads as drywall before 2026-08-04.
 *
 * Project type, not visibility, marks a shared job — the same signal QuickBooks material
 * auto-accept uses (autoAcceptsQbMaterial): ~115 drywall-created projects carry gc:true.
 */
import { resolveEffectiveDivisionAllocations } from '@/lib/hrTeamUtils'
import type { DivisionAllocation, DivisionAllocationHistoryEntry } from '@/types/hr'

export type LaborDivision = 'drywall' | 'gc'

export const LABOR_DIVISION_LABELS: Record<LaborDivision, string> = {
  drywall: 'Drywall',
  gc: 'GC',
}

/** The HR division code whose labor is GC labor. */
const GC_DIVISION_CODE = 'hsh_contractor'

export function isLaborDivision(value: unknown): value is LaborDivision {
  return value === 'drywall' || value === 'gc'
}

/**
 * The division a person's split leans to. Ties and empty splits read as drywall — the
 * division whose cost this was always counted in — so nothing moves without a reason.
 */
export function laborDivisionFromAllocations(allocations: DivisionAllocation[]): LaborDivision {
  let gc = 0
  let other = 0
  for (const a of allocations) {
    const pct = Number(a.pct) || 0
    if (a.division === GC_DIVISION_CODE) gc += pct
    else other += pct
  }
  return gc > other ? 'gc' : 'drywall'
}

export function personLaborDivisionAt(
  person: {
    divisionAllocations?: DivisionAllocation[]
    divisionAllocationHistory?: DivisionAllocationHistoryEntry[] | null
  },
  periodStart: string,
): LaborDivision {
  return laborDivisionFromAllocations(resolveEffectiveDivisionAllocations(person, periodStart))
}

/** A project whose payroll lines can belong to either division. */
export function isSharedLaborProjectType(type: string | null | undefined): boolean {
  return type !== 'drywall'
}

export interface LaborDivisionContext {
  /** Project type by id, for every project in the org. */
  projectTypeById: ReadonlyMap<string, string | null>
  /** The person's division for a pay period. Keyed by payrollMath `personKey`. */
  personDivisionAt: (personKey: string, periodStart: string) => LaborDivision
}

/** No shared projects: every untagged line is drywall. A line tagged GC is still GC. */
export const ALL_DRYWALL_LABOR: LaborDivisionContext = {
  projectTypeById: new Map(),
  personDivisionAt: () => 'drywall',
}

/** The division a line defaults to before anyone tags it. */
export function defaultLaborLineDivision(
  jobId: string | undefined,
  personKey: string,
  periodStart: string,
  ctx: LaborDivisionContext,
): LaborDivision {
  const id = String(jobId ?? '').trim()
  if (!id || !ctx.projectTypeById.has(id)) return 'drywall'
  if (!isSharedLaborProjectType(ctx.projectTypeById.get(id))) return 'drywall'
  return ctx.personDivisionAt(personKey, periodStart)
}

export function laborLineDivision(
  line: { jobId?: string; division?: unknown },
  personKey: string,
  periodStart: string,
  ctx: LaborDivisionContext,
): LaborDivision {
  if (isLaborDivision(line.division)) return line.division
  return defaultLaborLineDivision(line.jobId, personKey, periodStart, ctx)
}

/** Build the context from the HR roster and the org's project types. */
export function buildLaborDivisionContext(
  team: {
    employees: { id: string; divisionAllocations?: DivisionAllocation[]; divisionAllocationHistory?: DivisionAllocationHistoryEntry[] | null }[]
    contractors1099: { id: string; divisionAllocations?: DivisionAllocation[]; divisionAllocationHistory?: DivisionAllocationHistoryEntry[] | null }[]
  },
  projects: { id: string; type?: string | null }[],
  personKeyOf: (personId: string, personType: string) => string,
): LaborDivisionContext {
  const members = new Map<string, (typeof team.employees)[number]>()
  for (const e of team.employees) members.set(personKeyOf(e.id, 'w2'), e)
  for (const c of team.contractors1099) members.set(personKeyOf(c.id, '1099'), c)
  return {
    projectTypeById: new Map(projects.map((p) => [p.id, p.type ?? null])),
    personDivisionAt: (pk, periodStart) => {
      const member = members.get(pk)
      return member ? personLaborDivisionAt(member, periodStart) : 'drywall'
    },
  }
}
