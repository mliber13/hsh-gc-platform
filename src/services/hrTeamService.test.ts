/**
 * The org_team read cache.
 *
 * Seventeen callers read this roster and some screens read it twice in one render pass, so it
 * is cached. A stale roster is a worse bug than a slow one — someone adds an employee and
 * cannot assign them — so the invalidation is tested, not assumed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const maybeSingle = vi.fn()
const eq = vi.fn(() => ({ maybeSingle }))
const select = vi.fn(() => ({ eq }))
const upsert = vi.fn(() => Promise.resolve({ error: null }))
const from = vi.fn(() => ({ select, upsert }))

vi.mock('@/lib/supabase', () => ({
  supabase: { from: (...args: unknown[]) => from(...(args as [])) },
  isOnlineMode: () => true,
}))

vi.mock('./userService', () => ({
  requireUserOrgId: () => Promise.resolve(ORG),
}))

const ORG = 'org-1'

function payload(names: string[]) {
  return {
    employees: names.map((name, i) => ({ id: `e${i}`, name })),
    contractors1099: [],
    positions: [],
  }
}

/** Count only the reads; saveTeam also calls from('org_team') to write. */
function readCount(): number {
  return select.mock.calls.length
}

describe('fetchTeam caching', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    maybeSingle.mockResolvedValue({ data: { payload: payload(['Shane Plats']) }, error: null })
    const { invalidateTeamCache } = await import('./hrTeamService')
    invalidateTeamCache()
  })

  it('reads once and serves the second caller from cache', async () => {
    const { fetchTeam } = await import('./hrTeamService')
    const a = await fetchTeam()
    const b = await fetchTeam()
    expect(readCount()).toBe(1)
    expect(a.employees[0].name).toBe('Shane Plats')
    expect(b.employees[0].name).toBe('Shane Plats')
  })

  /**
   * The case the schedule item dialog actually hits: two assignee pickers mounting together.
   * A TTL alone would not help — both start before either finishes — so concurrent callers
   * have to collapse onto one in-flight request.
   */
  it('collapses concurrent callers onto one request', async () => {
    const { fetchTeam } = await import('./hrTeamService')
    const [a, b, c] = await Promise.all([fetchTeam(), fetchTeam(), fetchTeam()])
    expect(readCount()).toBe(1)
    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('re-reads after the cache is invalidated', async () => {
    const { fetchTeam, invalidateTeamCache } = await import('./hrTeamService')
    await fetchTeam()
    maybeSingle.mockResolvedValue({
      data: { payload: payload(['Shane Plats', 'Joshua Hamrick']) },
      error: null,
    })
    invalidateTeamCache()
    const after = await fetchTeam()
    expect(readCount()).toBe(2)
    expect(after.employees).toHaveLength(2)
  })

  // Adding someone then not being able to assign them is the failure this prevents.
  it('saveTeam invalidates, so an edit is visible immediately', async () => {
    const { fetchTeam, saveTeam } = await import('./hrTeamService')
    await fetchTeam()
    maybeSingle.mockResolvedValue({
      data: { payload: payload(['Shane Plats', 'Richard Petrock']) },
      error: null,
    })
    await saveTeam(payload(['Shane Plats', 'Richard Petrock']) as never)
    const after = await fetchTeam()
    expect(readCount()).toBe(2)
    expect(after.employees.map((e) => e.name)).toContain('Richard Petrock')
  })

  it('does not cache a failed read', async () => {
    const { fetchTeam } = await import('./hrTeamService')
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(fetchTeam()).rejects.toThrow('boom')

    maybeSingle.mockResolvedValue({ data: { payload: payload(['Shane Plats']) }, error: null })
    const after = await fetchTeam()
    expect(after.employees).toHaveLength(1)
    expect(readCount()).toBe(2)
  })
})
