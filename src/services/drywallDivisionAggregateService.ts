// ============================================================================
// Division execution margin roll-up — cross-project bid vs actual
// ============================================================================

import { hydrateDrywallQuote } from '@/lib/drywall/createEmptyDrywallQuote'
import { hydrateDrywallQuoteV3 } from '@/lib/drywall/createEmptyDrywallQuoteV3'
import { normalizeQuoteToV2, quoteV2ToLegacyCompat } from '@/lib/drywall/drywallQuoteSchema'
import {
  computeEstimatedLabor,
  emptyEstimatedLaborBreakdown,
  type EstimatedLaborBreakdown,
} from '@/lib/drywall/estimatedLabor'
import {
  computeEstimatedMaterial,
  emptyEstimatedMaterialBreakdown,
} from '@/lib/drywall/estimatedMaterial'
import { computeMeasuredSqft, quotedSqftWithWaste } from '@/lib/drywall/fieldMeasurementUtils'
import type { DrywallLaborCategory } from '@/lib/drywall/payrollPieceKeys'
import {
  combineProjectCost,
  computeMarginVsBid,
  computeMarginVsContractValue,
  summarizeMaterial,
  summarizeSub,
  type DrywallProjectCostSummary,
  type MarginVsBidResult,
} from '@/lib/drywall/projectCostMath'
import { computeContractValueFromLegacy } from '@/lib/drywall/contractValue'
import {
  extractAllProjectLaborEntries,
  summarizeProjectLabor,
  type DrywallProjectLaborEntryFlat,
} from '@/lib/drywall/projectLaborMath'
import type {
  BidSnapshot,
  DrywallProjectStatus,
  DrywallQuoteV2V3,
  FieldMeasurementArea,
  ProductionTimestamps,
} from '@/types/drywall'
import { isDrywallQuoteV3, normalizeDrywallProjectStatus } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'
import { fetchOrgDrywallCatalogs } from '@/services/drywallCatalogsService'
import {
  buildPayrollProfileRatesForLabor,
  buildSpecialtyByPersonKeyForLabor,
  fetchPayPeriodsForDrywallLabor,
} from '@/services/drywallLaborService'
import {
  fetchAllDrywallMaterialByProject,
  fetchAllDrywallSubByProject,
  type MaterialEntryFlat,
  type SubEntryFlat,
} from '@/services/drywallProjectCostService'
import {
  fetchDrywallProjectsByIds,
  fetchDrywallProjects,
  getProductionTimestampsFromLegacy,
  getQuoteOutcomeFromLegacy,
} from '@/services/drywallProjectsService'
import { isOnlineMode } from '@/lib/supabase'

/** Completed jobs older than this are excluded from division execution scope (12 months). */
export const EXECUTION_COMPLETED_WINDOW_MS = 365 * 24 * 60 * 60 * 1000

const DIVISION_CANDIDATE_STATUSES = new Set<DrywallProjectStatus>([
  'production',
  'production-complete',
  'closed',
])

export interface DivisionLaborByTradeEstimate {
  hanger: number
  finisher: number
  components: number
  prepClean: number
}

export interface DivisionExecutionJob {
  projectId: string
  projectName: string
  status: DrywallProjectStatus
  inProgress: boolean
  completedAt: string | null
  bid: number | null
  effectiveContractValue?: number | null
  actualMaterial: number
  actualLabor: number
  actualSub: number
  totalActual: number
  actualLaborByTrade: Record<DrywallLaborCategory, number>
  estMaterial: number
  estLabor: number
  estLaborByTrade: DivisionLaborByTradeEstimate
  marginUsd: number | null
  marginPct: number | null
  marginColor: MarginVsBidResult['marginColor']
  /** Quoted sqft WITH waste — the same basis FieldVarianceSummary compares on screen. */
  quotedSqft: number
  /** Field-measured sqft, 0 when the job has not been measured. */
  measuredSqft: number
  /** When the takeoff was last saved; the date the variance became known. */
  measuredAt: string | null
}

/** Margin roll-up job shape — alias of execution job fields used by margin UI. */
export type DivisionMarginJob = DivisionExecutionJob

export interface DivisionExecution {
  jobs: DivisionExecutionJob[]
  computedAt: string
}

export const LABOR_PERFORMANCE_TRADES = ['hanger', 'finisher', 'components', 'prepClean'] as const
export type LaborPerformanceTrade = (typeof LABOR_PERFORMANCE_TRADES)[number]

export interface LaborPerformanceTradeRow {
  trade: LaborPerformanceTrade
  label: string
  estimated: number
  actual: number
  efficiencyPct: number | null
  varianceUsd: number
  efficiencyColor: 'green' | 'yellow' | 'red' | 'neutral'
}

export interface DivisionLaborPerformance {
  jobCount: number
  totalEstLabor: number
  totalActualLabor: number
  overallEfficiencyPct: number | null
  tradeRows: LaborPerformanceTradeRow[]
  unmappedActual: {
    legacy: number
    hourly: number
    other: number
    total: number
  }
}

export interface EstimatingBucket {
  key: string
  label: string
  est: number
  actual: number
  variancePct: number | null
}

export interface EstimatingMonth {
  month: string
  variancePct: number | null
  jobCount: number
}

export interface EstimatingAccuracy {
  overallVariancePct: number | null
  jobCount: number
  byBucket: EstimatingBucket[]
  byMonth: EstimatingMonth[]
  mostOff: Array<{
    projectId: string
    projectName: string
    est: number
    actual: number
    variancePct: number
  }>
}

const ESTIMATING_ACCURACY_BUCKETS: Array<{
  key: string
  label: string
  est: (job: DivisionExecutionJob) => number
  actual: (job: DivisionExecutionJob) => number
}> = [
  { key: 'material', label: 'Material', est: (j) => j.estMaterial, actual: (j) => j.actualMaterial },
  {
    key: 'hanger',
    label: 'Hanger',
    est: (j) => j.estLaborByTrade.hanger,
    actual: (j) => j.actualLaborByTrade.hanger ?? 0,
  },
  {
    key: 'finisher',
    label: 'Finisher',
    est: (j) => j.estLaborByTrade.finisher,
    actual: (j) => j.actualLaborByTrade.finisher ?? 0,
  },
  {
    key: 'components',
    label: 'Components',
    est: (j) => j.estLaborByTrade.components,
    actual: (j) => j.actualLaborByTrade.components ?? 0,
  },
  {
    key: 'prepClean',
    label: 'Prep / Clean',
    est: (j) => j.estLaborByTrade.prepClean,
    actual: (j) => j.actualLaborByTrade.prepClean ?? 0,
  },
]

const MOST_OFF_JOBS_LIMIT = 5

const LABOR_TRADE_LABELS: Record<LaborPerformanceTrade, string> = {
  hanger: 'Hanger',
  finisher: 'Finisher',
  components: 'Components',
  prepClean: 'Prep / Clean',
}

export interface DivisionExecutionRollUp {
  jobs: DivisionMarginJob[]
  completedCount: number
  inProgressCount: number
  totalBidCompleted: number
  totalActualCompleted: number
  aggregateMarginUsd: number | null
  aggregateMarginPct: number | null
  aggregateMarginColor: MarginVsBidResult['marginColor']
  computedAt: string
}

export function isDivisionMarginCandidateStatus(status: string): boolean {
  const normalized = normalizeDrywallProjectStatus(status)
  return DIVISION_CANDIDATE_STATUSES.has(normalized)
}

export function isDivisionJobInProgress(status: string): boolean {
  return normalizeDrywallProjectStatus(status) === 'production'
}

export function isDivisionJobCompleted(status: string): boolean {
  const normalized = normalizeDrywallProjectStatus(status)
  return normalized === 'production-complete' || normalized === 'closed'
}

export function shouldDropJobOutsideExecutionWindow(
  status: string,
  timestamps: ProductionTimestamps,
  now: Date,
): boolean {
  if (isDivisionJobInProgress(status)) return false
  if (!isDivisionJobCompleted(status)) return false
  const completionIso = timestamps.closedAt ?? timestamps.productionCompletedAt
  if (!completionIso) return false
  const completionMs = Date.parse(completionIso)
  if (!Number.isFinite(completionMs)) return false
  return now.getTime() - completionMs > EXECUTION_COMPLETED_WINDOW_MS
}

export function jobCompletedAt(timestamps: ProductionTimestamps): string | null {
  return timestamps.closedAt ?? timestamps.productionCompletedAt ?? null
}

export function hydrateQuoteFromLegacy(legacy: Record<string, unknown>): DrywallQuoteV2V3 {
  const raw = legacy.quote
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const q = raw as Record<string, unknown>
    if (q.version === 3) return hydrateDrywallQuoteV3(q)
    if (q.version === 2) return hydrateDrywallQuote(q)
    const legacyCompat = quoteV2ToLegacyCompat(normalizeQuoteToV2(q))
    return hydrateDrywallQuote({ ...legacyCompat, version: 2 })
  }
  return hydrateDrywallQuote({})
}

function estLaborByTradeFromBreakdown(
  breakdown: EstimatedLaborBreakdown,
): DivisionLaborByTradeEstimate {
  return {
    hanger: breakdown.hanger,
    finisher: breakdown.finisher,
    components: breakdown.componentsTotal,
    prepClean: breakdown.prepClean,
  }
}

function estimateCostsForQuote(
  quote: DrywallQuoteV2V3,
  catalogs: OrgDrywallCatalogs | null,
): Pick<DivisionExecutionJob, 'estMaterial' | 'estLabor' | 'estLaborByTrade'> {
  const quoteCatalogs = isDrywallQuoteV3(quote) ? catalogs : null
  let estMaterial = 0
  let estLabor = 0
  let estLaborByTrade: DivisionLaborByTradeEstimate = {
    hanger: 0,
    finisher: 0,
    components: 0,
    prepClean: 0,
  }

  try {
    estMaterial = computeEstimatedMaterial(quote, quoteCatalogs).totalWithTax
  } catch {
    estMaterial = emptyEstimatedMaterialBreakdown().totalWithTax
  }

  try {
    const labor = computeEstimatedLabor(quote, quoteCatalogs)
    estLabor = labor.total
    estLaborByTrade = estLaborByTradeFromBreakdown(labor)
  } catch {
    const empty = emptyEstimatedLaborBreakdown()
    estLabor = empty.total
    estLaborByTrade = estLaborByTradeFromBreakdown(empty)
  }

  return { estMaterial, estLabor, estLaborByTrade }
}

export function laborEfficiencyColor(
  efficiencyPct: number | null,
): LaborPerformanceTradeRow['efficiencyColor'] {
  if (efficiencyPct == null) return 'neutral'
  if (efficiencyPct >= 100) return 'green'
  if (efficiencyPct >= 90) return 'yellow'
  return 'red'
}

export function computeLaborEfficiencyPct(estimated: number, actual: number): number | null {
  if (actual <= 0) return null
  return (estimated / actual) * 100
}

export function aggregateDivisionLaborPerformance(
  jobs: DivisionExecutionJob[],
): DivisionLaborPerformance {
  const scoped = jobs.filter((job) => isDivisionJobCompleted(job.status))

  let totalEstLabor = 0
  let totalActualLabor = 0
  const estByTrade: Record<LaborPerformanceTrade, number> = {
    hanger: 0,
    finisher: 0,
    components: 0,
    prepClean: 0,
  }
  const actualByTrade: Record<LaborPerformanceTrade, number> = {
    hanger: 0,
    finisher: 0,
    components: 0,
    prepClean: 0,
  }
  let legacy = 0
  let hourly = 0
  let other = 0

  for (const job of scoped) {
    totalEstLabor += job.estLabor
    totalActualLabor += job.actualLabor
    for (const trade of LABOR_PERFORMANCE_TRADES) {
      estByTrade[trade] += job.estLaborByTrade[trade]
      actualByTrade[trade] += job.actualLaborByTrade[trade] ?? 0
    }
    legacy += job.actualLaborByTrade.legacy ?? 0
    hourly += job.actualLaborByTrade.hourly ?? 0
    other += job.actualLaborByTrade.other ?? 0
  }

  const tradeRows: LaborPerformanceTradeRow[] = LABOR_PERFORMANCE_TRADES.map((trade) => {
    const estimated = estByTrade[trade]
    const actual = actualByTrade[trade]
    const efficiencyPct = computeLaborEfficiencyPct(estimated, actual)
    return {
      trade,
      label: LABOR_TRADE_LABELS[trade],
      estimated,
      actual,
      efficiencyPct,
      varianceUsd: actual - estimated,
      efficiencyColor: laborEfficiencyColor(efficiencyPct),
    }
  })

  return {
    jobCount: scoped.length,
    totalEstLabor,
    totalActualLabor,
    overallEfficiencyPct: computeLaborEfficiencyPct(totalEstLabor, totalActualLabor),
    tradeRows,
    unmappedActual: {
      legacy,
      hourly,
      other,
      total: legacy + hourly + other,
    },
  }
}

export function computeEstimatingVariancePct(estimated: number, actual: number): number | null {
  if (estimated <= 0) return null
  return (actual - estimated) / estimated
}

export function estimatingAccuracyColor(
  variancePct: number | null,
): 'green' | 'yellow' | 'red' | 'neutral' {
  if (variancePct == null) return 'neutral'
  const magnitude = Math.abs(variancePct)
  if (magnitude <= 0.05) return 'green'
  if (magnitude <= 0.15) return 'yellow'
  return 'red'
}

function isWithinAccuracyCompletedWindow(completedAt: string | null, now: Date): boolean {
  if (!completedAt) return false
  const completionMs = Date.parse(completedAt)
  if (!Number.isFinite(completionMs)) return false
  return now.getTime() - completionMs <= EXECUTION_COMPLETED_WINDOW_MS
}

export function scopeEstimatingAccuracyJobs(
  jobs: DivisionExecutionJob[],
  now = new Date(),
): DivisionExecutionJob[] {
  return jobs.filter((job) => {
    if (job.inProgress || !isDivisionJobCompleted(job.status)) return false
    if (!isWithinAccuracyCompletedWindow(job.completedAt, now)) return false
    const estCost = job.estMaterial + job.estLabor
    return estCost > 0
  })
}

function last12MonthKeys(now: Date): string[] {
  const keys: string[] = []
  for (let offset = 11; offset >= 0; offset -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    const month = String(d.getMonth() + 1).padStart(2, '0')
    keys.push(`${d.getFullYear()}-${month}`)
  }
  return keys
}

function monthKeyFromIso(iso: string): string | null {
  const parsed = Date.parse(iso)
  if (!Number.isFinite(parsed)) return null
  const d = new Date(parsed)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${month}`
}

/** Field-measured sqft off the stored takeoff, 0 when the job has not been measured. */
function measuredSqftFromLegacy(legacy: Record<string, unknown>): number {
  const takeoff = legacy.fieldTakeoff
  if (!takeoff || typeof takeoff !== 'object' || Array.isArray(takeoff)) return 0
  const t = takeoff as Record<string, unknown>
  const stored = Number(t.totalMeasuredSqft)
  if (Number.isFinite(stored) && stored > 0) return stored
  // Older takeoffs predate the stored total; recompute the way the page does.
  return computeMeasuredSqft(
    (Array.isArray(t.measurements) ? t.measurements : []) as FieldMeasurementArea[],
  )
}

/** When the takeoff was last saved — the date the variance became knowable. */
function takeoffUpdatedAt(legacy: Record<string, unknown>): string | null {
  const takeoff = legacy.fieldTakeoff
  if (!takeoff || typeof takeoff !== 'object' || Array.isArray(takeoff)) return null
  const raw = (takeoff as Record<string, unknown>).updatedAt
  return typeof raw === 'string' && raw.trim() ? raw : null
}

export interface TakeoffAccuracyJob {
  projectId: string
  projectName: string
  quotedSqft: number
  measuredSqft: number
  variancePct: number
}

export interface TakeoffAccuracy {
  /** Weighted: total measured vs total quoted, so big jobs count for more. */
  overallVariancePct: number | null
  /**
   * The middle job. Reported alongside the weighted figure and not instead of it, because
   * one half-finished measurement on a big job moves the weighted number a long way — a
   * single 20k sqft job measured in part accounts for a fifth of the division-wide gap.
   */
  medianVariancePct: number | null
  jobCount: number
  totalQuotedSqft: number
  totalMeasuredSqft: number
  overCount: number
  underCount: number
  byMonth: Array<{ month: string; variancePct: number | null; jobCount: number }>
  mostOff: TakeoffAccuracyJob[]
}

/**
 * Jobs too small to read a percentage off. A patch job quoted at 39 sqft that measures 144
 * is not a 269% estimating error, it is two sheets — but it would dominate any average.
 */
export const TAKEOFF_ACCURACY_MIN_SQFT = 500

/**
 * Jobs where the takeoff can be judged: quoted AND measured, measured within 12 months.
 *
 * Deliberately NOT scoped to completed jobs, unlike estimating accuracy. A takeoff variance
 * is final the moment the measure lands — waiting for the job to finish would delay the
 * signal by months and hide everything currently in production.
 *
 * Two exclusions, both learned from the live data rather than guessed:
 *
 *  1. **Exact ties.** Six jobs measure the quoted sqft to the square foot, which is not
 *     accuracy — it is the quote having been written FROM the takeoff. 3443 W. 136th St is
 *     the giveaway: its drywall line reads 4,049, exactly the measured total, while the
 *     quote's own `sqft` field still says 2,227. Scoring those as perfect flatters the
 *     estimate with its own answer.
 *  2. **Jobs under TAKEOFF_ACCURACY_MIN_SQFT**, per the constant above.
 *
 * Both rules are stated on screen, because a filtered denominator the reader cannot see is
 * how a dashboard starts lying.
 */
export function scopeTakeoffAccuracyJobs(
  jobs: DivisionExecutionJob[],
  now = new Date(),
): DivisionExecutionJob[] {
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 11, 1).getTime()
  return jobs.filter((job) => {
    if (job.quotedSqft < TAKEOFF_ACCURACY_MIN_SQFT || job.measuredSqft <= 0) return false
    // Equal to the square foot — the quote was written from this takeoff.
    if (Math.abs(job.measuredSqft - job.quotedSqft) < 1) return false
    const when = job.measuredAt ?? job.completedAt
    if (!when) return false
    const ms = Date.parse(when)
    return Number.isFinite(ms) && ms >= cutoff
  })
}

/**
 * Do the takeoffs run high or low?
 *
 * This sits upstream of estimating accuracy and explains part of it: if a job quotes 10,000
 * sqft and measures 12,000, the material overrun is arithmetic rather than a buying problem.
 * Separating the two says whether a miss came from the TAKEOFF or from the PURCHASE.
 *
 * Both a weighted and a median figure, because they answer different questions and on this
 * data they disagree — the weighted number is dominated by a few large jobs while the median
 * describes the typical one.
 */
export function aggregateTakeoffAccuracy(
  jobs: DivisionExecutionJob[],
  now = new Date(),
): TakeoffAccuracy {
  const scoped = scopeTakeoffAccuracyJobs(jobs, now)
  const monthKeys = last12MonthKeys(now)

  if (scoped.length === 0) {
    return {
      overallVariancePct: null,
      medianVariancePct: null,
      jobCount: 0,
      totalQuotedSqft: 0,
      totalMeasuredSqft: 0,
      overCount: 0,
      underCount: 0,
      byMonth: monthKeys.map((month) => ({ month, variancePct: null, jobCount: 0 })),
      mostOff: [],
    }
  }

  const rows: TakeoffAccuracyJob[] = scoped.map((job) => ({
    projectId: job.projectId,
    projectName: job.projectName,
    quotedSqft: job.quotedSqft,
    measuredSqft: job.measuredSqft,
    variancePct: (job.measuredSqft - job.quotedSqft) / job.quotedSqft,
  }))

  const totalQuotedSqft = rows.reduce((s, r) => s + r.quotedSqft, 0)
  const totalMeasuredSqft = rows.reduce((s, r) => s + r.measuredSqft, 0)
  const sortedPcts = rows.map((r) => r.variancePct).sort((a, b) => a - b)
  const mid = Math.floor(sortedPcts.length / 2)
  const medianVariancePct =
    sortedPcts.length % 2 === 1
      ? sortedPcts[mid]
      : (sortedPcts[mid - 1] + sortedPcts[mid]) / 2

  const byMonth = monthKeys.map((month) => {
    const monthJobs = scoped.filter((job) => {
      const when = job.measuredAt ?? job.completedAt
      return when ? monthKeyFromIso(when) === month : false
    })
    if (monthJobs.length === 0) return { month, variancePct: null, jobCount: 0 }
    const q = monthJobs.reduce((s, j) => s + j.quotedSqft, 0)
    const m = monthJobs.reduce((s, j) => s + j.measuredSqft, 0)
    return {
      month,
      variancePct: q > 0 ? (m - q) / q : null,
      jobCount: monthJobs.length,
    }
  })

  return {
    overallVariancePct:
      totalQuotedSqft > 0 ? (totalMeasuredSqft - totalQuotedSqft) / totalQuotedSqft : null,
    medianVariancePct,
    jobCount: rows.length,
    totalQuotedSqft,
    totalMeasuredSqft,
    overCount: rows.filter((r) => r.variancePct > 0).length,
    underCount: rows.filter((r) => r.variancePct < 0).length,
    byMonth,
    mostOff: [...rows]
      .sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct))
      .slice(0, 5),
  }
}

export function aggregateEstimatingAccuracy(
  jobs: DivisionExecutionJob[],
  now = new Date(),
): EstimatingAccuracy {
  const scoped = scopeEstimatingAccuracyJobs(jobs, now)

  if (scoped.length === 0) {
    return {
      overallVariancePct: null,
      jobCount: 0,
      byBucket: ESTIMATING_ACCURACY_BUCKETS.map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        est: 0,
        actual: 0,
        variancePct: null,
      })),
      byMonth: last12MonthKeys(now).map((month) => ({
        month,
        variancePct: null,
        jobCount: 0,
      })),
      mostOff: [],
    }
  }

  let totalEst = 0
  let totalActual = 0
  for (const job of scoped) {
    totalEst += job.estMaterial + job.estLabor
    totalActual += job.actualMaterial + job.actualLabor
  }

  const byBucket: EstimatingBucket[] = ESTIMATING_ACCURACY_BUCKETS.map((bucket) => {
    let est = 0
    let actual = 0
    for (const job of scoped) {
      est += bucket.est(job)
      actual += bucket.actual(job)
    }
    return {
      key: bucket.key,
      label: bucket.label,
      est,
      actual,
      variancePct: computeEstimatingVariancePct(est, actual),
    }
  })

  const monthKeys = last12MonthKeys(now)
  const byMonth: EstimatingMonth[] = monthKeys.map((month) => {
    const monthJobs = scoped.filter((job) => job.completedAt && monthKeyFromIso(job.completedAt) === month)
    if (monthJobs.length === 0) {
      return { month, variancePct: null, jobCount: 0 }
    }
    let est = 0
    let actual = 0
    for (const job of monthJobs) {
      est += job.estMaterial + job.estLabor
      actual += job.actualMaterial + job.actualLabor
    }
    return {
      month,
      variancePct: computeEstimatingVariancePct(est, actual),
      jobCount: monthJobs.length,
    }
  })

  const mostOff = scoped
    .map((job) => {
      const est = job.estMaterial + job.estLabor
      const actual = job.actualMaterial + job.actualLabor
      const variancePct = computeEstimatingVariancePct(est, actual) ?? 0
      return {
        projectId: job.projectId,
        projectName: job.projectName,
        est,
        actual,
        variancePct,
      }
    })
    .sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct))
    .slice(0, MOST_OFF_JOBS_LIMIT)

  return {
    overallVariancePct: computeEstimatingVariancePct(totalEst, totalActual),
    jobCount: scoped.length,
    byBucket,
    byMonth,
    mostOff,
  }
}

export function sortDivisionJobsWorstMarginFirst(jobs: DivisionMarginJob[]): DivisionMarginJob[] {
  return [...jobs].sort((a, b) => {
    if (a.marginPct == null && b.marginPct == null) return a.projectName.localeCompare(b.projectName)
    if (a.marginPct == null) return 1
    if (b.marginPct == null) return -1
    if (a.marginPct !== b.marginPct) return a.marginPct - b.marginPct
    return a.projectName.localeCompare(b.projectName)
  })
}

function syntheticBidSnapshot(total: number): BidSnapshot {
  return {
    total,
    at: new Date().toISOString(),
    payload: {
      routineSubtotal: total,
      cleanupTotal: 0,
      overhead: 0,
      profit: 0,
      salesTax: 0,
      bidTotal: total,
      lineItems: [],
      alternates: [],
    },
  }
}

function emptyCostSummary(): DrywallProjectCostSummary {
  const labor = summarizeProjectLabor([])
  return combineProjectCost(labor, summarizeMaterial([]), summarizeSub([]))
}

export function buildDivisionExecutionJob(input: {
  projectId: string
  projectName: string
  status: string
  bidSnapshot: BidSnapshot | null
  effectiveContractValue?: number | null
  laborEntries: DrywallProjectLaborEntryFlat[]
  materialEntries: MaterialEntryFlat[]
  subEntries: SubEntryFlat[]
  completedAt?: string | null
  estMaterial?: number
  estLabor?: number
  estLaborByTrade?: DivisionLaborByTradeEstimate
  quotedSqft?: number
  measuredSqft?: number
  measuredAt?: string | null
}): DivisionExecutionJob {
  const status = normalizeDrywallProjectStatus(input.status)
  const labor = summarizeProjectLabor(input.laborEntries)
  const material = summarizeMaterial(input.materialEntries)
  const sub = summarizeSub(input.subEntries)
  const cost = combineProjectCost(labor, material, sub)
  const effectiveContractValue =
    input.effectiveContractValue ?? input.bidSnapshot?.total ?? null
  const margin = computeMarginVsContractValue(cost, effectiveContractValue)

  return {
    projectId: input.projectId,
    projectName: input.projectName,
    status,
    inProgress: status === 'production',
    completedAt: input.completedAt ?? null,
    bid: effectiveContractValue,
    effectiveContractValue,
    actualMaterial: material.totalCost,
    actualLabor: labor.totalCost,
    actualSub: sub.totalCost,
    totalActual: cost.totalCost,
    actualLaborByTrade: { ...labor.byCategory },
    estMaterial: input.estMaterial ?? 0,
    estLabor: input.estLabor ?? 0,
    estLaborByTrade: input.estLaborByTrade ?? {
      hanger: 0,
      finisher: 0,
      components: 0,
      prepClean: 0,
    },
    quotedSqft: input.quotedSqft ?? 0,
    measuredSqft: input.measuredSqft ?? 0,
    measuredAt: input.measuredAt ?? null,
    marginUsd: margin.marginUsd,
    marginPct: margin.marginPct,
    marginColor: margin.marginColor,
  }
}

export function aggregateDivisionExecutionRollUp(
  jobs: DivisionMarginJob[],
  computedAt: string,
): Pick<
  DivisionExecutionRollUp,
  | 'completedCount'
  | 'inProgressCount'
  | 'totalBidCompleted'
  | 'totalActualCompleted'
  | 'aggregateMarginUsd'
  | 'aggregateMarginPct'
  | 'aggregateMarginColor'
> {
  const completedCount = jobs.filter((j) => !j.inProgress).length
  const inProgressCount = jobs.filter((j) => j.inProgress).length

  const completedWithBid = jobs.filter(
    (j) => !j.inProgress && j.bid != null && j.bid > 0,
  )
  const totalBidCompleted = completedWithBid.reduce((sum, j) => sum + (j.bid ?? 0), 0)
  const totalActualCompleted = completedWithBid.reduce((sum, j) => sum + j.totalActual, 0)

  if (totalBidCompleted <= 0) {
    return {
      completedCount,
      inProgressCount,
      totalBidCompleted: 0,
      totalActualCompleted: 0,
      aggregateMarginUsd: null,
      aggregateMarginPct: null,
      aggregateMarginColor: 'neutral',
    }
  }

  const aggregateCost: DrywallProjectCostSummary = {
    ...emptyCostSummary(),
    totalCost: totalActualCompleted,
  }
  const aggregateMargin = computeMarginVsBid(
    aggregateCost,
    syntheticBidSnapshot(totalBidCompleted),
  )

  return {
    completedCount,
    inProgressCount,
    totalBidCompleted,
    totalActualCompleted,
    aggregateMarginUsd: aggregateMargin.marginUsd,
    aggregateMarginPct: aggregateMargin.marginPct,
    aggregateMarginColor: aggregateMargin.marginColor,
  }
}

export function buildDivisionExecutionRollUp(
  jobs: DivisionMarginJob[],
  computedAt: string,
): DivisionExecutionRollUp {
  const sorted = sortDivisionJobsWorstMarginFirst(jobs)
  return {
    jobs: sorted,
    ...aggregateDivisionExecutionRollUp(sorted, computedAt),
    computedAt,
  }
}

export async function fetchDivisionExecution(now = new Date()): Promise<DivisionExecution> {
  const computedAt = now.toISOString()
  if (!isOnlineMode()) {
    return { jobs: [], computedAt }
  }

  const list = await fetchDrywallProjects()
  const candidates = list.filter((p) => isDivisionMarginCandidateStatus(String(p.status)))
  if (candidates.length === 0) {
    return { jobs: [], computedAt }
  }

  // One read for every candidate, rather than one read per candidate.
  const projectsById = await fetchDrywallProjectsByIds(candidates.map((row) => row.id))

  const details = await Promise.all(
    candidates.map(async (row) => {
      const project = projectsById.get(row.id)
      if (!project) return null
      const timestamps = getProductionTimestampsFromLegacy(project.legacy ?? {})
      if (shouldDropJobOutsideExecutionWindow(project.status, timestamps, now)) return null
      const { bidSnapshot } = getQuoteOutcomeFromLegacy(project.legacy ?? {})
      const quote = hydrateQuoteFromLegacy(project.legacy ?? {})
      const contract = computeContractValueFromLegacy(project.legacy ?? {})
      return {
        projectId: project.id,
        projectName: project.name?.trim() || row.name || 'Untitled',
        status: project.status,
        bidSnapshot,
        effectiveContractValue: contract.effectiveContractValue,
        quote,
        completedAt: jobCompletedAt(timestamps),
        // Same two functions FieldVarianceSummary uses on the project page, so the
        // portfolio number cannot disagree with the per-job one.
        quotedSqft: quotedSqftWithWaste(quote),
        measuredSqft: measuredSqftFromLegacy(project.legacy ?? {}),
        measuredAt: takeoffUpdatedAt(project.legacy ?? {}),
      }
    }),
  )

  const activeJobs = details.filter((row): row is NonNullable<typeof row> => row != null)
  if (activeJobs.length === 0) {
    return { jobs: [], computedAt }
  }

  const [periods, materialByProject, subByProject, catalogs, profileRates, specialtyByPersonKey] =
    await Promise.all([
      fetchPayPeriodsForDrywallLabor(),
      fetchAllDrywallMaterialByProject().catch(() => new Map<string, MaterialEntryFlat[]>()),
      fetchAllDrywallSubByProject().catch(() => new Map<string, SubEntryFlat[]>()),
      fetchOrgDrywallCatalogs().catch(() => null),
      buildPayrollProfileRatesForLabor().catch(() => ({})),
      buildSpecialtyByPersonKeyForLabor().catch(() => new Map<string, DrywallLaborCategory>()),
    ])

  const laborBuckets = extractAllProjectLaborEntries(
    periods,
    catalogs,
    profileRates,
    specialtyByPersonKey,
  )

  const jobs = activeJobs.map((row) => {
    const estimates = estimateCostsForQuote(row.quote, catalogs)
    return buildDivisionExecutionJob({
      projectId: row.projectId,
      projectName: row.projectName,
      status: row.status,
      bidSnapshot: row.bidSnapshot,
      effectiveContractValue: row.effectiveContractValue,
      laborEntries: laborBuckets.get(row.projectId) ?? [],
      materialEntries: materialByProject.get(row.projectId) ?? [],
      subEntries: subByProject.get(row.projectId) ?? [],
      completedAt: row.completedAt,
      quotedSqft: row.quotedSqft,
      measuredSqft: row.measuredSqft,
      measuredAt: row.measuredAt,
      ...estimates,
    })
  })

  return { jobs, computedAt }
}
