import { classifyLaborCategory } from '@/lib/drywall/projectLaborMath'
import { resolvePieceEntryKey } from '@/lib/drywall/payrollPieceKeys'
import { formatPayPeriodRange } from '@/components/hr/payroll/payrollFormat'
import { isOnlineMode } from '@/lib/supabase'
import { recalcPieceEntryAmount } from '@/lib/payrollMath'
import { fetchPayPeriodsForDrywallLabor } from '@/services/drywallLaborService'
import { fetchPayPeriods, savePayPeriod, HrPayrollPermissionError } from '@/services/hrPayrollService'
import { fetchDrywallProjects } from '@/services/drywallProjectsService'
import { fetchOrgDrywallCatalogs } from '@/services/drywallCatalogsService'
import { requireUserOrgId } from '@/services/userService'
import type {
  PayrollHourEntry,
  PayrollPieceEntry,
  PayPeriod,
} from '@/types/payroll'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

export type MislabeledLaborProblem = 'no_job' | 'unassigned' | 'custom_name' | 'stale_project_id'

export interface MislabeledLaborEntry {
  payPeriodId: string
  periodLabel: string
  periodLocked: boolean
  personId: string
  personType: string
  personName: string
  entryType: 'hour' | 'piece'
  entryIndex: number
  hours?: number
  pieces?: number
  amount?: number
  jobId: string | null
  jobName: string | null
  pieceKeyOrWorkType?: string
  problem: MislabeledLaborProblem
  suggestedProjectId?: string
  suggestedProjectName?: string
}

export interface AutoAssignNameMatchesResult {
  assigned: number
  skippedLocked: number
  failed: number
}

interface DrywallProjectRef {
  id: string
  name: string
}

export interface FetchDrywallLaborAuditOptions {
  /** Also list blank-job hour rows with no drywall signal (default false). */
  includeAllUnassigned?: boolean
}

export interface MislabeledLaborAuditSummary {
  total: number
  byProblem: Record<MislabeledLaborProblem, number>
}

function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : 0
}

function normalizeJobId(jobId: string | undefined | null): string {
  return String(jobId ?? '').trim()
}

function normalizeJobName(jobName: string | undefined | null): string {
  return String(jobName ?? '').trim().toLowerCase()
}

function resolvesToDrywallProject(jobId: string | undefined, drywallProjectIds: Set<string>): boolean {
  const id = normalizeJobId(jobId)
  if (!id || id === 'unassigned' || id === 'other') return false
  return drywallProjectIds.has(id)
}

export function classifyMislabeledLaborProblem(jobId: string | undefined | null): MislabeledLaborProblem {
  const id = normalizeJobId(jobId)
  if (!id) return 'no_job'
  if (id === 'unassigned') return 'unassigned'
  if (id === 'other') return 'custom_name'
  return 'stale_project_id'
}

export const MISLABELED_LABOR_PROBLEM_LABELS: Record<MislabeledLaborProblem, string> = {
  no_job: 'No job assigned',
  unassigned: 'Marked unassigned',
  custom_name: 'Custom name (not linked to project)',
  stale_project_id: 'Unknown / stale project ID',
}

function pieceEntryPieces(pe: PayrollPieceEntry): number {
  const total = Math.max(1, num(pe.totalPhases) || 1)
  const done = num(pe.phasesCompleted)
  const sqft = num(pe.jobTotalSqft)
  return (done / total) * sqft
}

function hasDrywallPieceSignal(
  pe: PayrollPieceEntry,
  catalogs: OrgDrywallCatalogs | null,
): boolean {
  if (pe.catalog_source === 'v3_drywall') return true
  const category = classifyLaborCategory('piece', catalogs, pe.piece_key, pe.workType)
  return category === 'hanger' || category === 'finisher' || category === 'components' || category === 'legacy'
}

function jobNameMatchesDrywallProject(
  jobName: string | undefined,
  projectNamesNormalized: Set<string>,
): boolean {
  const n = normalizeJobName(jobName)
  return n.length > 0 && projectNamesNormalized.has(n)
}

/** Normalized project name → project, only when exactly one project shares that name. */
export function buildUniqueDrywallProjectNameMap(
  projects: { id: string; name: string }[],
): Map<string, DrywallProjectRef> {
  const counts = new Map<string, number>()
  for (const project of projects) {
    const key = normalizeJobName(project.name)
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const map = new Map<string, DrywallProjectRef>()
  for (const project of projects) {
    const key = normalizeJobName(project.name)
    if (!key || (counts.get(key) ?? 0) !== 1) continue
    map.set(key, { id: project.id, name: project.name.trim() })
  }
  return map
}

function suggestionForJobName(
  jobName: string | null | undefined,
  uniqueNameMap: Map<string, DrywallProjectRef>,
): Pick<MislabeledLaborEntry, 'suggestedProjectId' | 'suggestedProjectName'> {
  const key = normalizeJobName(jobName)
  if (!key) return {}
  const match = uniqueNameMap.get(key)
  if (!match) return {}
  return { suggestedProjectId: match.id, suggestedProjectName: match.name }
}

export function countNameMatchSuggestions(rows: MislabeledLaborEntry[]): {
  total: number
  unlocked: number
} {
  let total = 0
  let unlocked = 0
  for (const row of rows) {
    if (!row.suggestedProjectId) continue
    total += 1
    if (!row.periodLocked) unlocked += 1
  }
  return { total, unlocked }
}

function summarizeMislabeled(rows: MislabeledLaborEntry[]): MislabeledLaborAuditSummary {
  const byProblem: Record<MislabeledLaborProblem, number> = {
    no_job: 0,
    unassigned: 0,
    custom_name: 0,
    stale_project_id: 0,
  }
  for (const row of rows) {
    byProblem[row.problem] += 1
  }
  return { total: rows.length, byProblem }
}

export async function fetchDrywallLaborAudit(
  options?: FetchDrywallLaborAuditOptions,
): Promise<MislabeledLaborEntry[]> {
  if (!isOnlineMode()) {
    throw new Error('Labor audit requires an online connection to Supabase.')
  }

  await requireUserOrgId()
  const includeAllUnassigned = options?.includeAllUnassigned === true

  const [periods, projects, catalogs] = await Promise.all([
    fetchPayPeriodsForDrywallLabor(),
    fetchDrywallProjects(),
    fetchOrgDrywallCatalogs().catch(() => null),
  ])

  const drywallProjectIds = new Set(projects.map((p) => p.id))
  const projectNamesNormalized = new Set(
    projects.map((p) => p.name.trim().toLowerCase()).filter(Boolean),
  )
  const uniqueProjectNameMap = buildUniqueDrywallProjectNameMap(projects)

  const rows: MislabeledLaborEntry[] = []

  for (const period of periods) {
    const periodLabel = formatPayPeriodRange(period.startDate, period.endDate)

    for (const entry of period.entries) {
      const personName = entry.personName?.trim() || entry.personId

      ;(entry.hourEntries || []).forEach((he, entryIndex) => {
        if (resolvesToDrywallProject(he.jobId, drywallProjectIds)) return

        const problem = classifyMislabeledLaborProblem(he.jobId)
        const hours = num(he.hours)
        if (hours <= 0) return

        let hasSignal = jobNameMatchesDrywallProject(he.jobName, projectNamesNormalized)
        if (!hasSignal && includeAllUnassigned && problem === 'no_job') {
          hasSignal = true
        }
        if (!hasSignal) return

        rows.push({
          payPeriodId: period.id,
          periodLabel,
          periodLocked: Boolean(period.locked),
          personId: entry.personId,
          personType: String(entry.personType),
          personName,
          entryType: 'hour',
          entryIndex,
          hours,
          jobId: normalizeJobId(he.jobId) || null,
          jobName: he.jobName?.trim() || null,
          problem,
          ...suggestionForJobName(he.jobName, uniqueProjectNameMap),
        })
      })

      ;(entry.pieceEntries || []).forEach((pe, entryIndex) => {
        if (resolvesToDrywallProject(pe.jobId, drywallProjectIds)) return

        const problem = classifyMislabeledLaborProblem(pe.jobId)
        const pieces = pieceEntryPieces(pe)
        const amount = num(pe.amount) || recalcPieceEntryAmount(pe)
        if (pieces <= 0 && amount <= 0) return

        const hasSignal =
          hasDrywallPieceSignal(pe, catalogs) ||
          jobNameMatchesDrywallProject(pe.jobName, projectNamesNormalized)
        if (!hasSignal) return

        const pieceKeyOrWorkType = resolvePieceEntryKey(pe) || pe.workType || undefined

        rows.push({
          payPeriodId: period.id,
          periodLabel,
          periodLocked: Boolean(period.locked),
          personId: entry.personId,
          personType: String(entry.personType),
          personName,
          entryType: 'piece',
          entryIndex,
          pieces,
          amount,
          jobId: normalizeJobId(pe.jobId) || null,
          jobName: pe.jobName?.trim() || null,
          pieceKeyOrWorkType,
          problem,
          ...suggestionForJobName(pe.jobName, uniqueProjectNameMap),
        })
      })
    }
  }

  const problemOrder: MislabeledLaborProblem[] = [
    'no_job',
    'unassigned',
    'custom_name',
    'stale_project_id',
  ]

  rows.sort((a, b) => {
    const byProblem = problemOrder.indexOf(a.problem) - problemOrder.indexOf(b.problem)
    if (byProblem !== 0) return byProblem
    const byPeriod = b.periodLabel.localeCompare(a.periodLabel)
    if (byPeriod !== 0) return byPeriod
    return a.personName.localeCompare(b.personName)
  })

  return rows
}

export function summarizeMislabeledLaborAudit(
  rows: MislabeledLaborEntry[],
): MislabeledLaborAuditSummary {
  return summarizeMislabeled(rows)
}

function hourEntryStillMatches(row: MislabeledLaborEntry, he: PayrollHourEntry): boolean {
  return (
    normalizeJobId(he.jobId) === normalizeJobId(row.jobId) &&
    normalizeJobName(he.jobName) === normalizeJobName(row.jobName) &&
    num(he.hours) === num(row.hours ?? 0)
  )
}

function pieceEntryStillMatches(row: MislabeledLaborEntry, pe: PayrollPieceEntry): boolean {
  const key = resolvePieceEntryKey(pe) || pe.workType || ''
  return (
    normalizeJobId(pe.jobId) === normalizeJobId(row.jobId) &&
    normalizeJobName(pe.jobName) === normalizeJobName(row.jobName) &&
    Math.abs(pieceEntryPieces(pe) - num(row.pieces ?? 0)) < 0.01 &&
    (row.pieceKeyOrWorkType ?? '') === key
  )
}

function findPersonEntry(period: PayPeriod, row: MislabeledLaborEntry) {
  return period.entries.find(
    (e) => e.personId === row.personId && String(e.personType) === row.personType,
  )
}

type ApplyReassignmentResult = 'ok' | 'stale' | 'not_found'

function applyRowReassignment(
  period: PayPeriod,
  row: MislabeledLaborEntry,
  projectId: string,
  projectName: string,
): ApplyReassignmentResult {
  const personEntry = findPersonEntry(period, row)
  if (!personEntry) return 'not_found'

  if (row.entryType === 'hour') {
    const hourEntries = personEntry.hourEntries || []
    const he = hourEntries[row.entryIndex]
    if (!he || !hourEntryStillMatches(row, he)) return 'stale'
    he.jobId = projectId
    he.jobName = projectName
    return 'ok'
  }

  const pieceEntries = personEntry.pieceEntries || []
  const pe = pieceEntries[row.entryIndex]
  if (!pe || !pieceEntryStillMatches(row, pe)) return 'stale'
  pe.jobId = projectId
  pe.jobName = projectName
  return 'ok'
}

export async function reassignLaborEntryJob(
  row: MislabeledLaborEntry,
  projectId: string,
  projectName: string,
): Promise<void> {
  if (!isOnlineMode()) {
    throw new Error('Labor reassignment requires an online connection to Supabase.')
  }

  await requireUserOrgId()

  const periods = await fetchPayPeriods()
  const period = periods.find((p) => p.id === row.payPeriodId)
  if (!period) {
    throw new Error('Pay period not found. Refresh and try again.')
  }

  const result = applyRowReassignment(period, row, projectId, projectName)
  if (result === 'not_found') {
    throw new Error('Person row not found in pay period. Refresh and try again.')
  }
  if (result === 'stale') {
    throw new Error('Entry changed since audit loaded. Refresh and try again.')
  }

  const previous = periods.find((p) => p.id === period.id)
  try {
    await savePayPeriod(period, previous ?? null)
  } catch (e) {
    if (e instanceof HrPayrollPermissionError) throw e
    throw e
  }
}

export async function autoAssignNameMatches(
  rows: MislabeledLaborEntry[],
): Promise<AutoAssignNameMatchesResult> {
  if (!isOnlineMode()) {
    throw new Error('Labor reassignment requires an online connection to Supabase.')
  }

  await requireUserOrgId()

  let assigned = 0
  let skippedLocked = 0
  let failed = 0

  const withSuggestion = rows.filter((row) => row.suggestedProjectId)
  const toApply: MislabeledLaborEntry[] = []

  for (const row of withSuggestion) {
    if (row.periodLocked) {
      skippedLocked += 1
      continue
    }
    toApply.push(row)
  }

  if (toApply.length === 0) {
    return { assigned, skippedLocked, failed }
  }

  const byPeriod = new Map<string, MislabeledLaborEntry[]>()
  for (const row of toApply) {
    const list = byPeriod.get(row.payPeriodId) ?? []
    list.push(row)
    byPeriod.set(row.payPeriodId, list)
  }

  const periods = await fetchPayPeriods()
  const periodById = new Map(periods.map((period) => [period.id, period]))

  for (const [periodId, periodRows] of byPeriod) {
    const period = periodById.get(periodId)
    if (!period) {
      failed += periodRows.length
      continue
    }

    let periodAssigned = 0
    let periodFailed = 0

    for (const row of periodRows) {
      const projectId = row.suggestedProjectId!
      const projectName = row.suggestedProjectName!
      const result = applyRowReassignment(period, row, projectId, projectName)
      if (result === 'ok') periodAssigned += 1
      else periodFailed += 1
    }

    if (periodAssigned === 0) {
      failed += periodFailed
      continue
    }

    const previous = periods.find((p) => p.id === periodId) ?? null
    try {
      await savePayPeriod(period, previous)
      assigned += periodAssigned
      failed += periodFailed
    } catch (e) {
      if (e instanceof HrPayrollPermissionError) throw e
      failed += periodAssigned + periodFailed
    }
  }

  return { assigned, skippedLocked, failed }
}

export { HrPayrollPermissionError }
