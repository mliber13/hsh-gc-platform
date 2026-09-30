// The shape of the autosave bug, reproduced without React.
//
// Every blob write is guarded on `updated_at`. Saving from onChange fired one write per
// keystroke, so the second write still held the timestamp the first had already replaced and
// the guard refused it — "This project changed somewhere else while you were editing", while
// the only person editing was the one typing.
//
// A debounce alone does not fix it: any save slower than the gap between bursts still
// overlaps the next. Writes have to be serialised so each one reads the timestamp the
// previous one returned.

import { describe, expect, it } from 'vitest'

/** Stands in for the guarded write: refuses anything not holding the current stamp. */
function makeGuardedStore(latencyMs = 5) {
  let stamp = 't0'
  let version = 0
  return {
    get stamp() {
      return stamp
    },
    get version() {
      return version
    },
    async save(held: string): Promise<string> {
      await new Promise((r) => setTimeout(r, latencyMs))
      if (held !== stamp) {
        throw new Error('This project changed somewhere else while you were editing.')
      }
      version += 1
      stamp = `t${version}`
      return stamp
    },
  }
}

describe('guarded writes under rapid edits', () => {
  it('reproduces the bug: parallel saves sharing one timestamp are refused', async () => {
    const store = makeGuardedStore()
    const held = store.stamp
    const results = await Promise.allSettled([
      store.save(held),
      store.save(held),
      store.save(held),
    ])
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(rejected.length).toBeGreaterThan(0)
    expect((rejected[0] as PromiseRejectedResult).reason.message).toContain(
      'changed somewhere else',
    )
  })

  it('serialising the writes lets every one through', async () => {
    const store = makeGuardedStore()
    let held = store.stamp
    let chain: Promise<void> = Promise.resolve()

    for (let i = 0; i < 5; i++) {
      chain = chain.then(async () => {
        held = await store.save(held)
      })
    }
    await chain

    expect(store.version).toBe(5)
    expect(held).toBe(store.stamp)
  })

  it('a later save reads the timestamp the previous one returned', async () => {
    // The reason the stamp cannot live in React state: a chained callback closes over the
    // value that existed when it was created.
    const store = makeGuardedStore()
    const stale = store.stamp
    const fresh = await store.save(stale)
    await expect(store.save(stale)).rejects.toThrow('changed somewhere else')
    await expect(store.save(fresh)).resolves.toBeTruthy()
  })
})
