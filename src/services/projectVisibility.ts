// Shared rules for which projects appear in GC vs Drywall app lists.

export type ProjectMetadata = Record<string, unknown>

export function visibilityFlag(
  visibility: Record<string, unknown> | undefined,
  key: 'gc' | 'drywall',
): boolean | undefined {
  if (!visibility) return undefined
  const val = visibility[key]
  if (val === true || val === 'true') return true
  if (val === false || val === 'false') return false
  return undefined
}

/** Normalize metadata from a list row (full column or PostgREST JSON path fields). */
export function parseListRowMetadata(row: {
  metadata?: unknown
  app_scope?: unknown
  visibility?: unknown
  source?: unknown
}): ProjectMetadata {
  let meta = row.metadata
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta) as ProjectMetadata
    } catch {
      meta = null
    }
  }
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    return meta as ProjectMetadata
  }
  const fromPaths: ProjectMetadata = {}
  if (row.app_scope != null) fromPaths.app_scope = row.app_scope
  if (row.visibility != null) fromPaths.visibility = row.visibility
  if (row.source != null) fromPaths.source = row.source
  return fromPaths
}

export function isDrywallOriginMetadata(
  metadata: ProjectMetadata | null | undefined,
): boolean {
  const source = metadata?.source
  return source === 'drywall_app' || source === 'drywall_legacy'
}

export type GcVisibilityOptions = {
  /** GC estimate trade count; when 0 on a drywall-origin project, hide from GC list (empty estimate shell). */
  gcTradeCount?: number
}

/** GC Platform project list — not DRYWALL_ONLY, gc !== false, and not accidental dual-view. */
export function isVisibleInGcApp(
  metadata: ProjectMetadata | null | undefined,
  options?: GcVisibilityOptions,
): boolean {
  if (!metadata || Object.keys(metadata).length === 0) return true
  const vis = metadata.visibility as Record<string, unknown> | undefined
  if (visibilityFlag(vis, 'gc') === false) return false
  if (metadata.app_scope === 'DRYWALL_ONLY') return false
  // Drywall app sets visibility.gc when any estimates row exists — including empty shells
  // created by opening the project in GC once. Hide unless GC estimate has trades.
  if (
    isDrywallOriginMetadata(metadata) &&
    options?.gcTradeCount !== undefined &&
    options.gcTradeCount === 0
  ) {
    return false
  }
  return true
}

/** Drywall app project list. */
export function isVisibleInDrywallApp(
  metadata: ProjectMetadata | null | undefined,
  projectType?: string | null,
): boolean {
  if (!metadata || Object.keys(metadata).length === 0) {
    return projectType === 'drywall'
  }
  const vis = metadata.visibility as Record<string, unknown> | undefined
  if (visibilityFlag(vis, 'drywall') === true) return true
  if (metadata.app_scope === 'DRYWALL_ONLY') return true
  const source = metadata.source
  if (source === 'drywall_app' || source === 'drywall_legacy') return true
  if (visibilityFlag(vis, 'drywall') === false) return false
  if (projectType === 'drywall' && visibilityFlag(vis, 'gc') !== false) return true
  return false
}

/**
 * Finer-grained signal: project has real drywall quote content in `metadata.legacy.quote`.
 *
 * Use for analytics, quote-stage gating, or "has substantive work" checks — not for the
 * workspace list (see `belongsInDrywallWorkspace`).
 *
 * Returns true when quote is a non-null object with at least one substantive canonical
 * field: sqft, non-empty breakdowns, calculations blob, or totalQuoteAmount.
 * `version` alone (e.g. `{ version: 2 }` or default shell with empty rates) does not count.
 */
export function hasDrywallWorkspaceData(
  metadata: ProjectMetadata | null | undefined,
): boolean {
  if (!metadata) return false

  const legacy = metadata.legacy
  if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return false

  const quote = (legacy as Record<string, unknown>).quote
  if (!quote || typeof quote !== 'object' || Array.isArray(quote)) return false

  const q = quote as Record<string, unknown>
  if (hasPopulatedSqft(q.sqft)) return true
  if (hasNonEmptyBreakdowns(q.breakdowns)) return true
  if (hasPopulatedCalculations(q.calculations)) return true
  if (hasPopulatedTotalQuoteAmount(q.totalQuoteAmount)) return true
  if (q.version === 3 && hasNonEmptyLineItems(q.lineItems)) return true

  return false
}

/**
 * Canonical surfacing criterion when full metadata (or quote object) is available.
 *
 * A project belongs in `/drywall` when it is drywall-scoped OR has real quote content:
 * - `metadata.app_scope === 'DRYWALL_ONLY'` (includes new in-progress projects with empty quote), OR
 * - `hasDrywallWorkspaceData(metadata)` (dual-view rows like Goodwill Multi with quote but no DRYWALL_ONLY scope).
 *
 * For the list fetch, use `belongsInDrywallWorkspaceFromListScalars` (scalar projection only).
 * Does not auto-promote GC-only projects that only have a drywall trade — those lack both signals.
 */
export function belongsInDrywallWorkspace(
  metadata: ProjectMetadata | null | undefined,
): boolean {
  if (!metadata) return false
  if (metadata.app_scope === 'DRYWALL_ONLY') return true
  return hasDrywallWorkspaceData(metadata)
}

/** Scalar fields from `fetchDrywallProjects` list projection (no full quote JSONB). */
export type DrywallListQuoteScalars = {
  app_scope?: unknown
  quote_sqft?: unknown
  quote_final_total?: unknown
  quote_total_amount?: unknown
  quote_version?: unknown
  /** True when RPC reports non-empty v3 line items (avoids shipping the array). */
  quote_has_line_items?: boolean
  /** @deprecated Prefer quote_has_line_items — full arrays must not be selected on the list path. */
  quote_line_items?: unknown
}

/** Field/order signals from `drywall_list_stage_scalars` RPC. */
export type DrywallListStageScalars = {
  field_measured_sqft?: unknown
  field_first_measurement_id?: unknown
  order_first_id?: unknown
}

function hasDrywallListStageData(stage?: DrywallListStageScalars): boolean {
  if (!stage) return false
  if (hasPopulatedSqft(stage.field_measured_sqft)) return true
  const measurementId =
    typeof stage.field_first_measurement_id === 'string'
      ? stage.field_first_measurement_id.trim()
      : ''
  if (measurementId) return true
  const orderId =
    typeof stage.order_first_id === 'string' ? stage.order_first_id.trim() : ''
  return Boolean(orderId)
}

/**
 * Drywall list surfacing using narrow PostgREST scalar paths only.
 *
 * Approximation of `belongsInDrywallWorkspace`: `DRYWALL_ONLY` OR
 * (sqft > 0 OR finalTotal > 0 OR totalQuoteAmount > 0 OR v3 line items) OR
 * field/order stage data (projects that progressed past quote without quote scalars).
 *
 * Does not inspect breakdowns or non-empty calculations objects without
 * `finalTotal` — use `hasDrywallWorkspaceData` when the full quote is loaded.
 */
export function belongsInDrywallWorkspaceFromListScalars(
  row: DrywallListQuoteScalars,
  stage?: DrywallListStageScalars,
): boolean {
  if (row.app_scope === 'DRYWALL_ONLY') return true
  if (hasDrywallListStageData(stage)) return true
  if (
    String(row.quote_version ?? '') === '3' &&
    (row.quote_has_line_items === true || hasNonEmptyLineItems(row.quote_line_items))
  ) {
    return true
  }
  return (
    hasPopulatedSqft(row.quote_sqft) ||
    hasPopulatedTotalQuoteAmount(row.quote_final_total) ||
    hasPopulatedTotalQuoteAmount(row.quote_total_amount)
  )
}

function hasNonEmptyLineItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

function hasPopulatedSqft(value: unknown): boolean {
  if (value == null || value === '') return false
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n > 0
}

function hasNonEmptyBreakdowns(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

function hasPopulatedCalculations(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.keys(value as Record<string, unknown>).length > 0
}

function hasPopulatedTotalQuoteAmount(value: unknown): boolean {
  if (value == null || value === '') return false
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n > 0
}
