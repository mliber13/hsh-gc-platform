import { matchPath } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import {
  allSectionsInOrder,
  DASHBOARD_GROUP_ORDER,
  DASHBOARD_SECTIONS,
  sectionById,
  sectionsForGroup,
} from './registry'

// The hub is one route with an optional segment rather than two routes sharing an element,
// so that opening and closing a KPI does not remount DashboardPage and refetch every
// candidate project's metadata. If this pattern ever stops matching the bare hub path, the
// overview 404s — worth a test rather than a reading of the router docs.
const HUB_ROUTE = '/drywall/dashboard/:sectionId?'

describe('KPI hub route pattern', () => {
  it('matches the bare hub path with no section', () => {
    const match = matchPath(HUB_ROUTE, '/drywall/dashboard')
    expect(match).not.toBeNull()
    expect(match?.params.sectionId).toBeUndefined()
  })

  it('matches an open section and yields its id', () => {
    const match = matchPath(HUB_ROUTE, '/drywall/dashboard/takeoff-accuracy')
    expect(match?.params.sectionId).toBe('takeoff-accuracy')
  })

  it('matches every registered section id', () => {
    for (const section of DASHBOARD_SECTIONS) {
      const match = matchPath(HUB_ROUTE, `/drywall/dashboard/${section.id}`)
      expect(match?.params.sectionId, section.id).toBe(section.id)
    }
  })

  it('does not swallow a deeper path', () => {
    expect(matchPath(HUB_ROUTE, '/drywall/dashboard/a/b')).toBeNull()
  })
})

describe('sectionById', () => {
  it('resolves a known id', () => {
    expect(sectionById('takeoff-accuracy')?.title).toBe('Takeoff Accuracy')
  })

  // A stale bookmark from a renamed section should land on the overview, not throw.
  it('returns undefined for an unknown or missing id', () => {
    expect(sectionById('no-such-kpi')).toBeUndefined()
    expect(sectionById(undefined)).toBeUndefined()
  })
})

describe('DASHBOARD_SECTIONS', () => {
  it('gives every section a summary, so the overview can represent it', () => {
    for (const section of DASHBOARD_SECTIONS) {
      expect(typeof section.summary, section.id).toBe('function')
    }
  })

  it('has unique ids, since the id is the route segment', () => {
    const ids = DASHBOARD_SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('puts every section in a known group', () => {
    for (const section of DASHBOARD_SECTIONS) {
      expect(DASHBOARD_GROUP_ORDER, section.id).toContain(section.group)
    }
  })
})

describe('allSectionsInOrder', () => {
  it('covers every section exactly once', () => {
    const ordered = allSectionsInOrder()
    expect(ordered).toHaveLength(DASHBOARD_SECTIONS.length)
    expect(new Set(ordered.map((s) => s.id)).size).toBe(DASHBOARD_SECTIONS.length)
  })

  it('reads in group order, then section order within a group', () => {
    const ordered = allSectionsInOrder()
    const expected = DASHBOARD_GROUP_ORDER.flatMap((group) =>
      sectionsForGroup(group).map((s) => s.id),
    )
    expect(ordered.map((s) => s.id)).toEqual(expected)
  })
})
