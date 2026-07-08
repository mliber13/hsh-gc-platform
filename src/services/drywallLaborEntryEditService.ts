import { resolvePieceEntryKey } from '@/lib/drywall/payrollPieceKeys'
import { isOnlineMode } from '@/lib/supabase'
import {
  normalizeJobId,
  OFF_SYSTEM_JOB_ID,
  OFF_SYSTEM_JOB_NAME,
  type LaborTypeRetagPatch,
} from '@/services/drywallLaborAuditService'
import { fetchPayPeriods, savePayPeriod, HrPayrollPermissionError } from '@/services/hrPayrollService'
import { requireUserOrgId } from '@/services/userService'
import type { PayrollHourEntry, PayrollPieceEntry, PayPeriod } from '@/types/payroll'

const STALE_MSG = 'This entry changed since the page loaded. Refresh and try again.'

export interface LaborEntryEditRef {
  payPeriodId: string
  personId: string
  personType: string
  source: 'hour' | 'piece'
  entryIndex: number
  jobId?: string
  hours?: number
  pieceKey?: string
  workType?: string
}

export type ReassignTarget =
  | { kind: 'project'; projectId: string; projectName: string }
  | { kind: 'off-system' }
  | { kind: 'unassign' }

function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : 0
}

function lineMatchesRef(
  ref: LaborEntryEditRef,
  line: PayrollHourEntry | PayrollPieceEntry | undefined,
): boolean {
  if (!line) return false
  if (normalizeJobId(line.jobId) !== normalizeJobId(ref.jobId)) return false

  if (ref.source === 'hour') {
    return num((line as PayrollHourEntry).hours) === num(ref.hours)
  }

  const pe = line as PayrollPieceEntry
  const lineKey = resolvePieceEntryKey(pe) || pe.workType || ''
  const refKey =
    resolvePieceEntryKey({ piece_key: ref.pieceKey, workType: ref.workType }) ||
    ref.workType ||
    ''
  return lineKey === refKey
}

function applyRetagToPiece(pe: PayrollPieceEntry, patch: LaborTypeRetagPatch): void {
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
}

async function loadMutablePeriod(ref: LaborEntryEditRef): Promise<{
  period: PayPeriod
  previous: PayPeriod
  line: PayrollHourEntry | PayrollPieceEntry
}> {
  const periods = await fetchPayPeriods()
  const period = periods.find((p) => p.id === ref.payPeriodId)
  if (!period) {
    throw new Error('Pay period not found. Refresh and try again.')
  }
  if (period.locked) {
    throw new Error('This pay period is locked. Unlock it in the payroll editor to edit.')
  }

  const previous = structuredClone(period)

  const personEntry = period.entries.find(
    (e) => e.personId === ref.personId && String(e.personType) === ref.personType,
  )
  if (!personEntry) {
    throw new Error('Entry not found. Refresh and try again.')
  }

  const arr =
    ref.source === 'hour'
      ? (personEntry.hourEntries ?? [])
      : (personEntry.pieceEntries ?? [])
  const line = arr[ref.entryIndex]

  if (!lineMatchesRef(ref, line)) {
    throw new Error(STALE_MSG)
  }

  return { period, previous, line }
}

export async function reassignLaborEntry(
  ref: LaborEntryEditRef,
  target: ReassignTarget,
): Promise<void> {
  if (!isOnlineMode()) {
    throw new Error('Labor edits require an online connection to Supabase.')
  }

  await requireUserOrgId()

  const { period, previous, line } = await loadMutablePeriod(ref)

  let jobId = ''
  let jobName = ''
  if (target.kind === 'project') {
    jobId = target.projectId
    jobName = target.projectName
  } else if (target.kind === 'off-system') {
    jobId = OFF_SYSTEM_JOB_ID
    jobName = OFF_SYSTEM_JOB_NAME
  }

  line.jobId = jobId
  line.jobName = jobName

  try {
    await savePayPeriod(period, previous)
  } catch (e) {
    if (e instanceof HrPayrollPermissionError) throw e
    throw e
  }
}

export async function retagLaborEntry(
  ref: LaborEntryEditRef,
  patch: LaborTypeRetagPatch,
): Promise<void> {
  if (!isOnlineMode()) {
    throw new Error('Labor edits require an online connection to Supabase.')
  }

  await requireUserOrgId()

  if (ref.source !== 'piece') {
    throw new Error('Only piece entries can be re-tagged.')
  }

  const { period, previous, line } = await loadMutablePeriod(ref)
  applyRetagToPiece(line as PayrollPieceEntry, patch)

  try {
    await savePayPeriod(period, previous)
  } catch (e) {
    if (e instanceof HrPayrollPermissionError) throw e
    throw e
  }
}
