import { describe, expect, it } from 'vitest'
import { resolveQbProject, type QbMatchableProject } from './qbProjectMatch'

const GC: QbMatchableProject = { id: 'gc', name: 'Concord Dr' }
const DRYWALL: QbMatchableProject = { id: 'dry', name: 'Concord Dr' }
const OTHER: QbMatchableProject = { id: 'other', name: 'Bay Village - Dills' }
const LINKED: QbMatchableProject = { id: 'linked', name: 'Kent - Murphy', qbProjectId: 'qb-77' }

describe('resolveQbProject', () => {
  it('refuses to guess when two projects share the job name', () => {
    // Live today: "Concord Dr" is both a drywall quote and a GC estimating project. The old
    // Array.find picked whichever came first and pre-selected it.
    const match = resolveQbProject([GC, DRYWALL, OTHER], { qbProjectName: 'Concord Dr' })
    expect(match.ambiguous).toBe(true)
    expect(match.project).toBeNull()
    expect(match.candidates.map((p) => p.id)).toEqual(['gc', 'dry'])
  })

  it('matches a single name', () => {
    const match = resolveQbProject([GC, OTHER], { qbProjectName: 'Bay Village - Dills' })
    expect(match.project?.id).toBe('other')
    expect(match.ambiguous).toBe(false)
    expect(match.how).toBe('name')
  })

  it('prefers the QuickBooks id over any name', () => {
    // An explicit link is not ambiguous even when the name collides.
    const match = resolveQbProject([GC, DRYWALL, LINKED], {
      qbProjectId: 'qb-77',
      qbProjectName: 'Concord Dr',
    })
    expect(match.project?.id).toBe('linked')
    expect(match.how).toBe('qb-id')
    expect(match.ambiguous).toBe(false)
  })

  it('ignores case and surrounding space', () => {
    const match = resolveQbProject([OTHER], { qbProjectName: '  bay village - dills ' })
    expect(match.project?.id).toBe('other')
  })

  it('matches nothing on an empty or unknown job name', () => {
    expect(resolveQbProject([GC, OTHER], {}).project).toBeNull()
    expect(resolveQbProject([GC, OTHER], { qbProjectName: '   ' }).how).toBe('none')
    expect(resolveQbProject([GC, OTHER], { qbProjectName: 'Nowhere Rd' }).ambiguous).toBe(false)
  })

  it('does not treat a blank qbProjectId as a link', () => {
    // Every project with no QuickBooks link would otherwise match a transaction with none.
    const unlinked: QbMatchableProject = { id: 'u', name: 'X', qbProjectId: null }
    expect(resolveQbProject([unlinked], { qbProjectId: undefined, qbProjectName: 'X' }).how).toBe(
      'name',
    )
  })
})
