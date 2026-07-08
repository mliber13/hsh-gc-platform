// ============================================================================
// Drywall project labor — pure aggregation (D.1.3)
// ============================================================================

import { parseISO } from 'date-fns'
import { LABOR_TAX_RATE } from '@/lib/drywall/calculations/quantityUtils'
import {
  isComponentLaborKey,
  isDrywallHangerKey,
  isFinishScopePieceKey,
  isLegacyPayrollWorkType,
  legacyWorkTypeCategory,
  resolvePieceEntryKey,
  type DrywallLaborCategory,
} from '@/lib/drywall/payrollPieceKeys'
import {
  calculateHourlyPayWithOvertimeCap,
  calculateHoursTotal,
  getHelperDeductionForJob,
  getRateForHourEntry,
  personKey,
  recalcPieceEntryAmount,
} from '@/lib/payrollMath'
import type { PayrollPersonType } from '@/types/payroll'
import type { PayrollEntry, PayrollHourEntry, PayrollPieceEntry } from '@/types/payroll'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

export interface PayPeriodForLabor {
  id: string
  startDate: string
  endDate: string
  locked: boolean
  completedAt: string | null
  entries: PayrollEntry[]
}

export interface DrywallProjectLaborEntryFlat {
  payPeriodId: string
  periodStart: string
  periodEnd: string
  periodLocked: boolean
  periodCompletedAt: string | null
  personId: string
  personType: PayrollPersonType | string
  personName?: string
  source: 'hour' | 'piece'
  pieceKey?: string
  workType?: string
  hours?: number
  overtimeType?: string
  pieces?: number
  amount: number
  category: DrywallLaborCategory
  /** Index within the person's hourEntries or pieceEntries array (payroll write path). */
  entryIndex: number
  jobId?: string
  jobName?: string
}

export interface DrywallProjectLaborSummary {
  totalCost: number
  totalHours: number
  totalOvertimeHours: number
  totalPieces: number
  /** Sum of 25% W2 burden added to payroll amounts (1099 excluded). */
  w2BurdenCost: number
  byCategory: Record<DrywallProjectLaborEntryFlat['category'], number>
  byPayPeriod: Array<{
    payPeriodId: string
    periodStart: string
    periodEnd: string
    locked: boolean
    cost: number
  }>
  entries: DrywallProjectLaborEntryFlat[]
}

export type ProfileRatesByPersonKey = Record<string, number>

function emptyByCategory(): Record<DrywallLaborCategory, number> {
  return {
    hanger: 0,
    finisher: 0,
    components: 0,
    prepClean: 0,
    legacy: 0,
    hourly: 0,
    other: 0,
  }
}

function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : 0
}

function applyW2LaborBurden(
  amount: number,
  personType: PayrollPersonType | string,
): { burdened: number; burdenAdded: number } {
  if (personType === 'w2') {
    const burdened = amount * (1 + LABOR_TAX_RATE)
    return { burdened, burdenAdded: burdened - amount }
  }
  return { burdened: amount, burdenAdded: 0 }
}

function isAssignablePayrollJobId(jobId: string | undefined): jobId is string {
  const id = String(jobId ?? '').trim()
  return Boolean(id) && id !== 'unassigned'
}

function appendLaborToProjectMap(
  byProject: Map<string, DrywallProjectLaborEntryFlat[]>,
  jobId: string | undefined,
  entry: DrywallProjectLaborEntryFlat,
): void {
  if (!isAssignablePayrollJobId(jobId)) return
  const list = byProject.get(jobId) ?? []
  list.push(entry)
  byProject.set(jobId, list)
}

function periodEndMs(periodEnd: string): number {
  const iso = periodEnd.length === 10 ? `${periodEnd}T23:59:59.999` : periodEnd
  const parsed = parseISO(iso)
  return parsed.getTime()
}

function timestampMs(ts?: string | null): number | null {
  if (!ts) return null
  const n = Date.parse(ts)
  return Number.isFinite(n) ? n : null
}

export function classifyLaborCategory(
  source: 'hour' | 'piece',
  catalogs: OrgDrywallCatalogs | null,
  pieceKey?: string,
  workType?: string,
): DrywallLaborCategory {
  if (source === 'hour') return 'hourly'
  const key = resolvePieceEntryKey({ piece_key: pieceKey, workType })
  if (isDrywallHangerKey(key)) return 'hanger'
  if (catalogs && isFinishScopePieceKey(key, catalogs.finish_scopes)) return 'finisher'
  if (isComponentLaborKey(key)) return 'components'
  const mapped = legacyWorkTypeCategory(key)
  if (mapped) return mapped
  if (isLegacyPayrollWorkType(key)) return 'legacy'
  return 'other'
}

function scaleForBankedHours(entry: PayrollEntry, amount: number): number {
  const hoursTotal = calculateHoursTotal(entry.hourEntries, entry.hours)
  const hoursToBank = num(entry.hoursToBank)
  if (hoursTotal > 0 && hoursToBank > 0) {
    const paidHours = Math.max(0, hoursTotal - hoursToBank)
    return amount * (paidHours / hoursTotal)
  }
  return amount
}

function pieceEntryRawAmount(pe: PayrollPieceEntry): number {
  const stored = num(pe.amount)
  if (stored > 0) return stored
  return recalcPieceEntryAmount(pe)
}

function pieceEntryPieces(pe: PayrollPieceEntry): number {
  const total = Math.max(1, num(pe.totalPhases) || 1)
  const done = num(pe.phasesCompleted)
  const sqft = num(pe.jobTotalSqft)
  return (done / total) * sqft
}

function pieceEntryNetAmount(
  pe: PayrollPieceEntry,
  entry: PayrollEntry,
  allEntries: Record<string, PayrollEntry>,
  pk: string,
): number {
  const jobId = pe.jobId || ''
  const jobName = pe.jobName || ''
  const jobPieces = (entry.pieceEntries || []).filter(
    (p) => p.jobId === pe.jobId && (p.jobName || '') === (pe.jobName || ''),
  )
  const jobRawTotal = jobPieces.reduce((sum, p) => sum + pieceEntryRawAmount(p), 0)
  const raw = pieceEntryRawAmount(pe)
  if (jobRawTotal <= 0 || raw <= 0) return 0
  const deduction = getHelperDeductionForJob(allEntries, pk, jobId, jobName)
  const netJob = Math.max(0, jobRawTotal - deduction)
  return (raw / jobRawTotal) * netJob
}

function hourEntryPay(
  he: PayrollHourEntry,
  hourIndex: number,
  entry: PayrollEntry,
  profileRate: number,
): number {
  const { entryPayments } = calculateHourlyPayWithOvertimeCap(entry, profileRate)
  const payment = entryPayments[hourIndex]
  if (payment) {
    return scaleForBankedHours(entry, payment.pay ?? 0)
  }
  const hrs = num(he.hours)
  const rate = getRateForHourEntry(he, profileRate)
  const mult = he.overtimeType === '1.5' ? 1.5 : he.overtimeType === '2' ? 2 : 1
  return scaleForBankedHours(entry, hrs * rate * mult)
}

function buildRunEntriesMap(entries: PayrollEntry[]): Record<string, PayrollEntry> {
  const out: Record<string, PayrollEntry> = {}
  for (const e of entries) {
    out[personKey(e.personId, e.personType)] = e
  }
  return out
}

export function extractAllProjectLaborEntries(
  periods: PayPeriodForLabor[],
  catalogs: OrgDrywallCatalogs | null,
  profileRates: ProfileRatesByPersonKey = {},
  specialtyByPersonKey: Map<string, DrywallLaborCategory> = new Map(),
): Map<string, DrywallProjectLaborEntryFlat[]> {
  const byProject = new Map<string, DrywallProjectLaborEntryFlat[]>()

  for (const period of periods) {
    const allEntries = buildRunEntriesMap(period.entries)

    for (const entry of period.entries) {
      const pk = personKey(entry.personId, entry.personType)
      const profileRate = profileRates[pk] ?? 0

      const hourEntries = entry.hourEntries || []
      hourEntries.forEach((he, idx) => {
        const hours = num(he.hours)
        if (hours <= 0) return
        const amount = hourEntryPay(he, idx, entry, profileRate)
        if (amount <= 0) return

        appendLaborToProjectMap(byProject, he.jobId, {
          payPeriodId: period.id,
          periodStart: period.startDate,
          periodEnd: period.endDate,
          periodLocked: period.locked,
          periodCompletedAt: period.completedAt,
          personId: entry.personId,
          personType: entry.personType,
          personName: entry.personName,
          source: 'hour',
          hours,
          overtimeType: he.overtimeType || 'regular',
          amount,
          category: specialtyByPersonKey.get(pk) ?? classifyLaborCategory('hour', catalogs),
          entryIndex: idx,
          jobId: he.jobId,
          jobName: he.jobName,
        })
      })

      ;(entry.pieceEntries || []).forEach((pe, idx) => {
        const amount = pieceEntryNetAmount(pe, entry, allEntries, pk)
        if (amount <= 0) return
        const pieces = pieceEntryPieces(pe)
        const pieceKey = pe.piece_key
        const workType = pe.workType

        appendLaborToProjectMap(byProject, pe.jobId, {
          payPeriodId: period.id,
          periodStart: period.startDate,
          periodEnd: period.endDate,
          periodLocked: period.locked,
          periodCompletedAt: period.completedAt,
          personId: entry.personId,
          personType: entry.personType,
          personName: entry.personName,
          source: 'piece',
          pieceKey,
          workType,
          pieces,
          amount,
          category: classifyLaborCategory('piece', catalogs, pieceKey, workType),
          entryIndex: idx,
          jobId: pe.jobId,
          jobName: pe.jobName,
        })
      })
    }
  }

  return byProject
}

export function extractProjectLaborEntries(
  periods: PayPeriodForLabor[],
  projectId: string,
  catalogs: OrgDrywallCatalogs | null,
  profileRates: ProfileRatesByPersonKey = {},
  specialtyByPersonKey: Map<string, DrywallLaborCategory> = new Map(),
): DrywallProjectLaborEntryFlat[] {
  return extractAllProjectLaborEntries(periods, catalogs, profileRates, specialtyByPersonKey).get(
    projectId,
  ) ?? []
}

export function summarizeProjectLabor(
  entries: DrywallProjectLaborEntryFlat[],
): DrywallProjectLaborSummary {
  const byCategory = emptyByCategory()
  let totalCost = 0
  let totalHours = 0
  let totalOvertimeHours = 0
  let totalPieces = 0
  let w2BurdenCost = 0

  const periodMap = new Map<
    string,
    { periodStart: string; periodEnd: string; locked: boolean; cost: number }
  >()

  const burdenedEntries: DrywallProjectLaborEntryFlat[] = []

  for (const e of entries) {
    const { burdened, burdenAdded } = applyW2LaborBurden(e.amount, e.personType)
    w2BurdenCost += burdenAdded
    const entry = burdened === e.amount ? e : { ...e, amount: burdened }
    burdenedEntries.push(entry)

    totalCost += burdened
    byCategory[e.category] += burdened

    if (e.source === 'hour') {
      const hrs = num(e.hours)
      totalHours += hrs
      if (e.overtimeType && e.overtimeType !== 'regular') {
        totalOvertimeHours += hrs
      }
    } else {
      totalPieces += num(e.pieces)
    }

    const prev = periodMap.get(e.payPeriodId) ?? {
      periodStart: e.periodStart,
      periodEnd: e.periodEnd,
      locked: e.periodLocked,
      cost: 0,
    }
    prev.cost += burdened
    periodMap.set(e.payPeriodId, prev)
  }

  const byPayPeriod = [...periodMap.entries()]
    .map(([payPeriodId, row]) => ({
      payPeriodId,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      locked: row.locked,
      cost: row.cost,
    }))
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))

  return {
    totalCost,
    totalHours,
    totalOvertimeHours,
    totalPieces,
    w2BurdenCost,
    byCategory,
    byPayPeriod,
    entries: burdenedEntries,
  }
}

export function splitLaborByProductionWindow(
  entries: DrywallProjectLaborEntryFlat[],
  timestamps: {
    productionStartedAt?: string | null
    productionCompletedAt?: string | null
    closedAt?: string | null
  },
): {
  preProduction: DrywallProjectLaborEntryFlat[]
  duringProduction: DrywallProjectLaborEntryFlat[]
  afterProduction: DrywallProjectLaborEntryFlat[]
  unbounded: DrywallProjectLaborEntryFlat[]
} {
  const preProduction: DrywallProjectLaborEntryFlat[] = []
  const duringProduction: DrywallProjectLaborEntryFlat[] = []
  const afterProduction: DrywallProjectLaborEntryFlat[] = []
  const unbounded: DrywallProjectLaborEntryFlat[] = []

  const startedMs = timestampMs(timestamps.productionStartedAt)
  if (startedMs == null) {
    return { preProduction, duringProduction, afterProduction, unbounded: [...entries] }
  }

  const completedMs = timestampMs(timestamps.productionCompletedAt)
  const closedMs = timestampMs(timestamps.closedAt) ?? Date.now()

  for (const entry of entries) {
    const endMs = periodEndMs(entry.periodEnd)

    if (endMs <= startedMs) {
      preProduction.push(entry)
      continue
    }

    if (completedMs == null || endMs <= completedMs) {
      duringProduction.push(entry)
      continue
    }

    if (endMs <= closedMs) {
      afterProduction.push(entry)
      continue
    }

    unbounded.push(entry)
  }

  return { preProduction, duringProduction, afterProduction, unbounded }
}
