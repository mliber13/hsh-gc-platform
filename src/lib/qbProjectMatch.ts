// ============================================================================
// Matching a QuickBooks job to a project, without guessing (P1-GC-2)
// ============================================================================

/** The fields of a project this match needs. */
export type QbMatchableProject = {
  id: string
  name?: string | null
  qbProjectId?: string | null
}

export type QbProjectMatch = {
  /** The project to pre-select, or null when the operator has to choose. */
  project: QbMatchableProject | null
  /** True when the job name matched more than one project, so nothing is pre-selected. */
  ambiguous: boolean
  /** Every project the name matched — shown to the operator when ambiguous. */
  candidates: QbMatchableProject[]
  how: 'qb-id' | 'name' | 'none'
}

function key(name: string | null | undefined): string {
  return String(name ?? '').trim().toLowerCase()
}

/**
 * Resolve a QuickBooks job to one project.
 *
 * The id match is exact and always wins. The name fallback used `Array.find`, which returns
 * the first of however many matched and pre-selected it — so with two projects of the same
 * name an expense could be filed against the wrong job, and the operator would be accepting
 * a default rather than making a choice. "Concord Dr" is live twice today: a drywall quote
 * and a GC estimating project.
 *
 * On an ambiguous name this pre-selects nothing and reports the candidates, which is the one
 * case where making the operator choose is cheaper than getting it wrong.
 */
export function resolveQbProject(
  projects: QbMatchableProject[],
  txn: { qbProjectId?: string | null; qbProjectName?: string | null },
): QbProjectMatch {
  const byId = txn.qbProjectId
    ? projects.find((p) => p.qbProjectId && p.qbProjectId === txn.qbProjectId)
    : undefined
  if (byId) return { project: byId, ambiguous: false, candidates: [byId], how: 'qb-id' }

  const name = key(txn.qbProjectName)
  if (!name) return { project: null, ambiguous: false, candidates: [], how: 'none' }

  const matches = projects.filter((p) => key(p.name) === name)
  if (matches.length === 1) {
    return { project: matches[0], ambiguous: false, candidates: matches, how: 'name' }
  }
  if (matches.length > 1) {
    return { project: null, ambiguous: true, candidates: matches, how: 'name' }
  }
  return { project: null, ambiguous: false, candidates: [], how: 'none' }
}
