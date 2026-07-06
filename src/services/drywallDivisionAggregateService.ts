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
import type { DrywallLaborCategory } from '@/lib/drywall/payrollPieceKeys'
import {
  combineProjectCost,
  computeMarginVsBid,
  summarizeMaterial,
  summarizeSub,
  type DrywallProjectCostSummary,
  type MarginVsBidResult,
} from '@/lib/drywall/projectCostMath'
import {
  extractAllProjectLaborEntries,
  summarizeProjectLabor,
  type DrywallProjectLaborEntryFlat,
} from '@/lib/drywall/projectLaborMath'
import type {
  BidSnapshot,
  DrywallProjectStatus,
  DrywallQuoteV2V3,
  ProductionTimestamps,
} from '@/types/drywall'
import { isDrywallQuoteV3, normalizeDrywallProjectStatus } from '@/types/drywall'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'
import { fetchOrgDrywallCatalogs } from '@/services/drywallCatalogsService'
import {
  buildPayrollProfileRatesForLabor,
  fetchPayPeriodsForDrywallLabor,
} from '@/services/drywallLaborService'
import {
  fetchAllDrywallMaterialByProject,
  fetchAllDrywallSubByProject,
  type MaterialEntryFlat,
  type SubEntryFlat,
} from '@/services/drywallProjectCostService'
import {
  fetchDrywallProjectById,
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

export function emptyDivisionExecutionRollUp(computedAt = new Date().toISOString()): DivisionExecutionRollUp {
  return {
    jobs: [],
    completedCount: 0,
    inProgressCount: 0,
    totalBidCompleted: 0,
    totalActualCompleted: 0,
    aggregateMarginUsd: null,
    aggregateMarginPct: null,
    aggregateMarginColor: 'neutral',
    computedAt,
  }
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

/** @deprecated Use shouldDropJobOutsideExecutionWindow */
export function shouldDropStaleClosedJob(
  status: string,
  timestamps: ProductionTimestamps,
  now: Date,
): boolean {
  return shouldDropJobOutsideExecutionWindow(status, timestamps, now)
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
  const scoped = jobs.filter((job) => job.inProgress || isDivisionJobCompleted(job.status))

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
  laborEntries: DrywallProjectLaborEntryFlat[]
  materialEntries: MaterialEntryFlat[]
  subEntries: SubEntryFlat[]
  completedAt?: string | null
  estMaterial?: number
  estLabor?: number
  estLaborByTrade?: DivisionLaborByTradeEstimate
}): DivisionExecutionJob {
  const status = normalizeDrywallProjectStatus(input.status)
  const labor = summarizeProjectLabor(input.laborEntries)
  const material = summarizeMaterial(input.materialEntries)
  const sub = summarizeSub(input.subEntries)
  const cost = combineProjectCost(labor, material, sub)
  const margin = computeMarginVsBid(cost, input.bidSnapshot)

  return {
    projectId: input.projectId,
    projectName: input.projectName,
    status,
    inProgress: status === 'production',
    completedAt: input.completedAt ?? null,
    bid: input.bidSnapshot?.total ?? null,
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
    marginUsd: margin.marginUsd,
    marginPct: margin.marginPct,
    marginColor: margin.marginColor,
  }
}

export function buildDivisionMarginJob(
  input: Parameters<typeof buildDivisionExecutionJob>[0],
): DivisionMarginJob {
  return buildDivisionExecutionJob(input)
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

  const details = await Promise.all(
    candidates.map(async (row) => {
      const project = await fetchDrywallProjectById(row.id)
      if (!project) return null
      const timestamps = getProductionTimestampsFromLegacy(project.legacy ?? {})
      if (shouldDropJobOutsideExecutionWindow(project.status, timestamps, now)) return null
      const { bidSnapshot } = getQuoteOutcomeFromLegacy(project.legacy ?? {})
      const quote = hydrateQuoteFromLegacy(project.legacy ?? {})
      return {
        projectId: project.id,
        projectName: project.name?.trim() || row.name || 'Untitled',
        status: project.status,
        bidSnapshot,
        quote,
        completedAt: jobCompletedAt(timestamps),
      }
    }),
  )

  const activeJobs = details.filter((row): row is NonNullable<typeof row> => row != null)
  if (activeJobs.length === 0) {
    return { jobs: [], computedAt }
  }

  const [periods, materialByProject, subByProject, catalogs, profileRates] = await Promise.all([
    fetchPayPeriodsForDrywallLabor(),
    fetchAllDrywallMaterialByProject().catch(() => new Map<string, MaterialEntryFlat[]>()),
    fetchAllDrywallSubByProject().catch(() => new Map<string, SubEntryFlat[]>()),
    fetchOrgDrywallCatalogs().catch(() => null),
    buildPayrollProfileRatesForLabor().catch(() => ({})),
  ])

  const laborBuckets = extractAllProjectLaborEntries(periods, catalogs, profileRates)

  const jobs = activeJobs.map((row) => {
    const estimates = estimateCostsForQuote(row.quote, catalogs)
    return buildDivisionExecutionJob({
      projectId: row.projectId,
      projectName: row.projectName,
      status: row.status,
      bidSnapshot: row.bidSnapshot,
      laborEntries: laborBuckets.get(row.projectId) ?? [],
      materialEntries: materialByProject.get(row.projectId) ?? [],
      subEntries: subByProject.get(row.projectId) ?? [],
      completedAt: row.completedAt,
      ...estimates,
    })
  })

  return { jobs, computedAt }
}

export async function fetchDivisionMarginRollUp(now = new Date()): Promise<DivisionExecutionRollUp> {
  const execution = await fetchDivisionExecution(now)
  return buildDivisionExecutionRollUp(execution.jobs, execution.computedAt)
}
