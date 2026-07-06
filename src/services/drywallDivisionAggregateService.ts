// ============================================================================
// Division execution margin roll-up — cross-project bid vs actual
// ============================================================================

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
import type { BidSnapshot, DrywallProjectStatus, ProductionTimestamps } from '@/types/drywall'
import { normalizeDrywallProjectStatus } from '@/types/drywall'
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

const STALE_CLOSED_MS = 90 * 24 * 60 * 60 * 1000

const DIVISION_CANDIDATE_STATUSES = new Set<DrywallProjectStatus>([
  'production',
  'production-complete',
  'closed',
])

export interface DivisionMarginJob {
  projectId: string
  projectName: string
  status: DrywallProjectStatus
  inProgress: boolean
  bid: number | null
  actualMaterial: number
  actualLabor: number
  actualSub: number
  totalActual: number
  marginUsd: number | null
  marginPct: number | null
  marginColor: MarginVsBidResult['marginColor']
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

export function shouldDropStaleClosedJob(
  status: string,
  timestamps: ProductionTimestamps,
  now: Date,
): boolean {
  if (normalizeDrywallProjectStatus(status) !== 'closed') return false
  const completionIso = timestamps.closedAt ?? timestamps.productionCompletedAt
  if (!completionIso) return false
  const completionMs = Date.parse(completionIso)
  if (!Number.isFinite(completionMs)) return false
  return now.getTime() - completionMs > STALE_CLOSED_MS
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

export function buildDivisionMarginJob(input: {
  projectId: string
  projectName: string
  status: string
  bidSnapshot: BidSnapshot | null
  laborEntries: DrywallProjectLaborEntryFlat[]
  materialEntries: MaterialEntryFlat[]
  subEntries: SubEntryFlat[]
}): DivisionMarginJob {
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
    bid: input.bidSnapshot?.total ?? null,
    actualMaterial: material.totalCost,
    actualLabor: labor.totalCost,
    actualSub: sub.totalCost,
    totalActual: cost.totalCost,
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

export async function fetchDivisionMarginRollUp(now = new Date()): Promise<DivisionExecutionRollUp> {
  const computedAt = now.toISOString()
  if (!isOnlineMode()) {
    return emptyDivisionExecutionRollUp(computedAt)
  }

  const list = await fetchDrywallProjects()
  const candidates = list.filter((p) => isDivisionMarginCandidateStatus(String(p.status)))
  if (candidates.length === 0) {
    return emptyDivisionExecutionRollUp(computedAt)
  }

  const details = await Promise.all(
    candidates.map(async (row) => {
      const project = await fetchDrywallProjectById(row.id)
      if (!project) return null
      const timestamps = getProductionTimestampsFromLegacy(project.legacy ?? {})
      if (shouldDropStaleClosedJob(project.status, timestamps, now)) return null
      const { bidSnapshot } = getQuoteOutcomeFromLegacy(project.legacy ?? {})
      return {
        projectId: project.id,
        projectName: project.name?.trim() || row.name || 'Untitled',
        status: project.status,
        bidSnapshot,
      }
    }),
  )

  const activeJobs = details.filter((row): row is NonNullable<typeof row> => row != null)
  if (activeJobs.length === 0) {
    return emptyDivisionExecutionRollUp(computedAt)
  }

  const [periods, materialByProject, subByProject, catalogs, profileRates] = await Promise.all([
    fetchPayPeriodsForDrywallLabor(),
    fetchAllDrywallMaterialByProject().catch(() => new Map<string, MaterialEntryFlat[]>()),
    fetchAllDrywallSubByProject().catch(() => new Map<string, SubEntryFlat[]>()),
    fetchOrgDrywallCatalogs().catch(() => null),
    buildPayrollProfileRatesForLabor().catch(() => ({})),
  ])

  const laborBuckets = extractAllProjectLaborEntries(periods, catalogs, profileRates)

  const jobs = activeJobs.map((row) =>
    buildDivisionMarginJob({
      projectId: row.projectId,
      projectName: row.projectName,
      status: row.status,
      bidSnapshot: row.bidSnapshot,
      laborEntries: laborBuckets.get(row.projectId) ?? [],
      materialEntries: materialByProject.get(row.projectId) ?? [],
      subEntries: subByProject.get(row.projectId) ?? [],
    }),
  )

  return buildDivisionExecutionRollUp(jobs, computedAt)
}
