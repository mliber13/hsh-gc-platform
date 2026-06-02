// ============================================================================
// Drywall workspace — projects list + Project Info CRUD (Phase B)
// ============================================================================

import { supabase, isOnlineMode } from '@/lib/supabase'
import { belongsInDrywallWorkspace } from '@/services/projectVisibility'
import { requireUserOrgId } from '@/services/userService'
import { hydrateDrywallQuote } from '@/lib/drywall/createEmptyDrywallQuote'
import { normalizeQuoteToV2, quoteV2ToLegacyCompat } from '@/lib/drywall/drywallQuoteSchema'
import { fieldTakeoffWithTotals, mergeFieldTakeoff } from '@/lib/drywall/fieldMeasurementUtils'
import { generateFieldId } from '@/lib/drywall/fieldMeasurementUtils'
import type {
  CreateDrywallProjectInput,
  DrywallChangeOrder,
  DrywallOrder,
  DrywallOrderItem,
  DrywallOrderStatus,
  DrywallProject,
  DrywallProjectListItem,
  DrywallProjectStatus,
  DrywallQuote,
  DrywallQuoteCalculations,
  FieldTakeoff,
  UpdateDrywallProjectInfoPatch,
} from '@/types/drywall'

export class DrywallProjectPermissionError extends Error {
  constructor(message = 'You do not have permission to modify this drywall project.') {
    super(message)
    this.name = 'DrywallProjectPermissionError'
  }
}

const DRYWALL_LIST_SELECT =
  'id, name, address, client, status, updated_at, app_scope:metadata->>app_scope, legacy_quote:metadata->legacy->quote'

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
  legacy_quote: unknown
}): DrywallProjectListItem | null {
  if (
    !belongsInDrywallWorkspace({
      app_scope: row.app_scope,
      legacy: { quote: row.legacy_quote },
    })
  ) {
    return null
  }
  const { sqft, quoteTotal } = extractListQuoteStats(row.legacy_quote)

  return {
    id: row.id,
    name: row.name?.trim() || 'Untitled',
    client: formatListClient(row.client),
    address: formatListAddress(row.address),
    status: row.status,
    updatedAt: new Date(row.updated_at),
    sqft,
    quoteTotal,
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

/** Sqft + quote total from the list projection's legacy quote subtree (no full metadata load). */
function extractListQuoteStats(legacyQuote: unknown): {
  sqft: number | null
  quoteTotal: number | null
} {
  if (!legacyQuote || typeof legacyQuote !== 'object' || Array.isArray(legacyQuote)) {
    return { sqft: null, quoteTotal: null }
  }
  const quote = legacyQuote as Record<string, unknown>
  const sqft = coerceListNumber(quote.sqft)
  const calculations = quote.calculations
  if (calculations && typeof calculations === 'object' && !Array.isArray(calculations)) {
    const finalTotal = coerceListNumber(
      (calculations as Record<string, unknown>).finalTotal,
    )
    if (finalTotal != null) return { sqft, quoteTotal: finalTotal }
  }
  return { sqft, quoteTotal: null }
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
    status: row.status,
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

/** Projects in the Drywall workspace (`belongsInDrywallWorkspace`). */
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

  return (data ?? [])
    .map((row) => mapListRow(row as Parameters<typeof mapListRow>[0]))
    .filter((row): row is DrywallProjectListItem => row != null)
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

/** Read metadata.legacy.quote; normalize to v2 flat shape for the builder. */
export async function fetchDrywallQuote(projectId: string): Promise<DrywallQuote> {
  const project = await fetchDrywallProjectById(projectId)
  if (!project) throw new Error('Project not found')
  const raw = project.legacy.quote
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const q = raw as Record<string, unknown>
    if (q.version === 2) return hydrateDrywallQuote(q)
    const legacyCompat = quoteV2ToLegacyCompat(normalizeQuoteToV2(q))
    return hydrateDrywallQuote({ ...legacyCompat, version: 2 })
  }
  return hydrateDrywallQuote({})
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
  const mergedQuote = {
    ...prevQuote,
    ...quoteFields,
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
  const mergedLegacy = {
    ...prevLegacy,
    status: nextStatus,
    quote: {
      ...prevQuote,
      ...quoteFields,
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

/** Mark drywall job complete (final stage — no further workflow). */
export async function markDrywallProjectComplete(projectId: string): Promise<void> {
  if (!isOnlineMode()) throw new Error('Drywall projects require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)
  const nextStatus: DrywallProjectStatus = 'complete'
  const mergedLegacy = { ...prevLegacy, status: nextStatus }
  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta, nextStatus)
}

/** Revert complete → active at Order stage (preserves quote, fieldTakeoff, orders, etc.). */
export async function revertDrywallProjectComplete(projectId: string): Promise<void> {
  if (!isOnlineMode()) throw new Error('Drywall projects require an online connection.')

  const orgId = await requireUserOrgId()
  const { prevMeta, prevLegacy } = await loadProjectLegacyForMerge(projectId, orgId)
  const nextStatus: DrywallProjectStatus = 'order'
  const mergedLegacy = { ...prevLegacy, status: nextStatus }
  await persistLegacyMetadata(projectId, orgId, mergedLegacy, prevMeta, nextStatus)
}
