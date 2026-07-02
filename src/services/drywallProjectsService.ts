// ============================================================================
// Drywall workspace — projects list + Project Info CRUD (Phase B)
// ============================================================================

import { supabase, isOnlineMode } from '@/lib/supabase'
import { belongsInDrywallWorkspaceFromListScalars } from '@/services/projectVisibility'
import { requireUserOrgId, getCurrentUserProfile } from '@/services/userService'
import { hydrateDrywallQuote } from '@/lib/drywall/createEmptyDrywallQuote'
import { hydrateDrywallQuoteV3, prepareDrywallQuoteV3ForSave } from '@/lib/drywall/createEmptyDrywallQuoteV3'
import { buildV3FromV2, v2QuoteFromV3Snapshot } from '@/lib/drywall/convertQuoteV2ToV3'
import { buildBidSnapshotForQuote } from '@/lib/drywall/bidSnapshot'
import { deriveDrywallScopeRevenue } from '@/lib/drywall/drywallScopeRevenue'
import { buildPoBidSnapshot, DEFAULT_PO_SCOPE_TEXT } from '@/lib/drywall/poBidSnapshot'
import { buildDrywallQuoteCalculations } from '@/lib/drywall/buildDrywallQuoteCalculations'
import { fetchOrgDrywallCatalogs } from '@/services/drywallCatalogsService'
import { deriveAddonFlagsFromData } from '@/lib/drywall/deriveAddonFlagsFromData'
import {
  archiveKeyForTimestamp,
  buildFreshV3FromSnapshot,
} from '@/lib/drywall/staleV3ConvertAudit'
import { isValidDrywallQuoteNumber } from '@/lib/drywall/drywallQuoteNumber'
import { normalizeQuoteToV2, quoteV2ToLegacyCompat } from '@/lib/drywall/drywallQuoteSchema'
import { fieldTakeoffWithTotals, mergeFieldTakeoff } from '@/lib/drywall/fieldMeasurementUtils'
import { generateFieldId } from '@/lib/drywall/fieldMeasurementUtils'
import {
  inferCommsAuthorRole,
  normalizeCommsLogEntry,
} from '@/lib/drywall/commsLogUtils'
import { isDrywallQuoteV3, normalizeDrywallProjectStatus } from '@/types/drywall'
import type {
  BidSnapshot,
  BelowFloorApproval,
  CommsLogAuthorRole,
  CreateDrywallProjectInput,
  CreateDrywallProjectFromPoInput,
  DrywallPoData,
  DrywallChangeOrder,
  DrywallCommsLogEntry,
  DrywallOrder,
  DrywallOrderItem,
  DrywallOrderStatus,
  DrywallProject,
  DrywallProjectListItem,
  DrywallProjectStatus,
  DrywallQuote,
  DrywallQuoteCalculations,
  DrywallQuoteOutcome,
  DrywallQuoteV2V3,
  DrywallQuoteV3,
  FieldTakeoff,
  ProductionTimestamps,
  QuoteOutcomeTimestamps,
  UpdateDrywallProjectInfoPatch,
} from '@/types/drywall'

export class DrywallProjectPermissionError extends Error {
  constructor(message = 'You do not have permission to modify this drywall project.') {
    super(message)
    this.name = 'DrywallProjectPermissionError'
  }
}

const DRYWALL_LIST_SELECT =
  'id, name, address, client, status, updated_at, app_scope:metadata->>app_scope, quote_sqft:metadata->legacy->quote->>sqft, quote_final_total:metadata->legacy->quote->calculations->>finalTotal, quote_total_amount:metadata->legacy->quote->>totalQuoteAmount, quote_version:metadata->legacy->quote->>version, quote_line_items:metadata->legacy->quote->lineItems, quote_outcome:metadata->legacy->quote->>outcome, quote_approved_at:metadata->legacy->quote->outcomeTimestamps->>approvedAt, quote_sent_at:metadata->legacy->quote->outcomeTimestamps->>sentAt, quote_lost_at:metadata->legacy->quote->outcomeTimestamps->>lostAt, quote_overhead_amt:metadata->legacy->quote->calculations->>overheadAmount, quote_profit_amt:metadata->legacy->quote->calculations->>profitAmount, quote_bid_snapshot:metadata->legacy->quote->bidSnapshot'

type DrywallListStageScalarsRow = {
  id: string
  field_measured_sqft: number | null
  field_takeoff_updated: string | null
  field_first_measurement_id: string | null
  order_first_id: string | null
}

const DRYWALL_DETAIL_SELECT =
  'id, name, address, client, status, type, organization_id, created_at, updated_at, metadata'

function isRlsOrPermissionError(error: { code?: string; message?: string }): boolean {
  const code = error.code ?? ''
  const msg = (error.message ?? '').toLowerCase()
  return (
    code === '42501' ||
    code === 'PGRST301' ||
    msg.includes('permission') ||
    msg.includes('row-level security') ||
    msg.includes('violates row-level')
  )
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (value == null) return ''
  return String(value).trim()
}

function formatListClient(client: unknown): string {
  if (typeof client === 'string') return client.trim()
  if (client && typeof client === 'object') {
    const c = client as Record<string, unknown>
    return (
      asString(c.name) ||
      asString(c.company) ||
      asString(c.email) ||
      ''
    )
  }
  return ''
}

function formatListAddress(address: unknown): string {
  if (typeof address === 'string') return address.trim()
  if (address && typeof address === 'object') {
    const a = address as Record<string, unknown>
    const street = asString(a.street) || asString(a.address) || asString(a.line1)
    const city = asString(a.city)
    const state = asString(a.state)
    const zip = asString(a.zip) || asString(a.zip_code)
    return [street, city, state, zip].filter(Boolean).join(', ')
  }
  return ''
}

function mapListRow(row: {
  id: string
  name: string
  address: unknown
  client: unknown
  status: string
  updated_at: string
  app_scope: unknown
  quote_sqft: unknown
  quote_final_total: unknown
  quote_total_amount: unknown
  quote_version?: unknown
  quote_line_items?: unknown
  quote_outcome?: unknown
  quote_approved_at?: unknown
  quote_sent_at?: unknown
  quote_lost_at?: unknown
  quote_overhead_amt?: unknown
  quote_profit_amt?: unknown
  quote_bid_snapshot?: unknown
},
  stageScalars?: DrywallListStageScalarsRow,
): DrywallProjectListItem | null {
  if (
    !belongsInDrywallWorkspaceFromListScalars(
      {
        app_scope: row.app_scope,
        quote_sqft: row.quote_sqft,
        quote_final_total: row.quote_final_total,
        quote_total_amount: row.quote_total_amount,
        quote_version: row.quote_version,
        quote_line_items: row.quote_line_items,
      },
      stageScalars,
    )
  ) {
    return null
  }
  const { sqft, quoteTotal } = extractListQuoteStats({
    quote_sqft: row.quote_sqft,
    quote_final_total: row.quote_final_total,
    quote_total_amount: row.quote_total_amount,
    quote_version: row.quote_version,
    quote_line_items: row.quote_line_items,
  })
  const fieldMeasuredSqft = coerceListNumber(stageScalars?.field_measured_sqft)
  const fieldTakeoffUpdated = asString(stageScalars?.field_takeoff_updated) || null
  const fieldFirstMeasurementId = asString(stageScalars?.field_first_measurement_id) || null
  const orderFirstId = asString(stageScalars?.order_first_id) || null

  const listScalars = {
    sqft,
    quoteTotal,
    fieldMeasuredSqft,
    fieldTakeoffUpdated,
    fieldFirstMeasurementId,
    orderFirstId,
  }

  return {
    id: row.id,
    name: row.name?.trim() || 'Untitled',
    client: formatListClient(row.client),
    address: formatListAddress(row.address),
    status: normalizeDrywallProjectStatus(row.status),
    updatedAt: new Date(row.updated_at),
    ...listScalars,
    quoteOutcome: row.quote_outcome ? normalizeQuoteOutcome(row.quote_outcome) : null,
    quoteApprovedAt: asString(row.quote_approved_at) || null,
    quoteSentAt: asString(row.quote_sent_at) || null,
    quoteLostAt: asString(row.quote_lost_at) || null,
    quoteOverheadAmount: coerceListNumber(row.quote_overhead_amt),
    quoteProfitAmount: coerceListNumber(row.quote_profit_amt),
    drywallScopeRevenue: deriveDrywallScopeRevenue(parseBidSnapshot(row.quote_bid_snapshot)),
  }
}

function coerceListNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Sqft + quote total from list scalar projections (no full quote JSONB). */
function extractListQuoteStats(scalars: {
  quote_sqft: unknown
  quote_final_total: unknown
  quote_total_amount: unknown
  quote_version?: unknown
  quote_line_items?: unknown
}): {
  sqft: number | null
  quoteTotal: number | null
} {
  const sqftFromV2 = coerceListNumber(scalars.quote_sqft)
  const sqftFromV3 = sumDrywallSqftFromLineItems(scalars.quote_line_items)
  const sqft = sqftFromV2 ?? sqftFromV3
  const finalTotal = coerceListNumber(scalars.quote_final_total)
  if (finalTotal != null) return { sqft, quoteTotal: finalTotal }
  const totalAmount = coerceListNumber(scalars.quote_total_amount)
  return { sqft, quoteTotal: totalAmount }
}

function sumDrywallSqftFromLineItems(items: unknown): number | null {
  if (!Array.isArray(items) || items.length === 0) return null
  let sum = 0
  let found = false
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const line = item as Record<string, unknown>
    if (line.type !== 'drywall') continue
    const qty = coerceListNumber(line.quantity)
    if (qty != null) {
      sum += qty
      found = true
    }
  }
  return found ? sum : null
}

function parseProductionTimestamps(legacy: Record<string, unknown>): ProductionTimestamps {
  const raw = legacy.productionTimestamps
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return { ...(raw as ProductionTimestamps) }
}

function parseCommsLog(legacy: Record<string, unknown>): DrywallCommsLogEntry[] {
  const raw = legacy.commsLog
  if (!Array.isArray(raw)) return []
  return raw
    .map((e) => normalizeCommsLogEntry(e))
    .filter((e): e is DrywallCommsLogEntry => e !== null)
}

function mapDetailRow(row: {
  id: string
  name: string
  address: unknown
  client: unknown
  status: string
  type: string
  organization_id: string
  created_at: string
  updated_at: string
  metadata: unknown
}): DrywallProject {
  const metadata =
    row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {}
  const legacyRaw = metadata.legacy
  const legacy =
    legacyRaw && typeof legacyRaw === 'object' && !Array.isArray(legacyRaw)
      ? (legacyRaw as Record<string, unknown>)
      : {}

  const legacyNotes = asString(legacy.notes)
  const topClient = formatListClient(row.client) || asString(legacy.client)
  const topAddress = formatListAddress(row.address) || asString(legacy.address)
  const topName = row.name?.trim() || asString(legacy.name) || 'Untitled'

  return {
    id: row.id,
    name: topName,
    client: topClient,
    address: topAddress,
    notes: legacyNotes,
    status: normalizeDrywallProjectStatus(row.status),
    type: row.type,
    organizationId: row.organization_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    metadata,
    legacy,
  }
}

function isGcLinkedMetadata(meta: Record<string, unknown>): boolean {
  const vis = meta.visibility as Record<string, unknown> | undefined
  if (vis?.gc === true || vis?.gc === 'true') return true
  if (meta.app_scope && meta.app_scope !== 'DRYWALL_ONLY') return true
  return false
}

/** Preserve dual-view wrapper when GC estimates exist (mirrors drywall supabaseSpine). */
function buildDrywallProjectMetadata(
  existingMetadata: Record<string, unknown> | null | undefined,
  legacyCopy: Record<string, unknown>,
  hasGcEstimate: boolean,
): Record<string, unknown> {
  const prev =
    existingMetadata && typeof existingMetadata === 'object' && !Array.isArray(existingMetadata)
      ? existingMetadata
      : {}
  const dual = isGcLinkedMetadata(prev) || hasGcEstimate

  if (dual) {
    const { app_scope: _removed, ...rest } = prev
    const source = prev.source
    return {
      ...rest,
      legacy: legacyCopy,
      source: source === 'drywall_app' || source === 'drywall_legacy' ? source : 'drywall_app',
      visibility: { gc: true, drywall: true },
    }
  }

  return {
    app_scope: 'DRYWALL_ONLY',
    visibility: { gc: false, drywall: true },
    source: 'drywall_app',
    legacy: legacyCopy,
  }
}

function mergeLegacyProjectInfo(
  prevLegacy: Record<string, unknown>,
  projectId: string,
  patch: UpdateDrywallProjectInfoPatch,
  now: string,
  status: string,
): Record<string, unknown> {
  return {
    ...prevLegacy,
    id: projectId,
    name: patch.name.trim(),
    client: patch.client.trim(),
    address: patch.address.trim(),
    notes: patch.notes.trim(),
    status,
    updatedAt: now,
  }
}

/** Projects in the Drywall workspace (`belongsInDrywallWorkspaceFromListScalars`). */
export async function fetchDrywallProjects(): Promise<DrywallProjectListItem[]> {
  if (!isOnlineMode()) return []

  const orgId = await requireUserOrgId()

  const { data, error } = await supabase
    .from('projects')
    .select(DRYWALL_LIST_SELECT)
    .eq('organization_id', orgId)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('fetchDrywallProjects:', error)
    throw new Error(error.message || 'Failed to load drywall projects')
  }

  type ListRow = {
    id: string
    name: string
    address: unknown
    client: unknown
    status: string
    updated_at: string
    app_scope: unknown
    quote_sqft: unknown
    quote_final_total: unknown
    quote_total_amount: unknown
    quote_version?: unknown
    quote_line_items?: unknown
  }
  const rows = (data ?? []) as ListRow[]
  const stageByProjectId = await loadDrywallListStageScalars(rows.map((r) => r.id))

  return rows
    .map((row) => mapListRow(row, stageByProjectId.get(row.id)))
    .filter((row): row is DrywallProjectListItem => row != null)
}

/** Field/order scalars via SQL — PostgREST .select() does not reliably return legacy.fieldTakeoff paths. */
async function loadDrywallListStageScalars(
  projectIds: string[],
): Promise<Map<string, DrywallListStageScalarsRow>> {
  const out = new Map<string, DrywallListStageScalarsRow>()
  if (projectIds.length === 0) return out

  const { data, error } = await supabase.rpc('drywall_list_stage_scalars', {
    project_ids: projectIds,
  })

  if (error) {
    console.warn('fetchDrywallProjects: drywall_list_stage_scalars', error.message)
    return out
  }

  for (const row of (data ?? []) as DrywallListStageScalarsRow[]) {
    out.set(row.id, row)
  }
  return out
}

export async function fetchDrywallProjectById(projectId: string): Promise<DrywallProject | null> {
  if (!isOnlineMode()) return null

  const orgId = await requireUserOrgId()

  const { data, error } = await supabase
    .from('projects')
    .select(DRYWALL_DETAIL_SELECT)
    .eq('id', projectId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (error) {
    console.error('fetchDrywallProjectById:', error)
    throw new Error(error.message || 'Failed to load drywall project')
  }

  if (!data) return null
  return mapDetailRow(data as Parameters<typeof mapDetailRow>[0])
}

export async function updateDrywallProjectInfo(
  projectId: string,
  patch: UpdateDrywallProjectInfoPatch,
): Promise<DrywallProject> {
  if (!isOnlineMode()) {
    throw new Error('Drywall projects require an online connection to Supabase.')
  }

  const orgId = await requireUserOrgId()
  const now = new Date().toISOString()

  const { data: existing, error: fetchError } = await supabase
    .from('projects')
    .select('id, name, status, metadata')
    .eq('id', projectId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (fetchError) {
    console.error('updateDrywallProjectInfo fetch:', fetchError)
    if (isRlsOrPermissionError(fetchError)) {
      throw new DrywallProjectPermissionError()
    }
    throw new Error(fetchError.message || 'Failed to load project for update')
  }

  if (!existing) {
    throw new Error('Project not found')
  }

  const prevMeta =
    existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
      ? (existing.metadata as Record<string, unknown>)
      : {}
  const prevLegacy =
    prevMeta.legacy && typeof prevMeta.legacy === 'object' && !Array.isArray(prevMeta.legacy)
      ? (prevMeta.legacy as Record<string, unknown>)
      : {}

  const nextStatus = (patch.status ?? existing.status) as DrywallProjectStatus | string
  const mergedLegacy = mergeLegacyProjectInfo(prevLegacy, projectId, patch, now, nextStatus)

  const { count: estimateCount } = await supabase
    .from('estimates')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)

  const mergedMetadata = buildDrywallProjectMetadata(
    prevMeta,
    mergedLegacy,
    (estimateCount ?? 0) > 0,
  )

  const { error: updateError } = await supabase
    .from('projects')
    .update({
      name: patch.name.trim(),
      client: patch.client.trim() || null,
      address: patch.address.trim() || null,
      status: nextStatus,
      updated_at: now,
      metadata: mergedMetadata,
    })
    .eq('id', projectId)
    .eq('organization_id', orgId)

  if (updateError) {
    console.error('updateDrywallProjectInfo:', updateError)
    if (isRlsOrPermissionError(updateError)) {
      throw new DrywallProjectPermissionError()
    }
    throw new Error(updateError.message || 'Failed to save project info')
  }

  const refreshed = await fetchDrywallProjectById(projectId)
  if (!refreshed) {
    throw new Error('Project saved but could not be reloaded')
  }
  return refreshed
}

export async function createDrywallProject(
  input: CreateDrywallProjectInput = {},
): Promise<string> {
  if (!isOnlineMode()) {
    throw new Error('Drywall projects require an online connection to Supabase.')
  }

  const orgId = await requireUserOrgId()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) {
    throw new Error('You must be signed in to create a drywall project.')
  }

  const now = new Date().toISOString()
  const name = (input.name?.trim() || 'New Drywall Project').trim()

  const row = {
    name,
    address: null,
    client: null,
    status: 'project-info' as const,
    organization_id: orgId,
    type: 'drywall',
    user_id: user.id,
    created_by: user.id,
    updated_at: now,
    metadata: {
      app_scope: 'DRYWALL_ONLY',
      visibility: { gc: false, drywall: true },
      source: 'drywall_app',
      legacy: {
        quote: {},
        name,
        client: '',
        address: '',
        notes: '',
        status: 'project-info',
        createdAt: now,
        updatedAt: now,
      },
    },
  }

  const { data, error } = await supabase.from('projects').insert(row).select('id').single()

  if (error) {
    console.error('createDrywallProject:', error)
    if (isRlsOrPermissionError(error)) {
      throw new DrywallProjectPermissionError('You do not have permission to create drywall projects.')
    }
    throw new Error(error.message || 'Failed to create drywall project')
  }

  if (!data?.id) {
    throw new Error('Failed to create drywall project')
  }

  return data.id
}

async function loadProjectLegacyForMerge(
  projectId: string,
  orgId: string,
): Promise<{
  prevMeta: Record<string, unknown>
  prevLegacy: Record<string, unknown>
  status: string
}> {
  const { data: existing, error: fetchError } = await supabase
    .from('projects')
    .select('id, status, metadata')
    .eq('id', projectId)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (fetchError) {
    console.error('loadProjectLegacyForMerge:', fetchError)
    if (isRlsOrPermissionError(fetchError)) throw new DrywallProjectPermissionError()
    throw new Error(fetchError.message || 'Failed to load project')
  }
  if (!existing) throw new Error('Project not found')

  const prevMeta =
    existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
      ? (existing.metadata as Record<string, unknown>)
      : {}
  const prevLegacy =
    prevMeta.legacy && typeof prevMeta.legacy === 'object' && !Array.isArray(prevMeta.legacy)
      ? (prevMeta.legacy as Record<string, unknown>)
      : {}

  return { prevMeta, prevLegacy, status: existing.status }
}

async function persistLegacyMetadata(
  projectId: string,
  orgId: string,
  mergedLegacy: Record<string, unknown>,
  prevMeta: Record<string, unknown>,
  status?: string,
): Promise<void> {
  const now = new Date().toISOString()
  const legacyCopy = { ...mergedLegacy, updatedAt: now }

  const { count: estimateCount } = await supabase
    .from('estimates')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)

  const mergedMetadata = buildDrywallProjectMetadata(
    prevMeta,
    legacyCopy,
    (estimateCount ?? 0) > 0,
  )

  const { error: updateError } = await supabase
    .from('projects')
    .update({
      ...(status ? { status } : {}),
      updated_at: now,
      metadata: mergedMetadata,
    })
    .eq('id', projectId)
    .eq('organization_id', orgId)

  if (updateError) {
    console.error('persistLegacyMetadata:', updateError)
    if (isRlsOrPermissionError(updateError)) throw new DrywallProjectPermissionError()
    throw new Error(updateError.message || 'Failed to save project')
  }
}

async function allocateNextDrywallQuoteNumber(orgId: string): Promise<string> {
  const { data, error } = await supabase.rpc('next_drywall_quote_number', { p_org: orgId })
  if (error) {
    console.error('allocateNextDrywallQuoteNumber:', error)
    throw new Error(error.message || 'Failed to assign drywall quote number')
  }
  const quoteNumber = typeof data === 'string' ? data.trim() : String(data ?? '').trim()
  if (!isValidDrywallQuoteNumber(quoteNumber)) {
    throw new Error('Invalid drywall quote number from server')
  }
  return quoteNumber
}

function quoteNumberFromLegacy(prevQuote: Record<string, unknown>): string | undefined {
  const stored = String(prevQuote.quoteNumber ?? '').trim()
  return isValidDrywallQuoteNumber(stored) ? stored : undefined
}

async function resolveDrywallQuoteNumber(
  orgId: string,
  quote: Pick<DrywallQuote | DrywallQuoteV3, 'quoteNumber'>,
  prevQuote: Record<string, unknown>,
): Promise<string> {
  const fromQuote = String(quote.quoteNumber ?? '').trim()
  if (isValidDrywallQuoteNumber(fromQuote)) return fromQuote
  const fromStored = quoteNumberFromLegacy(prevQuote)
  if (fromStored) return fromStored
  return allocateNextDrywallQuoteNumber(orgId)
}

/**
 * Assign DW-YYYY-NNN when missing — patches only quoteNumber in metadata (safe before PDF export).
 */
export async function assignDrywallQuoteNumberIfMissing(projectId: string): Promise<string> {
  if (!isOnlineMode()) throw new Error('Drywall quotes require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)
  const prevQuote =
    prevLegacy.quote && typeof prevLegacy.quote === 'object' && !Array.isArray(prevLegacy.quote)
      ? (prevLegacy.quote as Record<string, unknown>)
      : {}

  const existing = quoteNumberFromLegacy(prevQuote)
  if (existing) return existing

  const quoteNumber = await allocateNextDrywallQuoteNumber(orgId)
  const mergedLegacy = {
    ...prevLegacy,
    quote: {
      ...prevQuote,
      quoteNumber,
      version: 2,
    },
  }
  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta)
  return quoteNumber
}

/** Read metadata.legacy.quote; normalize to v2 flat shape for the builder. */
export async function fetchDrywallQuote(projectId: string): Promise<DrywallQuote> {
  const project = await fetchDrywallProjectById(projectId)
  if (!project) throw new Error('Project not found')
  const raw = project.legacy.quote
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const q = raw as Record<string, unknown>
    if (q.version === 3) {
      return v2QuoteFromV3Snapshot(q.legacyV2Snapshot)
    }
    if (q.version === 2) return hydrateDrywallQuote(q)
    const legacyCompat = quoteV2ToLegacyCompat(normalizeQuoteToV2(q))
    return hydrateDrywallQuote({ ...legacyCompat, version: 2 })
  }
  return hydrateDrywallQuote({})
}

/** Read quote as v2 or v3 discriminated union (Phase Q.B quote stage). */
export async function fetchDrywallQuoteV2V3(projectId: string): Promise<DrywallQuoteV2V3> {
  const project = await fetchDrywallProjectById(projectId)
  if (!project) throw new Error('Project not found')
  const raw = project.legacy.quote
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const q = raw as Record<string, unknown>
    if (q.version === 3) return hydrateDrywallQuoteV3(q)
    if (q.version === 2) return hydrateDrywallQuote(q)
    const legacyCompat = quoteV2ToLegacyCompat(normalizeQuoteToV2(q))
    return hydrateDrywallQuote({ ...legacyCompat, version: 2 })
  }
  return hydrateDrywallQuote({})
}

/** JSONB-merge v3 quote into metadata.legacy (preserves fieldTakeoff, orders, etc.). */
export async function saveDrywallQuoteV3(projectId: string, quote: DrywallQuoteV3): Promise<void> {
  if (!isOnlineMode()) throw new Error('Drywall quotes require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)

  const prevQuote =
    prevLegacy.quote && typeof prevLegacy.quote === 'object' && !Array.isArray(prevLegacy.quote)
      ? (prevLegacy.quote as Record<string, unknown>)
      : {}

  const quoteNumber = await resolveDrywallQuoteNumber(orgId, quote, prevQuote)
  const prepared = prepareDrywallQuoteV3ForSave(quote)
  const mergedQuote: Record<string, unknown> = {
    ...prevQuote,
    ...prepared,
    quoteNumber,
    version: 3,
  }
  delete mergedQuote.default_board_id
  delete mergedQuote.default_finish_scope_id

  const mergedLegacy = {
    ...prevLegacy,
    quote: mergedQuote,
  }

  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta)
}

/** Re-run buildV3FromV2 from legacyV2Snapshot; archive current v3 quote first. */
export async function refreshQuoteV3FromSnapshot(projectId: string): Promise<DrywallQuoteV3> {
  if (!isOnlineMode()) throw new Error('Drywall quotes require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)

  const prevQuote =
    prevLegacy.quote && typeof prevLegacy.quote === 'object' && !Array.isArray(prevLegacy.quote)
      ? (prevLegacy.quote as Record<string, unknown>)
      : {}

  if (prevQuote.version !== 3) {
    throw new Error('Project is not on quote v3')
  }
  if (!prevQuote.legacyV2Snapshot) {
    throw new Error('No v2 snapshot to refresh from')
  }

  const archiveKey = archiveKeyForTimestamp(new Date().toISOString())
  const fresh = buildFreshV3FromSnapshot(prevQuote, prevQuote.legacyV2Snapshot)
  const quoteNumber = await resolveDrywallQuoteNumber(orgId, fresh, prevQuote)
  const prepared = prepareDrywallQuoteV3ForSave({ ...fresh, quoteNumber })

  const mergedQuote: Record<string, unknown> = {
    ...prepared,
    quoteNumber,
    version: 3,
    legacyV2Snapshot: prevQuote.legacyV2Snapshot,
  }

  const mergedLegacy = {
    ...prevLegacy,
    [archiveKey]: prevQuote,
    quote: mergedQuote,
  }

  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta)
  return hydrateDrywallQuoteV3(mergedQuote)
}

/**
 * Archive current v3 quote and restore the v2 rollback snapshot as the active quote.
 * Use when v3 math/UI is blocking (e.g. acoustic ceiling) and v2 is needed to finish.
 */
export async function revertQuoteToV2(projectId: string): Promise<DrywallQuote> {
  if (!isOnlineMode()) throw new Error('Drywall quotes require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)

  const prevQuote =
    prevLegacy.quote && typeof prevLegacy.quote === 'object' && !Array.isArray(prevLegacy.quote)
      ? (prevLegacy.quote as Record<string, unknown>)
      : {}

  if (prevQuote.version !== 3) {
    throw new Error('Project is not on quote v3')
  }
  if (!prevQuote.legacyV2Snapshot) {
    throw new Error('No v2 snapshot on this project — cannot restore v2 quote.')
  }

  const archiveKey = archiveKeyForTimestamp(new Date().toISOString())
  let v2 = deriveAddonFlagsFromData(v2QuoteFromV3Snapshot(prevQuote.legacyV2Snapshot))
  const quoteNumber = await resolveDrywallQuoteNumber(orgId, v2, prevQuote)
  v2 = { ...v2, quoteNumber, version: 2 }
  const calculations = buildDrywallQuoteCalculations(v2)

  const mergedLegacy = {
    ...prevLegacy,
    [archiveKey]: prevQuote,
    quote: {
      ...v2,
      calculations,
      version: 2,
      preferV2QuoteEditor: true,
    },
  }

  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta)
  return hydrateDrywallQuote(mergedLegacy.quote)
}

/** One-way convert v2 → v3 with legacyV2Snapshot preserved. */
export async function convertQuoteToV3(projectId: string): Promise<DrywallQuoteV3> {
  if (!isOnlineMode()) throw new Error('Drywall quotes require an online connection.')

  const current = await fetchDrywallQuoteV2V3(projectId)
  if (isDrywallQuoteV3(current)) return current

  const v3 = buildV3FromV2(current)
  await saveDrywallQuoteV3(projectId, v3)
  return v3
}

/** JSONB-merge quote into metadata.legacy (preserves fieldTakeoff, orders, etc.). */
export async function saveDrywallQuote(projectId: string, quote: DrywallQuote): Promise<void> {
  if (!isOnlineMode()) throw new Error('Drywall quotes require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)

  const prevQuote =
    prevLegacy.quote && typeof prevLegacy.quote === 'object' && !Array.isArray(prevLegacy.quote)
      ? (prevLegacy.quote as Record<string, unknown>)
      : {}

  const { calculations: _dropCalc, ...quoteFields } = quote
  const quoteNumber = await resolveDrywallQuoteNumber(orgId, quote, prevQuote)
  const mergedQuote = {
    ...prevQuote,
    ...quoteFields,
    quoteNumber,
    version: 2,
  }

  const mergedLegacy = {
    ...prevLegacy,
    quote: mergedQuote,
  }

  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta)
}

/** Persist computed calculations blob on legacy.quote (for hasDrywallWorkspaceData). */
export async function saveDrywallQuoteCalculations(
  projectId: string,
  calculations: DrywallQuoteCalculations,
): Promise<void> {
  if (!isOnlineMode()) throw new Error('Drywall quotes require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)

  const prevQuote =
    prevLegacy.quote && typeof prevLegacy.quote === 'object' && !Array.isArray(prevLegacy.quote)
      ? (prevLegacy.quote as Record<string, unknown>)
      : {}

  const mergedLegacy = {
    ...prevLegacy,
    quote: {
      ...prevQuote,
      calculations,
      version: 2,
    },
  }

  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta)
}

/** Save quote + advance workflow status (e.g. quote → field-measurement). */
export async function saveDrywallQuoteAndAdvance(
  projectId: string,
  quote: DrywallQuote,
  calculations: DrywallQuoteCalculations,
  nextStatus: DrywallProjectStatus,
): Promise<void> {
  if (!isOnlineMode()) throw new Error('Drywall quotes require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)

  const prevQuote =
    prevLegacy.quote && typeof prevLegacy.quote === 'object' && !Array.isArray(prevLegacy.quote)
      ? (prevLegacy.quote as Record<string, unknown>)
      : {}

  const { calculations: _c, ...quoteFields } = quote
  const quoteNumber = await resolveDrywallQuoteNumber(orgId, quote, prevQuote)
  const mergedLegacy = {
    ...prevLegacy,
    status: nextStatus,
    quote: {
      ...prevQuote,
      ...quoteFields,
      quoteNumber,
      calculations,
      version: 2,
    },
  }

  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta, nextStatus)
}

/** Read metadata.legacy.fieldTakeoff (normalized defaults). */
export async function fetchFieldTakeoff(projectId: string): Promise<FieldTakeoff> {
  const project = await fetchDrywallProjectById(projectId)
  if (!project) throw new Error('Project not found')

  const legacy = project.legacy
  const prepared =
    legacy.fieldMeasurementPrep &&
    typeof legacy.fieldMeasurementPrep === 'object' &&
    !Array.isArray(legacy.fieldMeasurementPrep)
      ? (legacy.fieldMeasurementPrep as Record<string, unknown>)
      : {}

  const raw =
    legacy.fieldTakeoff && typeof legacy.fieldTakeoff === 'object' && !Array.isArray(legacy.fieldTakeoff)
      ? (legacy.fieldTakeoff as FieldTakeoff)
      : null

  return fieldTakeoffWithTotals(mergeFieldTakeoff(raw, prepared))
}

/** JSONB-merge fieldTakeoff into metadata.legacy (preserves quote, orders, etc.). */
export async function saveFieldTakeoff(projectId: string, takeoff: FieldTakeoff): Promise<void> {
  if (!isOnlineMode()) throw new Error('Field measurement requires an online connection.')

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)

  const prevTakeoff =
    prevLegacy.fieldTakeoff &&
    typeof prevLegacy.fieldTakeoff === 'object' &&
    !Array.isArray(prevLegacy.fieldTakeoff)
      ? (prevLegacy.fieldTakeoff as Record<string, unknown>)
      : {}

  const withTotals = fieldTakeoffWithTotals(takeoff)
  const mergedTakeoff = {
    ...prevTakeoff,
    ...withTotals,
    updatedAt: new Date().toISOString(),
  }

  const mergedLegacy = {
    ...prevLegacy,
    fieldTakeoff: mergedTakeoff,
  }

  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta)
}

/** Save field takeoff and advance workflow to Order. */
export async function saveFieldTakeoffAndAdvance(
  projectId: string,
  takeoff: FieldTakeoff,
): Promise<void> {
  if (!isOnlineMode()) throw new Error('Field measurement requires an online connection.')

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)

  const prevTakeoff =
    prevLegacy.fieldTakeoff &&
    typeof prevLegacy.fieldTakeoff === 'object' &&
    !Array.isArray(prevLegacy.fieldTakeoff)
      ? (prevLegacy.fieldTakeoff as Record<string, unknown>)
      : {}

  const withTotals = fieldTakeoffWithTotals(takeoff)
  const nextStatus: DrywallProjectStatus = 'order'
  const mergedLegacy = {
    ...prevLegacy,
    status: nextStatus,
    fieldTakeoff: {
      ...prevTakeoff,
      ...withTotals,
      updatedAt: new Date().toISOString(),
    },
  }

  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta, nextStatus)
}

function normalizeOrderItem(raw: unknown): DrywallOrderItem | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const description = asString(r.description)
  if (!description && !r.quantity) return null
  return {
    id: asString(r.id) || generateFieldId(),
    description: description || 'Item',
    quantity: r.quantity != null ? String(r.quantity) : '',
    unit: asString(r.unit) || 'pcs',
    notes: asString(r.notes) || undefined,
  }
}

function normalizeOrder(raw: unknown): DrywallOrder | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const id = asString(r.id) || generateFieldId()
  const items = Array.isArray(r.items)
    ? r.items.map(normalizeOrderItem).filter((i): i is DrywallOrderItem => i != null)
    : []
  return {
    id,
    orderNumber: asString(r.orderNumber) || undefined,
    supplier: asString(r.supplier) || undefined,
    supplierContact: asString(r.supplierContact) || undefined,
    deliveryDate: asString(r.deliveryDate) || undefined,
    deliveryAddress: asString(r.deliveryAddress) || undefined,
    notes: asString(r.notes) || undefined,
    items,
    status: (asString(r.status) || 'draft') as DrywallOrderStatus,
    createdAt: asString(r.createdAt) || undefined,
    updatedAt: asString(r.updatedAt) || undefined,
  }
}

function normalizeChangeOrder(raw: unknown): DrywallChangeOrder | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  return {
    id: asString(r.id) || generateFieldId(),
    changeOrderNumber: asString(r.changeOrderNumber) || undefined,
    status: asString(r.status) || 'draft',
    reason: asString(r.reason) || undefined,
    scopeChanges: asString(r.scopeChanges) || undefined,
    requestedAmount: r.requestedAmount != null ? String(r.requestedAmount) : undefined,
    notes: asString(r.notes) || undefined,
    createdAt: asString(r.createdAt) || undefined,
    updatedAt: asString(r.updatedAt) || undefined,
  }
}

function parseLegacyOrders(legacy: Record<string, unknown>): DrywallOrder[] {
  if (!Array.isArray(legacy.orders)) return []
  return legacy.orders.map(normalizeOrder).filter((o): o is DrywallOrder => o != null)
}

function parseLegacyChangeOrders(legacy: Record<string, unknown>): DrywallChangeOrder[] {
  if (!Array.isArray(legacy.changeOrders)) return []
  return legacy.changeOrders
    .map(normalizeChangeOrder)
    .filter((co): co is DrywallChangeOrder => co != null)
}

/** Read metadata.legacy.orders (normalized). */
export async function fetchOrders(projectId: string): Promise<DrywallOrder[]> {
  const project = await fetchDrywallProjectById(projectId)
  if (!project) throw new Error('Project not found')
  return parseLegacyOrders(project.legacy)
}

/** Read metadata.legacy.changeOrders (normalized). */
export async function fetchChangeOrders(projectId: string): Promise<DrywallChangeOrder[]> {
  const project = await fetchDrywallProjectById(projectId)
  if (!project) throw new Error('Project not found')
  return parseLegacyChangeOrders(project.legacy)
}

/** JSONB-merge a single order into legacy.orders (preserves quote, fieldTakeoff, siblings). */
export async function saveOrder(projectId: string, order: DrywallOrder): Promise<void> {
  if (!isOnlineMode()) throw new Error('Orders require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)
  const orders = parseLegacyOrders(prevLegacy)
  const now = new Date().toISOString()
  const payload: DrywallOrder = {
    ...order,
    updatedAt: now,
    createdAt: order.createdAt || now,
    items: order.items ?? [],
  }
  const idx = orders.findIndex((o) => o.id === order.id)
  const nextOrders = idx >= 0 ? orders.map((o, i) => (i === idx ? payload : o)) : [...orders, payload]

  const mergedLegacy = { ...prevLegacy, orders: nextOrders }
  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta)
}

/** Explicit-save snapshot: replace orders + changeOrders arrays (JSONB-merge siblings). */
export async function saveOrderStageSnapshot(
  projectId: string,
  snapshot: { orders: DrywallOrder[]; changeOrders: DrywallChangeOrder[] },
): Promise<void> {
  if (!isOnlineMode()) throw new Error('Orders require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)
  const now = new Date().toISOString()
  const orders = snapshot.orders.map((o) => ({
    ...o,
    updatedAt: o.updatedAt || now,
    createdAt: o.createdAt || now,
  }))
  const changeOrders = snapshot.changeOrders.map((co) => ({
    ...co,
    updatedAt: co.updatedAt || now,
    createdAt: co.createdAt || now,
  }))

  const mergedLegacy = {
    ...prevLegacy,
    orders,
    changeOrders,
  }
  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta)
}

/** Remove one order by id from legacy.orders. */
export async function deleteOrder(projectId: string, orderId: string): Promise<void> {
  if (!isOnlineMode()) throw new Error('Orders require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)
  const orders = parseLegacyOrders(prevLegacy).filter((o) => o.id !== orderId)
  const mergedLegacy = { ...prevLegacy, orders }
  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta)
}

/** Update order status (convenience wrapper around saveOrder). */
export async function markOrderStatus(
  projectId: string,
  orderId: string,
  status: DrywallOrderStatus,
): Promise<void> {
  const orgId = await requireUserOrgId()
  const { prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)
  const orders = parseLegacyOrders(prevLegacy)
  const existing = orders.find((o) => o.id === orderId)
  if (!existing) throw new Error('Order not found')
  await saveOrder(projectId, { ...existing, status })
}

/** Update workflow stage from list card status pill (status column + legacy mirror). */
export async function updateDrywallProjectStatus(
  projectId: string,
  status: DrywallProjectStatus,
): Promise<void> {
  if (!isOnlineMode()) {
    throw new Error('Drywall projects require an online connection to Supabase.')
  }

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)
  const mergedLegacy = { ...prevLegacy, status }
  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta, status)
}

/** @deprecated use markFullyClosed — legacy shortcut that sets `closed` + closedAt from Order. */
export async function markDrywallProjectComplete(projectId: string): Promise<void> {
  if (!isOnlineMode()) throw new Error('Drywall projects require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)
  const now = new Date().toISOString()
  const timestamps = parseProductionTimestamps(prevLegacy)
  const nextStatus: DrywallProjectStatus = 'closed'
  const mergedLegacy = {
    ...prevLegacy,
    status: nextStatus,
    productionTimestamps: { ...timestamps, closedAt: now },
  }
  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta, nextStatus)
}

/** Revert complete → active at Order stage (preserves quote, fieldTakeoff, orders, etc.). */
/** @deprecated use revertCloseoutToProductionComplete or revertProductionStarted */
export async function revertDrywallProjectComplete(projectId: string): Promise<void> {
  if (!isOnlineMode()) throw new Error('Drywall projects require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy, status: rawStatus } = await loadProjectLegacyForMerge(
    projectId,
    orgId,
  )
  const normalized = normalizeDrywallProjectStatus(rawStatus)
  if (normalized !== 'closed') {
    throw new Error('Project is not closed')
  }
  const nextStatus: DrywallProjectStatus = 'order'
  const timestamps = parseProductionTimestamps(prevLegacy)
  const { closedAt: _cleared, ...restTimestamps } = timestamps
  const mergedLegacy = {
    ...prevLegacy,
    status: nextStatus,
    productionTimestamps: restTimestamps,
  }
  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta, nextStatus)
}

function assertProjectStatus(
  rawStatus: string,
  expected: DrywallProjectStatus | DrywallProjectStatus[],
): void {
  const normalized = normalizeDrywallProjectStatus(rawStatus)
  const allowed = Array.isArray(expected) ? expected : [expected]
  if (!allowed.includes(normalized)) {
    throw new Error(
      `Invalid status transition: expected ${allowed.join(' or ')}, got ${normalized}`,
    )
  }
}

export async function markProductionStarted(projectId: string): Promise<void> {
  if (!isOnlineMode()) throw new Error('Drywall projects require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy, status: rawStatus } = await loadProjectLegacyForMerge(
    projectId,
    orgId,
  )
  assertProjectStatus(rawStatus, 'order')
  const now = new Date().toISOString()
  const timestamps = parseProductionTimestamps(prevLegacy)
  const nextStatus: DrywallProjectStatus = 'production'
  const mergedLegacy = {
    ...prevLegacy,
    status: nextStatus,
    productionTimestamps: { ...timestamps, productionStartedAt: now },
  }
  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta, nextStatus)
}

export async function markProductionComplete(projectId: string): Promise<void> {
  if (!isOnlineMode()) throw new Error('Drywall projects require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy, status: rawStatus } = await loadProjectLegacyForMerge(
    projectId,
    orgId,
  )
  assertProjectStatus(rawStatus, 'production')
  const now = new Date().toISOString()
  const timestamps = parseProductionTimestamps(prevLegacy)
  const nextStatus: DrywallProjectStatus = 'production-complete'
  const mergedLegacy = {
    ...prevLegacy,
    status: nextStatus,
    productionTimestamps: { ...timestamps, productionCompletedAt: now },
  }
  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta, nextStatus)
}

export async function markFullyClosed(projectId: string): Promise<void> {
  if (!isOnlineMode()) throw new Error('Drywall projects require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy, status: rawStatus } = await loadProjectLegacyForMerge(
    projectId,
    orgId,
  )
  assertProjectStatus(rawStatus, 'production-complete')
  const now = new Date().toISOString()
  const timestamps = parseProductionTimestamps(prevLegacy)
  const nextStatus: DrywallProjectStatus = 'closed'
  const mergedLegacy = {
    ...prevLegacy,
    status: nextStatus,
    productionTimestamps: { ...timestamps, closedAt: now },
  }
  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta, nextStatus)
}

export async function revertProductionStarted(projectId: string): Promise<void> {
  if (!isOnlineMode()) throw new Error('Drywall projects require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy, status: rawStatus } = await loadProjectLegacyForMerge(
    projectId,
    orgId,
  )
  assertProjectStatus(rawStatus, 'production')
  const timestamps = parseProductionTimestamps(prevLegacy)
  const { productionStartedAt: _cleared, ...restTimestamps } = timestamps
  const nextStatus: DrywallProjectStatus = 'order'
  const mergedLegacy = {
    ...prevLegacy,
    status: nextStatus,
    productionTimestamps: restTimestamps,
  }
  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta, nextStatus)
}

export async function revertProductionComplete(projectId: string): Promise<void> {
  if (!isOnlineMode()) throw new Error('Drywall projects require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy, status: rawStatus } = await loadProjectLegacyForMerge(
    projectId,
    orgId,
  )
  assertProjectStatus(rawStatus, 'production-complete')
  const timestamps = parseProductionTimestamps(prevLegacy)
  const { productionCompletedAt: _cleared, ...restTimestamps } = timestamps
  const nextStatus: DrywallProjectStatus = 'production'
  const mergedLegacy = {
    ...prevLegacy,
    status: nextStatus,
    productionTimestamps: restTimestamps,
  }
  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta, nextStatus)
}

export async function revertCloseoutToProductionComplete(projectId: string): Promise<void> {
  if (!isOnlineMode()) throw new Error('Drywall projects require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy, status: rawStatus } = await loadProjectLegacyForMerge(
    projectId,
    orgId,
  )
  assertProjectStatus(rawStatus, 'closed')
  const timestamps = parseProductionTimestamps(prevLegacy)
  const { closedAt: _cleared, ...restTimestamps } = timestamps
  const nextStatus: DrywallProjectStatus = 'production-complete'
  const mergedLegacy = {
    ...prevLegacy,
    status: nextStatus,
    productionTimestamps: restTimestamps,
  }
  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta, nextStatus)
}

export async function fetchDrywallCommsLog(projectId: string): Promise<DrywallCommsLogEntry[]> {
  const project = await fetchDrywallProjectById(projectId)
  if (!project) return []
  return parseCommsLog(project.legacy).sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  )
}

export async function addCommsLogEntry(
  projectId: string,
  body: string,
  author: string,
  authorUserId?: string,
  authorRole?: CommsLogAuthorRole,
): Promise<DrywallCommsLogEntry> {
  if (!isOnlineMode()) throw new Error('Drywall projects require an online connection.')

  const trimmed = body.trim()
  if (!trimmed) throw new Error('Entry body is required')

  const profile = await getCurrentUserProfile()
  const resolvedRole = inferCommsAuthorRole(profile, authorRole)
  const isCrewPoster = profile?.roles?.includes('crew') ?? false

  if (isCrewPoster) {
    const { data, error } = await supabase.rpc('append_drywall_comms_log_entry', {
      p_project_id: projectId,
      p_body: trimmed,
      p_author: author.trim() || 'Unknown',
      p_author_user_id: authorUserId ?? profile?.id ?? null,
      p_author_role: resolvedRole,
    })
    if (error) {
      if (isRlsOrPermissionError(error)) throw new DrywallProjectPermissionError()
      throw new Error(error.message || 'Failed to add comms entry')
    }
    const entry = normalizeCommsLogEntry(data)
    if (!entry) throw new Error('Failed to parse comms entry from server')
    return entry
  }

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)
  const entry: DrywallCommsLogEntry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    author: author.trim() || 'Unknown',
    authorRole: resolvedRole,
    ...(authorUserId ? { authorUserId } : {}),
    body: trimmed,
  }
  const existing = parseCommsLog(prevLegacy)
  const mergedLegacy = {
    ...prevLegacy,
    commsLog: [entry, ...existing],
  }
  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta)
  return entry
}

export function getProductionTimestampsFromLegacy(
  legacy: Record<string, unknown>,
): ProductionTimestamps {
  return parseProductionTimestamps(legacy)
}

function parseQuoteRecord(legacy: Record<string, unknown>): Record<string, unknown> {
  const raw = legacy.quote
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) }
  }
  return {}
}

function normalizeQuoteOutcome(value: unknown): DrywallQuoteOutcome {
  if (value === 'sent' || value === 'approved' || value === 'lost' || value === 'drafted') {
    return value
  }
  return 'drafted'
}

function parseQuoteOutcomeTimestamps(raw: unknown): QuoteOutcomeTimestamps {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return { ...(raw as QuoteOutcomeTimestamps) }
}

function parseBidSnapshot(raw: unknown): BidSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const snap = raw as BidSnapshot
  if (typeof snap.total !== 'number' || typeof snap.at !== 'string' || !snap.payload) return null
  return snap
}

export function getQuoteOutcomeFromLegacy(legacy: Record<string, unknown>): {
  outcome: DrywallQuoteOutcome
  outcomeTimestamps: QuoteOutcomeTimestamps
  bidSnapshot: BidSnapshot | null
  outcomeReason: string | null
} {
  const q = parseQuoteRecord(legacy)
  return {
    outcome: normalizeQuoteOutcome(q.outcome),
    outcomeTimestamps: parseQuoteOutcomeTimestamps(q.outcomeTimestamps),
    bidSnapshot: parseBidSnapshot(q.bidSnapshot),
    outcomeReason: asString(q.outcomeReason) || null,
  }
}

async function persistQuoteOutcomePatch(
  projectId: string,
  quotePatch: Record<string, unknown>,
  projectStatus?: DrywallProjectStatus,
  clearKeys: string[] = [],
): Promise<void> {
  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)
  const prevQuote = parseQuoteRecord(prevLegacy)
  const mergedQuote = { ...prevQuote, ...quotePatch }
  for (const key of clearKeys) {
    delete mergedQuote[key]
  }
  const mergedLegacy = {
    ...prevLegacy,
    quote: mergedQuote,
    ...(projectStatus ? { status: projectStatus } : {}),
  }
  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta, projectStatus)
}

export async function markQuoteSent(projectId: string, effectiveDate?: string): Promise<void> {
  if (!isOnlineMode()) throw new Error('Drywall quotes require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)
  const prevQuote = parseQuoteRecord(prevLegacy)
  const outcome = normalizeQuoteOutcome(prevQuote.outcome)
  if (outcome !== 'drafted') {
    throw new Error(`Cannot mark sent: quote outcome is "${outcome}"`)
  }

  const quote = await fetchDrywallQuoteV2V3(projectId)
  const catalogs = isDrywallQuoteV3(quote) ? await fetchOrgDrywallCatalogs() : null
  const now = new Date().toISOString()
  const sentAt = effectiveDate ?? now
  const bidSnapshot = await buildBidSnapshotForQuote(quote, catalogs, now)

  await persistQuoteOutcomePatch(projectId, {
    outcome: 'sent',
    outcomeTimestamps: {
      ...parseQuoteOutcomeTimestamps(prevQuote.outcomeTimestamps),
      sentAt,
    },
    bidSnapshot,
  })
}

export async function markQuoteApproved(projectId: string, effectiveDate?: string): Promise<void> {
  if (!isOnlineMode()) throw new Error('Drywall quotes require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevLegacy, status: rawStatus } = await loadProjectLegacyForMerge(projectId, orgId)
  const prevQuote = parseQuoteRecord(prevLegacy)
  const outcome = normalizeQuoteOutcome(prevQuote.outcome)
  if (outcome !== 'sent') {
    throw new Error(`Cannot mark approved: quote outcome is "${outcome}"`)
  }

  const now = new Date().toISOString()
  const approvedAt = effectiveDate ?? now
  const projectStatus = normalizeDrywallProjectStatus(rawStatus)
  const advanceStatus = projectStatus === 'quote' ? ('field-measurement' as const) : undefined

  await persistQuoteOutcomePatch(
    projectId,
    {
      outcome: 'approved',
      outcomeTimestamps: {
        ...parseQuoteOutcomeTimestamps(prevQuote.outcomeTimestamps),
        approvedAt,
      },
    },
    advanceStatus,
  )
}

export async function markQuoteLost(
  projectId: string,
  reason?: string,
  effectiveDate?: string,
): Promise<void> {
  if (!isOnlineMode()) throw new Error('Drywall quotes require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)
  const prevQuote = parseQuoteRecord(prevLegacy)
  const outcome = normalizeQuoteOutcome(prevQuote.outcome)
  if (outcome !== 'sent') {
    throw new Error(`Cannot mark lost: quote outcome is "${outcome}"`)
  }

  const now = new Date().toISOString()
  const lostAt = effectiveDate ?? now
  const trimmedReason = reason?.trim()

  await persistQuoteOutcomePatch(
    projectId,
    {
      outcome: 'lost',
      outcomeTimestamps: {
        ...parseQuoteOutcomeTimestamps(prevQuote.outcomeTimestamps),
        lostAt,
      },
      ...(trimmedReason ? { outcomeReason: trimmedReason } : {}),
    },
    undefined,
    trimmedReason ? [] : ['outcomeReason'],
  )
}

export async function unlockQuoteForRevision(projectId: string): Promise<void> {
  if (!isOnlineMode()) throw new Error('Drywall quotes require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)
  const prevQuote = parseQuoteRecord(prevLegacy)
  const outcome = normalizeQuoteOutcome(prevQuote.outcome)
  if (outcome === 'drafted') {
    throw new Error('Quote is already in drafted state')
  }
  if (!['sent', 'approved', 'lost'].includes(outcome)) {
    throw new Error(`Cannot unlock quote with outcome "${outcome}"`)
  }

  await persistQuoteOutcomePatch(
    projectId,
    {
      outcome: 'drafted',
      outcomeTimestamps: {},
    },
    undefined,
    ['bidSnapshot', 'outcomeReason'],
  )
}

function parsePoData(raw: unknown): DrywallPoData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const po = raw as DrywallPoData
  if (typeof po.poReference !== 'string' || typeof po.intakeAt !== 'string') return null
  if (typeof po.customerSqft !== 'number' || typeof po.agreedUnitRate !== 'number') return null
  if (typeof po.scopeText !== 'string') return null
  return po
}

export function getPoDataFromLegacy(legacy: Record<string, unknown>): DrywallPoData | null {
  return parsePoData(legacy.po)
}

export function getIntakeSourceFromLegacy(
  legacy: Record<string, unknown>,
): 'po' | 'quote' | null {
  const source = legacy.intakeSource
  if (source === 'po' || source === 'quote') return source
  return null
}

function validatePoIntakeFields(input: CreateDrywallProjectFromPoInput): {
  name: string
  client: string
  address: string
  poReference: string
  customerSqft: number
  agreedUnitRate: number
  scopeText: string
  expectedStartDate?: string
  customerContact?: string
} {
  const name = input.name.trim()
  const client = input.client.trim()
  const address = (input.address ?? '').trim()
  const poReference = input.poData.poReference.trim()
  const customerSqft = Number(input.poData.customerSqft)
  const agreedUnitRate = Number(input.poData.agreedUnitRate)
  const scopeText = (input.poData.scopeText?.trim() || DEFAULT_PO_SCOPE_TEXT).trim()
  const expectedStartDate = input.poData.expectedStartDate?.trim() || undefined
  const customerContact = input.poData.customerContact?.trim() || undefined

  if (!name) throw new Error('Project name is required')
  if (!client) throw new Error('Customer / client is required')
  if (!poReference) throw new Error('PO number is required')
  if (!Number.isFinite(customerSqft) || customerSqft <= 0) {
    throw new Error('Customer sqft must be greater than 0')
  }
  if (!Number.isFinite(agreedUnitRate) || agreedUnitRate <= 0) {
    throw new Error('Agreed unit rate must be greater than 0')
  }

  return {
    name,
    client,
    address,
    poReference,
    customerSqft,
    agreedUnitRate,
    scopeText,
    expectedStartDate,
    customerContact,
  }
}

function buildPoQuoteLegacy(now: string, bidSnapshot: BidSnapshot): Record<string, unknown> {
  return {
    version: 3,
    outcome: 'approved',
    outcomeTimestamps: { approvedAt: now },
    bidSnapshot,
    lineItems: [],
    alternates: [],
    prep_clean_rate: 0,
    overhead_pct: 0,
    profit_pct: 0,
    sales_tax_pct: 0,
    updatedAt: now,
  }
}

export async function createDrywallProjectFromPo(
  input: CreateDrywallProjectFromPoInput,
): Promise<string> {
  if (!isOnlineMode()) {
    throw new Error('Drywall projects require an online connection to Supabase.')
  }

  const orgId = await requireUserOrgId()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) {
    throw new Error('You must be signed in to create a drywall project.')
  }

  const fields = validatePoIntakeFields(input)
  const now = new Date().toISOString()
  const bidSnapshot = buildPoBidSnapshot(
    fields.customerSqft,
    fields.agreedUnitRate,
    fields.scopeText,
    now,
  )

  const po: DrywallPoData = {
    poReference: fields.poReference,
    customerSqft: fields.customerSqft,
    agreedUnitRate: fields.agreedUnitRate,
    scopeText: fields.scopeText,
    intakeAt: now,
    ...(fields.expectedStartDate ? { expectedStartDate: fields.expectedStartDate } : {}),
    ...(fields.customerContact ? { customerContact: fields.customerContact } : {}),
  }

  const row = {
    name: fields.name,
    address: fields.address || null,
    client: fields.client,
    status: 'field-measurement' as const,
    organization_id: orgId,
    type: 'drywall',
    user_id: user.id,
    created_by: user.id,
    updated_at: now,
    metadata: {
      app_scope: 'DRYWALL_ONLY',
      visibility: { gc: false, drywall: true },
      source: 'drywall_app',
      legacy: {
        name: fields.name,
        client: fields.client,
        address: fields.address,
        notes: '',
        status: 'field-measurement',
        createdAt: now,
        updatedAt: now,
        intakeSource: 'po',
        poReference: fields.poReference,
        po,
        quote: buildPoQuoteLegacy(now, bidSnapshot),
      },
    },
  }

  const { data, error } = await supabase.from('projects').insert(row).select('id').single()

  if (error) {
    console.error('createDrywallProjectFromPo:', error)
    if (isRlsOrPermissionError(error)) {
      throw new DrywallProjectPermissionError('You do not have permission to create drywall projects.')
    }
    throw new Error(error.message || 'Failed to create project from PO')
  }

  if (!data?.id) {
    throw new Error('Failed to create project from PO')
  }

  return data.id
}

export async function updateDrywallProjectPoData(
  projectId: string,
  input: CreateDrywallProjectFromPoInput,
): Promise<void> {
  if (!isOnlineMode()) {
    throw new Error('Drywall projects require an online connection to Supabase.')
  }

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)

  if (prevLegacy.intakeSource !== 'po') {
    throw new Error('This project was not created from a purchase order')
  }

  const existingPo = parsePoData(prevLegacy.po)
  if (!existingPo) {
    throw new Error('PO data not found on this project')
  }

  const fields = validatePoIntakeFields(input)
  const now = new Date().toISOString()
  const bidSnapshot = buildPoBidSnapshot(
    fields.customerSqft,
    fields.agreedUnitRate,
    fields.scopeText,
    now,
  )

  const prevQuote = parseQuoteRecord(prevLegacy)
  const po: DrywallPoData = {
    poReference: fields.poReference,
    customerSqft: fields.customerSqft,
    agreedUnitRate: fields.agreedUnitRate,
    scopeText: fields.scopeText,
    intakeAt: existingPo.intakeAt,
    lastEditedAt: now,
    ...(fields.expectedStartDate ? { expectedStartDate: fields.expectedStartDate } : {}),
    ...(fields.customerContact ? { customerContact: fields.customerContact } : {}),
  }

  const mergedLegacy = {
    ...prevLegacy,
    name: fields.name,
    client: fields.client,
    address: fields.address,
    poReference: fields.poReference,
    po,
    quote: {
      ...prevQuote,
      outcome: 'approved',
      bidSnapshot,
      updatedAt: now,
    },
    updatedAt: now,
  }

  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta)

  const { error: columnError } = await supabase
    .from('projects')
    .update({
      name: fields.name,
      client: fields.client,
      address: fields.address || null,
      updated_at: now,
    })
    .eq('id', projectId)
    .eq('organization_id', orgId)

  if (columnError) {
    console.error('updateDrywallProjectPoData columns:', columnError)
    if (isRlsOrPermissionError(columnError)) throw new DrywallProjectPermissionError()
    throw new Error(columnError.message || 'Failed to update project columns')
  }
}

function parseBelowFloorApproval(raw: unknown): BelowFloorApproval | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as BelowFloorApproval
  if (
    typeof o.approvedAt !== 'string' ||
    typeof o.approvedBy !== 'string' ||
    typeof o.trigger !== 'string' ||
    typeof o.reason !== 'string'
  ) {
    return null
  }
  if (typeof o.marginAtApproval !== 'number' || typeof o.bidTotal !== 'number') return null
  if (typeof o.estimatedCost !== 'number' || typeof o.floorTarget !== 'number') return null
  if (o.trigger !== 'quote_send' && o.trigger !== 'field_measurement_to_order') return null
  return o
}

export function getBelowFloorApprovalsFromLegacy(
  legacy: Record<string, unknown>,
): BelowFloorApproval[] {
  const raw = legacy.below_floor_approvals
  if (!Array.isArray(raw)) return []
  return raw.map(parseBelowFloorApproval).filter((x): x is BelowFloorApproval => x != null)
}

export async function recordBelowFloorApproval(
  projectId: string,
  entry: Omit<BelowFloorApproval, 'approvedAt' | 'approvedBy' | 'approvedByName'>,
): Promise<BelowFloorApproval> {
  if (!isOnlineMode()) {
    throw new Error('Drywall projects require an online connection to Supabase.')
  }

  const orgId = await requireUserOrgId()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.id) {
    throw new Error('You must be signed in to record a below-floor approval.')
  }

  let approvedByName: string | undefined
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .maybeSingle()
  approvedByName = profile?.full_name?.trim() || profile?.email?.trim() || undefined

  const approved: BelowFloorApproval = {
    ...entry,
    approvedAt: new Date().toISOString(),
    approvedBy: user.id,
    ...(approvedByName ? { approvedByName } : {}),
  }

  const { prevMeta, prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)
  const mergedLegacy = {
    ...prevLegacy,
    below_floor_approvals: [...getBelowFloorApprovalsFromLegacy(prevLegacy), approved],
  }
  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta)
  return approved
}

/** Hard-delete a drywall project. Cascades supabase FKs; orphans any payroll-tagged entries. */
export async function deleteDrywallProject(projectId: string): Promise<void> {
  if (!isOnlineMode()) {
    throw new Error('Drywall projects require an online connection to Supabase.')
  }

  const orgId = await requireUserOrgId()
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
    .eq('organization_id', orgId)

  if (error) {
    console.error('deleteDrywallProject:', error)
    if (isRlsOrPermissionError(error)) {
      throw new DrywallProjectPermissionError(
        'You do not have permission to delete this project.',
      )
    }
    throw new Error(error.message || 'Failed to delete project')
  }
}
