// ============================================================================
// Drywall project cost — Supabase read layer (D.1.4)
// ============================================================================

import { orgDateKey, todayKey } from '@/lib/dateFormat'
import { isOnlineMode, supabase } from '@/lib/supabase'
import {
  combineProjectCost,
  computeCurrentCrew,
  computeMarginVsContractValue,
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
import { computeContractValueFromLegacy } from '@/lib/drywall/contractValue'
import {
  buildDrywallLaborContext,
  fetchDrywallProjectLaborSummary,
  type DrywallLaborContext,
  type DrywallLaborWindow,
} from '@/services/drywallLaborService'
import {
  computeEstimatedMaterial,
  emptyEstimatedMaterialBreakdown,
  type EstimatedMaterialBreakdown,
} from '@/lib/drywall/estimatedMaterial'
import {
  computeEstimatedLabor,
  emptyEstimatedLaborBreakdown,
  type EstimatedLaborBreakdown,
} from '@/lib/drywall/estimatedLabor'
import {
  fetchDrywallProjectById,
  fetchDrywallQuoteV2V3,
  getProductionTimestampsFromLegacy,
  getQuoteOutcomeFromLegacy,
} from '@/services/drywallProjectsService'
import { fetchOrgDrywallCatalogs } from '@/services/drywallCatalogsService'
import { requireUserOrgId } from '@/services/userService'
import type { BidSnapshot, ProductionTimestamps } from '@/types/drywall'
import { isDrywallProjectClosed, isDrywallQuoteV3, normalizeDrywallProjectStatus } from '@/types/drywall'

export type { DrywallProjectCostSummary, MaterialEntryFlat, SubEntryFlat } from '@/lib/drywall/projectCostMath'

export type DrywallCostWindow = DrywallLaborWindow

export interface DrywallProjectAssessment {
  currentCost: DrywallProjectCostSummary
  bidSnapshot: BidSnapshot | null
  margin: MarginVsBidResult
  billedToDate: number
  baseContractValue: number | null
  acceptedChangeOrderRevenue: number
  effectiveContractValue: number | null
  remainingToBill: number | null
  overbilledAmount: number
  estimatedMaterial: EstimatedMaterialBreakdown
  estimatedLabor: EstimatedLaborBreakdown
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
  // Transaction timestamps are instants. The date on the cost row is the org day,
  // not the UTC day — a late-evening Eastern posting stays on that evening's date.
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return orgDateKey(raw)
  }
  return todayKey()
}

function qbMaterialDescription(row: {
  vendor_name: string | null
  qb_job_name: string | null
  doc_number: string | null
}): string {
  const vendor = row.vendor_name?.trim() || null
  const docNumber = row.doc_number?.trim() || null
  if (docNumber) {
    return `${vendor ?? 'QB'} #${docNumber}`
  }
  return vendor ?? row.qb_job_name?.trim() ?? 'QuickBooks material'
}

export async function fetchDrywallProjectMaterialEntries(
  projectId: string,
): Promise<MaterialEntryFlat[]> {
  if (!isOnlineMode()) {
    throw new Error('Drywall project cost requires an online connection to Supabase.')
  }

  await requireUserOrgId()

  const [materialResult, qbMaterialResult] = await Promise.all([
    supabase
      .from('material_entries')
      .select('id, date, description, vendor, amount')
      .eq('project_id', projectId)
      .order('date', { ascending: false }),
    supabase
      .from('drywall_qb_materials')
      .select('id, txn_date, qb_job_name, vendor_name, doc_number, amount')
      .eq('matched_project_id', projectId)
      .eq('review_status', 'accepted'),
  ])

  if (materialResult.error) {
    throw new Error(`Failed to fetch material entries: ${materialResult.error.message}`)
  }
  if (qbMaterialResult.error) {
    throw new Error(`Failed to fetch QuickBooks materials: ${qbMaterialResult.error.message}`)
  }

  const fromEntries: MaterialEntryFlat[] = (materialResult.data ?? []).map((row) => ({
    id: String(row.id),
    date: toIsoDate(row.date),
    description: String(row.description ?? ''),
    vendor: row.vendor != null ? String(row.vendor) : null,
    amount: num(row.amount),
  }))

  const fromQb: MaterialEntryFlat[] = (qbMaterialResult.data ?? []).map((row) => ({
    id: String(row.id),
    date: toIsoDate(row.txn_date),
    description: qbMaterialDescription(row),
    vendor: row.vendor_name != null ? String(row.vendor_name) : null,
    amount: num(row.amount),
  }))

  return [...fromEntries, ...fromQb].sort((a, b) => b.date.localeCompare(a.date))
}

function appendToProjectMap<T>(
  map: Map<string, T[]>,
  projectId: string | null | undefined,
  entry: T,
): void {
  const id = String(projectId ?? '').trim()
  if (!id) return
  const list = map.get(id) ?? []
  list.push(entry)
  map.set(id, list)
}

export async function fetchAllDrywallMaterialByProject(): Promise<
  Map<string, MaterialEntryFlat[]>
> {
  if (!isOnlineMode()) {
    throw new Error('Drywall project cost requires an online connection to Supabase.')
  }

  const organizationId = await requireUserOrgId()

  const [materialResult, qbMaterialResult] = await Promise.all([
    supabase
      .from('material_entries')
      .select('id, project_id, date, description, vendor, amount')
      .eq('organization_id', organizationId),
    supabase
      .from('drywall_qb_materials')
      .select('id, matched_project_id, txn_date, qb_job_name, vendor_name, doc_number, amount')
      .eq('review_status', 'accepted')
      .not('matched_project_id', 'is', null),
  ])

  if (materialResult.error) {
    throw new Error(`Failed to fetch material entries: ${materialResult.error.message}`)
  }
  if (qbMaterialResult.error) {
    throw new Error(`Failed to fetch QuickBooks materials: ${qbMaterialResult.error.message}`)
  }

  const byProject = new Map<string, MaterialEntryFlat[]>()

  for (const row of materialResult.data ?? []) {
    appendToProjectMap(byProject, row.project_id, {
      id: String(row.id),
      date: toIsoDate(row.date),
      description: String(row.description ?? ''),
      vendor: row.vendor != null ? String(row.vendor) : null,
      amount: num(row.amount),
    })
  }

  for (const row of qbMaterialResult.data ?? []) {
    appendToProjectMap(byProject, row.matched_project_id, {
      id: String(row.id),
      date: toIsoDate(row.txn_date),
      description: qbMaterialDescription(row),
      vendor: row.vendor_name != null ? String(row.vendor_name) : null,
      amount: num(row.amount),
    })
  }

  for (const [projectId, entries] of byProject) {
    entries.sort((a, b) => b.date.localeCompare(a.date))
    byProject.set(projectId, entries)
  }

  return byProject
}

export async function fetchAllDrywallSubByProject(): Promise<Map<string, SubEntryFlat[]>> {
  if (!isOnlineMode()) {
    throw new Error('Drywall project cost requires an online connection to Supabase.')
  }

  const organizationId = await requireUserOrgId()

  const { data, error } = await supabase
    .from('subcontractor_entries')
    .select('id, project_id, date, subcontractor_name, description, amount')
    .eq('organization_id', organizationId)

  if (error) {
    throw new Error(`Failed to fetch subcontractor entries: ${error.message}`)
  }

  const byProject = new Map<string, SubEntryFlat[]>()

  for (const row of data ?? []) {
    appendToProjectMap(byProject, row.project_id, {
      id: String(row.id),
      date: toIsoDate(row.date),
      subcontractorName: String(row.subcontractor_name ?? ''),
      description: String(row.description ?? ''),
      amount: num(row.amount),
    })
  }

  for (const [projectId, entries] of byProject) {
    entries.sort((a, b) => b.date.localeCompare(a.date))
    byProject.set(projectId, entries)
  }

  return byProject
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
  options?: { window?: DrywallCostWindow; context?: DrywallLaborContext },
): Promise<DrywallProjectCostSummary> {
  if (!isOnlineMode()) {
    throw new Error('Drywall project cost requires an online connection to Supabase.')
  }

  await requireUserOrgId()

  const window = options?.window ?? 'all'

  const laborPromise = fetchDrywallProjectLaborSummary(projectId, { window, context: options?.context })

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

async function fetchDrywallProjectBilledToDate(projectId: string): Promise<number> {
  const { data, error } = await supabase
    .from('drywall_qb_invoices')
    .select('total_amt')
    .eq('matched_project_id', projectId)
    .eq('review_status', 'accepted')

  if (error) {
    throw new Error(`Failed to fetch QuickBooks billings: ${error.message}`)
  }

  return (data ?? []).reduce((sum, row) => sum + num(row.total_amt), 0)
}

async function fetchEstimatedCostBreakdownsForProject(projectId: string): Promise<{
  estimatedMaterial: EstimatedMaterialBreakdown
  estimatedLabor: EstimatedLaborBreakdown
}> {
  try {
    const quote = await fetchDrywallQuoteV2V3(projectId)
    const catalogs = isDrywallQuoteV3(quote) ? await fetchOrgDrywallCatalogs() : null
    let estimatedMaterial = emptyEstimatedMaterialBreakdown()
    let estimatedLabor = emptyEstimatedLaborBreakdown()
    try {
      estimatedMaterial = computeEstimatedMaterial(quote, catalogs)
    } catch {
      estimatedMaterial = emptyEstimatedMaterialBreakdown()
    }
    try {
      estimatedLabor = computeEstimatedLabor(quote, catalogs)
    } catch {
      estimatedLabor = emptyEstimatedLaborBreakdown()
    }
    return { estimatedMaterial, estimatedLabor }
  } catch {
    return {
      estimatedMaterial: emptyEstimatedMaterialBreakdown(),
      estimatedLabor: emptyEstimatedLaborBreakdown(),
    }
  }
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

  // One context for all three windows. They are slices of the same dataset, but each call
  // used to re-fetch every pay period in the org, the whole team twice over, and this
  // project's blob again — so opening Production or Closeout cost three of each.
  const context = await buildDrywallLaborContext(projectId)

  const [currentCost, productionComplete, afterProductionSummary, billedToDate, estimates] =
    await Promise.all([
      fetchDrywallProjectCostSummary(projectId, { window: 'all', context }),
      hasProductionStart
        ? fetchDrywallProjectCostSummary(projectId, { window: 'production', context })
        : Promise.resolve(null),
      hasProductionComplete
        ? fetchDrywallProjectCostSummary(projectId, { window: 'after-production', context })
        : Promise.resolve(null),
      fetchDrywallProjectBilledToDate(projectId),
      fetchEstimatedCostBreakdownsForProject(projectId),
    ])

  const contract = computeContractValueFromLegacy(project.legacy, billedToDate)
  const margin = computeMarginVsContractValue(currentCost, contract.effectiveContractValue)
  const currentCrew = computeCurrentCrew(currentCost.labor.summary)

  return {
    currentCost,
    bidSnapshot,
    margin,
    billedToDate,
    baseContractValue: contract.baseContractValue,
    acceptedChangeOrderRevenue: contract.acceptedChangeOrderRevenue,
    effectiveContractValue: contract.effectiveContractValue,
    remainingToBill: contract.remainingToBill,
    overbilledAmount: contract.overbilledAmount,
    estimatedMaterial: estimates.estimatedMaterial,
    estimatedLabor: estimates.estimatedLabor,
    productionComplete,
    final: closed ? currentCost : null,
    afterProductionCost: afterProductionSummary?.totalCost ?? null,
    productionTimestamps: timestamps,
    currentCrew,
    computedAt: new Date().toISOString(),
  }
}
