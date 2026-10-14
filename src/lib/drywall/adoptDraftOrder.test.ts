import { describe, expect, it } from 'vitest'
import { orderForScheduleItem } from './adoptDraftOrder'
import type { DrywallOrder } from '@/types/drywall'

const order = (extra: Partial<DrywallOrder>): DrywallOrder =>
  ({ id: 'o', status: 'draft', items: [], createdAt: '', updatedAt: '', ...extra }) as DrywallOrder

describe('orderForScheduleItem', () => {
  /** Burton - Hutchinson, 2026-10-05: the seeded draft, then a second order 12s later. */
  it('adopts the one draft the field → order advance seeded', () => {
    const seeded = order({ id: 'seeded' })
    expect(orderForScheduleItem([seeded], 'stock')).toEqual({ order: seeded, adopted: true })
  })

  it("the item's own order wins", () => {
    const linked = order({ id: 'linked', scheduleItemId: 'stock', status: 'sent' })
    expect(orderForScheduleItem([order({ id: 'seeded' }), linked], 'stock')).toEqual({
      order: linked,
      adopted: false,
    })
  })

  it('never adopts an order already sent, or one belonging to another item', () => {
    expect(orderForScheduleItem([order({ status: 'sent' })], 'stock').order).toBeNull()
    expect(orderForScheduleItem([order({ scheduleItemId: 'stock-2' })], 'stock').order).toBeNull()
  })

  it('two unattached drafts are ambiguous — adopt neither', () => {
    expect(orderForScheduleItem([order({ id: 'a' }), order({ id: 'b' })], 'stock').order).toBeNull()
  })
})
