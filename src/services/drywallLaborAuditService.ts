import { classifyLaborCategory } from '@/lib/drywall/projectLaborMath'
import { resolvePieceEntryKey } from '@/lib/drywall/payrollPieceKeys'
import type { DrywallLaborCategory } from '@/lib/drywall/payrollPieceKeys'
import { formatPayPeriodRange } from '@/components/hr/payroll/payrollFormat'
import { isOnlineMode, supabase } from '@/lib/supabase'
import { recalcPieceEntryAmount } from '@/lib/payrollMath'
import { fetchPayPeriodsForDrywallLabor } from '@/services/drywallLaborService'
import { fetchPayPeriods, savePayPeriod, HrPayrollPermissionError } from '@/services/hrPayrollService'
import { fetchDrywallProjects } from '@/services/drywallProjectsService'
import { fetchOrgDrywallCatalogs } from '@/services/drywallCatalogsService'
import { requireUserOrgId } from '@/services/userService'
import type {
  PayrollHourEntry,
  PayrollPieceCatalogSource,
  PayrollPieceEntry,
  PayPeriod,
} from '@/types/payroll'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

export const OFF_SYSTEM_JOB_ID = 'off-system'
export const OFF_SYSTEM_JOB_NAME = 'Off-system / Pre-app'

export type MislabeledLaborProblem =
  | 'no_job'
  | 'unassigned'
  | 'custom_name'
  | 'stale_project_id'
  | 'off_system'
  | 'unknown_type'

export type LaborAuditScope = 'signal' | 'all'

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
  category?: DrywallLaborCategory
  problem: MislabeledLaborProblem
  suggestedProjectId?: string
  suggestedProjectName?: string
}

export interface AutoAssignNameMatchesResult {
  assigned: number
  skippedLocked: number
  failed: number
}

export interface LaborAuditBatchResult {
  done: number
  skippedLocked: number
  failed: number
}

interface DrywallProjectRef {
  id: string
  name: string
}

export interface FetchDrywallLaborAuditOptions {
  scope?: LaborAuditScope
}

export interface MislabeledLaborAuditSummary {
  total: number
  byProblem: Record<MislabeledLaborProblem, number>
}

export interface LaborTypeRetagPatch {
  piece_key?: string
  workType?: string
  catalog_source?: PayrollPieceCatalogSource
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
  if (!id || id === 'unassigned' || id === 'other' || id === OFF_SYSTEM_JOB_ID) return false
  return drywallProjectIds.has(id)
}

export function isOnValidProject(jobId: string | undefined | null, allProjectIds: Set<string>): boolean {
  const id = normalizeJobId(jobId)
  if (!id || id === 'unassigned' || id === 'other' || id === OFF_SYSTEM_JOB_ID) return false
  return allProjectIds.has(id)
}

export function classifyMislabeledLaborProblem(jobId: string | undefined | null): MislabeledLaborProblem {
  const id = normalizeJobId(jobId)
  if (!id) return 'no_job'
  if (id === OFF_SYSTEM_JOB_ID) return 'off_system'
  if (id === 'unassigned') return 'unassigned'
  if (id === 'other') return 'custom_name'
  return 'stale_project_id'
}

export const MISLABELED_LABOR_PROBLEM_LABELS: Record<MislabeledLaborProblem, string> = {
  no_job: 'No job assigned',
  unassigned: 'Marked unassigned',
  custom_name: 'Custom name (not linked to project)',
  stale_project_id: 'Unknown / stale project ID',
  off_system: 'Off-system / pre-app',
  unknown_type: 'Unknown piece type',
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

function emptyByProblem(): Record<MislabeledLaborProblem, number> {
  return {
    no_job: 0,
    unassigned: 0,
    custom_name: 0,
    stale_project_id: 0,
    off_system: 0,
    unknown_type: 0,
  }
}

function summarizeMislabeled(rows: MislabeledLaborEntry[]): MislabeledLaborAuditSummary {
  const byProblem = emptyByProblem()
  for (const row of rows) {
    byProblem[row.problem] += 1
  }
  return { total: rows.length, byProblem }
}

async function fetchAllOrgProjectIds(): Promise<Set<string>> {
  await requireUserOrgId()
  const { data, error } = await supabase.from('projects').select('id, name, metadata')
  if (error) throw error
  return new Set((data ?? []).map((row) => row.id as string))
}

function buildOffSystemRow(
  period: { id: string; startDate: string; endDate: string; locked?: boolean },
  entry: PayPeriod['entries'][number],
  entryType: 'hour' | 'piece',
  entryIndex: number,
  he?: PayrollHourEntry,
  pe?: PayrollPieceEntry,
): MislabeledLaborEntry | null {
  const personName = entry.personName?.trim() || entry.personId
  const periodLabel = formatPayPeriodRange(period.startDate, period.endDate)

  if (entryType === 'hour' && he) {
    const hours = num(he.hours)
    if (hours <= 0) return null
    return {
      payPeriodId: period.id,
      periodLabel,
      periodLocked: Boolean(period.locked),
      personId: entry.personId,
      personType: String(entry.personType),
      personName,
      entryType: 'hour',
      entryIndex,
      hours,
      jobId: OFF_SYSTEM_JOB_ID,
      jobName: he.jobName?.trim() || OFF_SYSTEM_JOB_NAME,
      category: 'hourly',
      problem: 'off_system',
    }
  }

  if (entryType === 'piece' && pe) {
    const pieces = pieceEntryPieces(pe)
    const amount = num(pe.amount) || recalcPieceEntryAmount(pe)
    if (pieces <= 0 && amount <= 0) return null
    const pieceKeyOrWorkType = resolvePieceEntryKey(pe) || pe.workType || undefined
    return {
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
      jobId: OFF_SYSTEM_JOB_ID,
      jobName: pe.jobName?.trim() || OFF_SYSTEM_JOB_NAME,
      pieceKeyOrWorkType,
      problem: 'off_system',
    }
  }

  return null
}

function scanPayrollEntries(
  periods: PayPeriod[],
  scope: LaborAuditScope,
  allProjectIds: Set<string>,
  drywallProjectIds: Set<string>,
  projectNamesNormalized: Set<string>,
  uniqueProjectNameMap: Map<string, DrywallProjectRef>,
  catalogs: OrgDrywallCatalogs | null,
  options: { includeOffSystem: boolean; skipOffSystemInMain: boolean },
): MislabeledLaborEntry[] {
  const rows: MislabeledLaborEntry[] = []

  for (const period of periods) {
    const periodLabel = formatPayPeriodRange(period.startDate, period.endDate)

    for (const entry of period.entries) {
      const personName = entry.personName?.trim() || entry.personId

      ;(entry.hourEntries || []).forEach((he, entryIndex) => {
        const jobId = normalizeJobId(he.jobId)
        if (options.includeOffSystem && jobId === OFF_SYSTEM_JOB_ID) {
          const row = buildOffSystemRow(period, entry, 'hour', entryIndex, he)
          if (row) rows.push(row)
          return
        }
        if (options.skipOffSystemInMain && jobId === OFF_SYSTEM_JOB_ID) return

        const hours = num(he.hours)
        if (hours <= 0) return

        if (isOnValidProject(he.jobId, allProjectIds)) return

        const problem = classifyMislabeledLaborProblem(he.jobId)
        if (scope === 'signal') {
          const hasSignal = jobNameMatchesDrywallProject(he.jobName, projectNamesNormalized)
          if (!hasSignal) return
        }

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
          jobId: jobId || null,
          jobName: he.jobName?.trim() || null,
          category: classifyLaborCategory('hour', catalogs),
          problem,
          ...suggestionForJobName(he.jobName, uniqueProjectNameMap),
        })
      })

      ;(entry.pieceEntries || []).forEach((pe, entryIndex) => {
        const jobId = normalizeJobId(pe.jobId)
        if (options.includeOffSystem && jobId === OFF_SYSTEM_JOB_ID) {
          const row = buildOffSystemRow(period, entry, 'piece', entryIndex, undefined, pe)
          if (row) rows.push(row)
          return
        }
        if (options.skipOffSystemInMain && jobId === OFF_SYSTEM_JOB_ID) return

        const pieces = pieceEntryPieces(pe)
        const amount = num(pe.amount) || recalcPieceEntryAmount(pe)
        if (pieces <= 0 && amount <= 0) return

        const category = classifyLaborCategory('piece', catalogs, pe.piece_key, pe.workType)
        const pieceKeyOrWorkType = resolvePieceEntryKey(pe) || pe.workType || undefined

        const base = {
          payPeriodId: period.id,
          periodLabel,
          periodLocked: Boolean(period.locked),
          personId: entry.personId,
          personType: String(entry.personType),
          personName,
          entryType: 'piece' as const,
          entryIndex,
          pieces,
          amount,
          jobId: jobId || null,
          jobName: pe.jobName?.trim() || null,
          pieceKeyOrWorkType,
          category,
        }

        if (resolvesToDrywallProject(pe.jobId, drywallProjectIds) && category === 'other') {
          rows.push({
            ...base,
            problem: 'unknown_type',
          })
          return
        }

        if (isOnValidProject(pe.jobId, allProjectIds)) return

        const problem = classifyMislabeledLaborProblem(pe.jobId)
        if (scope === 'signal') {
          const hasSignal =
            hasDrywallPieceSignal(pe, catalogs) ||
            jobNameMatchesDrywallProject(pe.jobName, projectNamesNormalized)
          if (!hasSignal) return
        }

        rows.push({
          ...base,
          problem,
          ...suggestionForJobName(pe.jobName, uniqueProjectNameMap),
        })
      })
    }
  }

  return rows
}

const PROBLEM_SORT_ORDER: MislabeledLaborProblem[] = [
  'no_job',
  'unassigned',
  'custom_name',
  'stale_project_id',
  'unknown_type',
  'off_system',
]

function sortMislabeledRows(rows: MislabeledLaborEntry[]): MislabeledLaborEntry[] {
  return [...rows].sort((a, b) => {
    const byProblem = PROBLEM_SORT_ORDER.indexOf(a.problem) - PROBLEM_SORT_ORDER.indexOf(b.problem)
    if (byProblem !== 0) return byProblem
    const byPeriod = b.periodLabel.localeCompare(a.periodLabel)
    if (byPeriod !== 0) return byPeriod
    return a.personName.localeCompare(b.personName)
  })
}

export async function fetchDrywallLaborAudit(
  options?: FetchDrywallLaborAuditOptions,
): Promise<MislabeledLaborEntry[]> {
  if (!isOnlineMode()) {
    throw new Error('Labor audit requires an online connection to Supabase.')
  }

  await requireUserOrgId()
  const scope: LaborAuditScope = options?.scope === 'all' ? 'all' : 'signal'

  const [periods, projects, allProjectIds, catalogs] = await Promise.all([
    fetchPayPeriodsForDrywallLabor(),
    fetchDrywallProjects(),
    fetchAllOrgProjectIds(),
    fetchOrgDrywallCatalogs().catch(() => null),
  ])

  const drywallProjectIds = new Set(projects.map((p) => p.id))
  const projectNamesNormalized = new Set(
    projects.map((p) => p.name.trim().toLowerCase()).filter(Boolean),
  )
  const uniqueProjectNameMap = buildUniqueDrywallProjectNameMap(projects)

  const rows = scanPayrollEntries(
    periods as PayPeriod[],
    scope,
    allProjectIds,
    drywallProjectIds,
    projectNamesNormalized,
    uniqueProjectNameMap,
    catalogs,
    { includeOffSystem: false, skipOffSystemInMain: true },
  )

  return sortMislabeledRows(rows)
}

export async function fetchOffSystemLaborEntries(): Promise<MislabeledLaborEntry[]> {
  if (!isOnlineMode()) {
    throw new Error('Labor audit requires an online connection to Supabase.')
  }

  await requireUserOrgId()

  const periods = await fetchPayPeriodsForDrywallLabor()

  const rows = scanPayrollEntries(
    periods as PayPeriod[],
    'all',
    new Set(),
    new Set(),
    new Set(),
    new Map(),
    null,
    { includeOffSystem: true, skipOffSystemInMain: false },
  )

  return sortMislabeledRows(rows)
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
    Math.abs((num(pe.amount) || recalcPieceEntryAmount(pe)) - num(row.amount ?? 0)) < 0.01 &&
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

function applyTypeRetag(
  period: PayPeriod,
  row: MislabeledLaborEntry,
  patch: LaborTypeRetagPatch,
): ApplyReassignmentResult {
  if (row.entryType !== 'piece') return 'not_found'

  const personEntry = findPersonEntry(period, row)
  if (!personEntry) return 'not_found'

  const pieceEntries = personEntry.pieceEntries || []
  const pe = pieceEntries[row.entryIndex]
  if (!pe || !pieceEntryStillMatches(row, pe)) return 'stale'

  const savedAmount = pe.amount
  const savedPhases = {
    totalPhases: pe.totalPhases,
    phasesCompleted: pe.phasesCompleted,
    jobTotalSqft: pe.jobTotalSqft,
    rate: pe.rate,
  }

  if (patch.catalog_source === 'legacy') {
    delete pe.piece_key
  } else if (patch.piece_key !== undefined) {
    pe.piece_key = patch.piece_key
  }

  if (patch.workType !== undefined) {
    pe.workType = patch.workType
  }
  if (patch.catalog_source !== undefined) {
    pe.catalog_source = patch.catalog_source
  }

  pe.totalPhases = savedPhases.totalPhases
  pe.phasesCompleted = savedPhases.phasesCompleted
  pe.jobTotalSqft = savedPhases.jobTotalSqft
  pe.rate = savedPhases.rate
  pe.amount = savedAmount

  return 'ok'
}

async function persistPayPeriodChange(period: PayPeriod, periods: PayPeriod[]): Promise<void> {
  const previous = periods.find((p) => p.id === period.id) ?? null
  try {
    await savePayPeriod(period, previous)
  } catch (e) {
    if (e instanceof HrPayrollPermissionError) throw e
    throw e
  }
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

  await persistPayPeriodChange(period, periods)
}

export async function retagLaborEntryType(
  row: MislabeledLaborEntry,
  patch: LaborTypeRetagPatch,
): Promise<void> {
  if (!isOnlineMode()) {
    throw new Error('Labor retag requires an online connection to Supabase.')
  }

  await requireUserOrgId()

  const periods = await fetchPayPeriods()
  const period = periods.find((p) => p.id === row.payPeriodId)
  if (!period) {
    throw new Error('Pay period not found. Refresh and try again.')
  }

  const result = applyTypeRetag(period, row, patch)
  if (result === 'not_found') {
    throw new Error('Piece entry not found in pay period. Refresh and try again.')
  }
  if (result === 'stale') {
    throw new Error('Entry changed since audit loaded. Refresh and try again.')
  }

  await persistPayPeriodChange(period, periods)
}

export async function markLaborEntryOffSystem(row: MislabeledLaborEntry): Promise<void> {
  const result = await markLaborEntriesOffSystem([row])
  if (result.done === 0) {
    if (result.skippedLocked > 0) {
      throw new Error('Pay period is locked. Unlock the period to make changes.')
    }
    throw new Error('Entry changed since audit loaded. Refresh and try again.')
  }
}

export async function clearLaborEntryOffSystem(row: MislabeledLaborEntry): Promise<void> {
  return reassignLaborEntryJob(row, '', '')
}

async function batchedApplyToRows(
  rows: MislabeledLaborEntry[],
  applyOne: (period: PayPeriod, row: MislabeledLaborEntry) => ApplyReassignmentResult,
): Promise<LaborAuditBatchResult> {
  if (!isOnlineMode()) {
    throw new Error('Labor reassignment requires an online connection to Supabase.')
  }

  await requireUserOrgId()

  let done = 0
  let skippedLocked = 0
  let failed = 0

  const unlocked: MislabeledLaborEntry[] = []
  for (const row of rows) {
    if (row.periodLocked) {
      skippedLocked += 1
      continue
    }
    unlocked.push(row)
  }

  if (unlocked.length === 0) {
    return { done, skippedLocked, failed }
  }

  const byPeriod = new Map<string, MislabeledLaborEntry[]>()
  for (const row of unlocked) {
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

    let periodDone = 0
    let periodFailed = 0

    for (const row of periodRows) {
      const result = applyOne(period, row)
      if (result === 'ok') periodDone += 1
      else periodFailed += 1
    }

    if (periodDone === 0) {
      failed += periodFailed
      continue
    }

    try {
      await persistPayPeriodChange(period, periods)
      done += periodDone
      failed += periodFailed
    } catch (e) {
      if (e instanceof HrPayrollPermissionError) throw e
      failed += periodDone + periodFailed
    }
  }

  return { done, skippedLocked, failed }
}

export async function markLaborEntriesOffSystem(
  rows: MislabeledLaborEntry[],
): Promise<LaborAuditBatchResult> {
  return batchedApplyToRows(rows, (period, row) =>
    applyRowReassignment(period, row, OFF_SYSTEM_JOB_ID, OFF_SYSTEM_JOB_NAME),
  )
}

export async function assignLaborEntriesToProject(
  rows: MislabeledLaborEntry[],
  projectId: string,
  projectName: string,
): Promise<LaborAuditBatchResult> {
  return batchedApplyToRows(rows, (period, row) =>
    applyRowReassignment(period, row, projectId, projectName),
  )
}

export async function autoAssignNameMatches(
  rows: MislabeledLaborEntry[],
): Promise<AutoAssignNameMatchesResult> {
  const eligible = rows.filter(
    (row) => row.suggestedProjectId && row.problem !== 'unknown_type',
  )
  const result = await batchedApplyToRows(eligible, (period, row) =>
    applyRowReassignment(period, row, row.suggestedProjectId!, row.suggestedProjectName!),
  )
  return {
    assigned: result.done,
    skippedLocked: result.skippedLocked,
    failed: result.failed,
  }
}

export { HrPayrollPermissionError }
