// ============================================================================
// Drywall project cost — Supabase read layer (D.1.4)
// ============================================================================

import { isOnlineMode, supabase } from '@/lib/supabase'
import {
  combineProjectCost,
  computeCurrentCrew,
  computeMarginVsBid,
  pickWindowEntries,
  splitMaterialByProductionWindow,
  splitSubByProductionWindow,
  summarizeMaterial,
  summarizeSub,
  type DrywallProjectCostSummary,
  type MarginVsBidResult,
  type MaterialEntryFlat,
  type SubEntryFlat,
} from '@/lib/drywall/projectCostMath'
import {
  fetchDrywallProjectLaborSummary,
  type DrywallLaborWindow,
} from '@/services/drywallLaborService'
import {
  fetchDrywallProjectById,
  getProductionTimestampsFromLegacy,
  getQuoteOutcomeFromLegacy,
} from '@/services/drywallProjectsService'
import { requireUserOrgId } from '@/services/userService'
import type { BidSnapshot, ProductionTimestamps } from '@/types/drywall'
import { isDrywallProjectClosed, normalizeDrywallProjectStatus } from '@/types/drywall'

export type { DrywallProjectCostSummary, MaterialEntryFlat, SubEntryFlat } from '@/lib/drywall/projectCostMath'

export type DrywallCostWindow = DrywallLaborWindow

export interface DrywallProjectAssessment {
  currentCost: DrywallProjectCostSummary
  bidSnapshot: BidSnapshot | null
  margin: MarginVsBidResult
  productionComplete: DrywallProjectCostSummary | null
  final: DrywallProjectCostSummary | null
  afterProductionCost: number | null
  productionTimestamps: ProductionTimestamps
  currentCrew: { names: string[]; total: number }
  computedAt: string
}

function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : 0
}

function toIsoDate(raw: unknown): string {
  if (typeof raw === 'string' && raw.length >= 10) {
    return raw.slice(0, 10)
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10)
  }
  return new Date().toISOString().slice(0, 10)
}

export async function fetchDrywallProjectMaterialEntries(
  projectId: string,
): Promise<MaterialEntryFlat[]> {
  if (!isOnlineMode()) {
    throw new Error('Drywall project cost requires an online connection to Supabase.')
  }

  await requireUserOrgId()

  const { data, error } = await supabase
    .from('material_entries')
    .select('id, date, description, vendor, amount')
    .eq('project_id', projectId)
    .order('date', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch material entries: ${error.message}`)
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    date: toIsoDate(row.date),
    description: String(row.description ?? ''),
    vendor: row.vendor != null ? String(row.vendor) : null,
    amount: num(row.amount),
  }))
}

export async function fetchDrywallProjectSubEntries(projectId: string): Promise<SubEntryFlat[]> {
  if (!isOnlineMode()) {
    throw new Error('Drywall project cost requires an online connection to Supabase.')
  }

  await requireUserOrgId()

  const { data, error } = await supabase
    .from('subcontractor_entries')
    .select('id, date, subcontractor_name, description, amount')
    .eq('project_id', projectId)
    .order('date', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch subcontractor entries: ${error.message}`)
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    date: toIsoDate(row.date),
    subcontractorName: String(row.subcontractor_name ?? ''),
    description: String(row.description ?? ''),
    amount: num(row.amount),
  }))
}

async function filterMaterialAndSubByWindow(
  projectId: string,
  window: DrywallCostWindow,
  timestamps: ProductionTimestamps,
): Promise<{
  material: { totalCost: number; entries: MaterialEntryFlat[] }
  sub: { totalCost: number; entries: SubEntryFlat[] }
}> {
  const [materialEntries, subEntries] = await Promise.all([
    fetchDrywallProjectMaterialEntries(projectId),
    fetchDrywallProjectSubEntries(projectId),
  ])

  if (window === 'all') {
    return {
      material: summarizeMaterial(materialEntries),
      sub: summarizeSub(subEntries),
    }
  }

  const materialSplit = splitMaterialByProductionWindow(materialEntries, timestamps)
  const subSplit = splitSubByProductionWindow(subEntries, timestamps)

  return {
    material: summarizeMaterial(pickWindowEntries(materialSplit, window)),
    sub: summarizeSub(pickWindowEntries(subSplit, window)),
  }
}

export async function fetchDrywallProjectCostSummary(
  projectId: string,
  options?: { window?: DrywallCostWindow },
): Promise<DrywallProjectCostSummary> {
  if (!isOnlineMode()) {
    throw new Error('Drywall project cost requires an online connection to Supabase.')
  }

  await requireUserOrgId()

  const window = options?.window ?? 'all'

  const laborPromise = fetchDrywallProjectLaborSummary(projectId, { window })

  if (window === 'all') {
    const [labor, materialEntries, subEntries] = await Promise.all([
      laborPromise,
      fetchDrywallProjectMaterialEntries(projectId),
      fetchDrywallProjectSubEntries(projectId),
    ])
    return combineProjectCost(
      labor,
      summarizeMaterial(materialEntries),
      summarizeSub(subEntries),
    )
  }

  const project = await fetchDrywallProjectById(projectId)
  const timestamps = getProductionTimestampsFromLegacy(project?.legacy ?? {})

  const [labor, materialSub] = await Promise.all([
    laborPromise,
    filterMaterialAndSubByWindow(projectId, window, timestamps),
  ])

  return combineProjectCost(labor, materialSub.material, materialSub.sub)
}

export async function fetchDrywallProjectAssessment(
  projectId: string,
): Promise<DrywallProjectAssessment> {
  if (!isOnlineMode()) {
    throw new Error('Drywall project assessment requires an online connection to Supabase.')
  }

  await requireUserOrgId()

  const project = await fetchDrywallProjectById(projectId)
  if (!project) {
    throw new Error('Project not found')
  }

  const timestamps = getProductionTimestampsFromLegacy(project.legacy)
  const { bidSnapshot } = getQuoteOutcomeFromLegacy(project.legacy)
  const status = normalizeDrywallProjectStatus(project.status)
  const closed = isDrywallProjectClosed(status)

  const hasProductionStart = Boolean(timestamps.productionStartedAt)
  const hasProductionComplete = Boolean(timestamps.productionCompletedAt)

  const [currentCost, productionComplete, afterProductionSummary] = await Promise.all([
    fetchDrywallProjectCostSummary(projectId, { window: 'all' }),
    hasProductionStart
      ? fetchDrywallProjectCostSummary(projectId, { window: 'production' })
      : Promise.resolve(null),
    hasProductionComplete
      ? fetchDrywallProjectCostSummary(projectId, { window: 'after-production' })
      : Promise.resolve(null),
  ])

  const margin = computeMarginVsBid(currentCost, bidSnapshot)
  const currentCrew = computeCurrentCrew(currentCost.labor.summary)

  return {
    currentCost,
    bidSnapshot,
    margin,
    productionComplete,
    final: closed ? currentCost : null,
    afterProductionCost: afterProductionSummary?.totalCost ?? null,
    productionTimestamps: timestamps,
    currentCrew,
    computedAt: new Date().toISOString(),
  }
}
