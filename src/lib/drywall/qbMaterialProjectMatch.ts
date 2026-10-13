/**
 * Which project a drywall QuickBooks material line belongs to, and whether it may be counted
 * without a person looking at it.
 *
 * The QuickBooks edge function lets a line through when its job name matches any project the
 * drywall division can see — including projects shared with the GC (`visibility.drywall`). The
 * client then matched only against the drywall WORKSPACE list, which needs a drywall quote, so on
 * the five shared residential jobs (115/135 Hillside, 122/158 Sherman, 308 Pritchard) every line
 * was stored unmatched and $18,399.84 of accepted drywall board never reached drywall cost.
 *
 * Widening the match is not enough on its own: a matched line used to be accepted automatically.
 * On a shared job most lines are GC material (Keim lumber, Trumbull, Baird — 211 of them were
 * rejected by hand), so auto-accepting there would put GC cost back into drywall Financials
 * through QuickBooks. So:
 *   - drywall-type projects: matched and accepted, as before;
 *   - GC-type projects drywall can see: matched, but left pending for a person to confirm —
 *     including ones with a drywall quote, which are in the workspace (see autoAcceptsQbMaterial).
 * A line already reviewed keeps its decision either way.
 */

/** Project columns needed to tell whether the drywall division can see it. */
export interface DrywallVisibilityRow {
  id: string
  name: string | null
  type?: string | null
  visibility?: { drywall?: unknown; gc?: unknown } | null
  app_scope?: string | null
  source?: string | null
}

/**
 * The edge function's drywall-visibility rule (qb-get-job-transactions `isDrywallVisible`), less
 * its quote-data clause — projects with drywall quote data are in the workspace list already.
 */
export function isDrywallVisibleProject(row: DrywallVisibilityRow): boolean {
  const vis = row.visibility ?? undefined
  const drywall = vis?.drywall
  if (drywall === true || drywall === 'true') return true
  if (row.app_scope === 'DRYWALL_ONLY') return true
  if (row.source === 'drywall_app' || row.source === 'drywall_legacy') return true
  if (drywall === false || drywall === 'false') return false
  if (row.type === 'drywall' && vis?.gc !== false && vis?.gc !== 'false') return true
  return false
}

export interface QbMaterialProjectMatch {
  id: string
  name: string
  /** True only for drywall-type projects; GC-type projects wait for review. */
  autoAccept: boolean
}

/**
 * Whether a project's QuickBooks material may be counted without review: only a project the
 * drywall division created (type `drywall`). A GC-type project the drywall side also works on
 * carries GC material on the same QuickBooks job, so every line waits for a person.
 *
 * Not "is it in the drywall workspace": Goodwill Multi has a drywall quote, so it IS in the
 * workspace, and on 2026-10-13 all 33 of its lines — Keim lumber, Carter Lumber, Home Depot
 * among them — were accepted as drywall cost on the first sync. Not `visibility.gc` either:
 * ~115 drywall-created projects still carry gc:true from the merge. On that date type split
 * them exactly: 180 `drywall`, and 7 GC-type projects visible to drywall (the six with GC
 * estimates and GC actuals, plus 27 West Main St). Unknown type waits — loudly, in the queue.
 */
export function autoAcceptsQbMaterial(type: string | null | undefined): boolean {
  return type === 'drywall'
}

/**
 * Index projects by normalised name. Workspace projects win a name clash; any drywall-visible
 * project matches. Auto-accept follows the project's type, wherever it matched.
 */
export function buildQbMaterialProjectIndex(
  workspaceProjects: { id: string; name: string }[],
  drywallVisibleProjects: DrywallVisibilityRow[],
  normalize: (name: string) => string,
): Map<string, QbMaterialProjectMatch> {
  const typeById = new Map(drywallVisibleProjects.map((p) => [p.id, p.type ?? null]))
  const index = new Map<string, QbMaterialProjectMatch>()
  for (const p of workspaceProjects) {
    const key = normalize(p.name)
    if (key && !index.has(key)) {
      index.set(key, { id: p.id, name: p.name, autoAccept: autoAcceptsQbMaterial(typeById.get(p.id)) })
    }
  }
  for (const p of drywallVisibleProjects) {
    if (!isDrywallVisibleProject(p)) continue
    const name = (p.name ?? '').trim()
    const key = normalize(name)
    if (key && !index.has(key)) index.set(key, { id: p.id, name, autoAccept: autoAcceptsQbMaterial(p.type) })
  }
  return index
}
