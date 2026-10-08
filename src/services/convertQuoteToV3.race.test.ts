/**
 * Converting a new project's quote to v3 under a double mount.
 *
 * React StrictMode mounts QuoteStageRoute twice. On a project whose quote has never been
 * converted, both runs read the same unconverted quote and the same `updated_at`, then both
 * write. One wins; the loser's optimistic guard matches zero rows and raises
 * DrywallProjectStaleError. The route caught that and rendered the *v2* editor — so a project
 * sitting on version 3 in the database looked like it had "defaulted to v2", with the real
 * error already gone. Only new projects could show it, because converting is the only path
 * here that writes.
 *
 * Converting means "this project should be on v3", not "apply my edit", so losing the race to
 * a writer that produced the same outcome is success. A row that is still not v3 afterwards is
 * a real conflict and still throws.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ORG = 'org-1'
const PROJECT = 'p1'
const T0 = '2026-10-08T13:30:00.123456+00:00'
const T1 = '2026-10-08T13:38:00.654321+00:00'

/** What the winning mount leaves on the row. */
const WINNER_QUOTE = { version: 3, quoteNumber: 'DW-2026-900', lineItems: [] }

type UpdateOutcome = 'ok' | 'lost-race' | 'lost-to-v2-writer'

const state = {
  row: {} as Record<string, unknown>,
  /** One entry per expected UPDATE, in order. */
  updateQueue: [] as UpdateOutcome[],
  updates: [] as Record<string, unknown>[],
  projectReads: 0,
}

function projectRow(updatedAt: string, quote: Record<string, unknown>) {
  return {
    id: PROJECT,
    name: 'Lakewood - Sweeney',
    address: null,
    client: null,
    status: 'quote',
    type: 'drywall',
    organization_id: ORG,
    created_at: T0,
    updated_at: updatedAt,
    metadata: { app_scope: 'DRYWALL_ONLY', source: 'drywall_app', legacy: { quote } },
  }
}

/** Chainable and awaitable, so .eq().eq().maybeSingle() and .eq() both resolve. */
function chain(result: () => Promise<unknown>) {
  const node: Record<string, unknown> = {}
  node.eq = () => node
  node.in = () => node
  node.maybeSingle = () => result()
  node.select = () => result()
  node.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
    result().then(ok, err)
  return node
}

vi.mock('@/lib/supabase', () => ({
  isOnlineMode: () => true,
  supabase: {
    from: (table: string) => ({
      select: () => {
        if (table === 'estimates') return chain(async () => ({ count: 0, error: null }))
        state.projectReads += 1
        return chain(async () => ({ data: state.row, error: null }))
      },
      update: (payload: Record<string, unknown>) =>
        chain(async () => {
          state.updates.push(payload)
          const outcome = state.updateQueue.shift() ?? 'ok'
          if (outcome === 'ok') {
            state.row = { ...state.row, updated_at: T1, metadata: payload.metadata }
            return { data: [{ id: PROJECT, updated_at: T1 }], error: null }
          }
          // The guard matched zero rows. Whoever won has already moved the row on.
          state.row = projectRow(
            T1,
            outcome === 'lost-race' ? WINNER_QUOTE : { version: 2, sqft: '1200' },
          )
          return { data: [], error: null }
        }),
    }),
    rpc: (name: string) =>
      name === 'next_drywall_quote_number'
        ? Promise.resolve({ data: 'DW-2026-900', error: null })
        : Promise.resolve({ data: null, error: null }),
  },
}))

vi.mock('./userService', () => ({
  requireUserOrgId: () => Promise.resolve(ORG),
  getCurrentUserProfile: () => Promise.resolve(null),
}))

describe('convertQuoteToV3 on a brand-new project', () => {
  beforeEach(() => {
    state.row = projectRow(T0, {})
    state.updateQueue = []
    state.updates = []
    state.projectReads = 0
  })

  it('converts an empty quote and writes once', async () => {
    const { convertQuoteToV3 } = await import('./drywallProjectsService')

    const { quote, updatedAtRaw } = await convertQuoteToV3(PROJECT, T0)

    expect(quote.version).toBe(3)
    expect(updatedAtRaw).toBe(T1)
    expect(state.updates).toHaveLength(1)
    // The guard must be the timestamp the caller held, not a fresh read.
    expect((state.updates[0] as { updated_at: string }).updated_at).not.toBe(T0)
  })

  /** The regression: this used to reject, and the route turned that into the v2 editor. */
  it('treats losing the write race to another converter as success', async () => {
    const { convertQuoteToV3 } = await import('./drywallProjectsService')
    state.updateQueue = ['lost-race']

    const { quote, updatedAtRaw } = await convertQuoteToV3(PROJECT, T0)

    expect(quote.version).toBe(3)
    expect(quote.quoteNumber).toBe('DW-2026-900')
    expect(updatedAtRaw).toBe(T1)
  })

  it('still reports a conflict when the row did not end up on v3', async () => {
    const { convertQuoteToV3 } = await import('./drywallProjectsService')
    state.updateQueue = ['lost-to-v2-writer']

    await expect(convertQuoteToV3(PROJECT, T0)).rejects.toThrow(/changed somewhere else|stale/i)
  })

  it('does not write at all when the quote is already v3', async () => {
    const { convertQuoteToV3 } = await import('./drywallProjectsService')
    state.row = projectRow(T0, WINNER_QUOTE)

    const { quote, updatedAtRaw } = await convertQuoteToV3(PROJECT, T0)

    expect(quote.version).toBe(3)
    expect(updatedAtRaw).toBe(T0)
    expect(state.updates).toHaveLength(0)
  })
})
