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

/** GC Platform project list — matches SQL: not DRYWALL_ONLY and gc !== false. */
export function isVisibleInGcApp(
  metadata: ProjectMetadata | null | undefined,
): boolean {
  if (!metadata || Object.keys(metadata).length === 0) return true
  const vis = metadata.visibility as Record<string, unknown> | undefined
  if (visibilityFlag(vis, 'gc') === false) return false
  if (metadata.app_scope === 'DRYWALL_ONLY') return false
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
