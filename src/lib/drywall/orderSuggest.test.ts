import { describe, expect, it } from 'vitest'
import { reconcileOrderedAgainstTakeoff, suggestOrderItemsFromFieldTakeoff } from './orderSuggest'
import type { DrywallOrder, FieldTakeoff } from '@/types/drywall'

/** Minimal takeoff carrying two board lines in one area. */
function takeoffWithBoards(): FieldTakeoff {
  return {
    measurements: [
      {
        id: 'a1',
        area: '1st Floor',
        notes: '',
        boards: [
          { id: 'b1', type: '5/8" Fire-Resistant', width: '48', length: '8', quantity: '10' },
          { id: 'b2', type: '1/2" Cement Board', width: '36', length: '5', quantity: '6' },
        ],
      },
    ],
    photos: [],
    accessories: [],
    checklist: [],
  } as unknown as FieldTakeoff
}

function orderWith(
  status: DrywallOrder['status'],
  items: Array<{ description: string; quantity: string; unit: string }>,
): DrywallOrder {
  return {
    id: `o-${status}`,
    status,
    items: items.map((i, n) => ({ id: `i${n}`, notes: '', ...i })),
    createdAt: '',
    updatedAt: '',
  } as unknown as DrywallOrder
}

describe('suggestOrderItemsFromFieldTakeoff', () => {
  it('suggests everything when there are no earlier orders', () => {
    const { items, suppressed, reduced } = suggestOrderItemsFromFieldTakeoff(takeoffWithBoards())
    expect(items.length).toBe(2)
    expect(suppressed).toBe(0)
    expect(reduced).toBe(0)
  })

  it('omits a line already delivered in full', () => {
    const base = suggestOrderItemsFromFieldTakeoff(takeoffWithBoards()).items
    const delivered = orderWith('complete', [
      { description: base[0].description, quantity: base[0].quantity, unit: 'pcs' },
    ])

    const { items, suppressed } = suggestOrderItemsFromFieldTakeoff(takeoffWithBoards(), [delivered])

    expect(suppressed).toBe(1)
    expect(items.map((i) => i.description)).toEqual([base[1].description])
  })

  it('suggests the remainder when a line was partly delivered', () => {
    const base = suggestOrderItemsFromFieldTakeoff(takeoffWithBoards()).items
    const partial = orderWith('sent', [
      { description: base[0].description, quantity: '4', unit: 'pcs' },
    ])

    const { items, reduced, suppressed } = suggestOrderItemsFromFieldTakeoff(takeoffWithBoards(), [
      partial,
    ])

    expect(reduced).toBe(1)
    expect(suppressed).toBe(0)
    // 10 wanted, 4 already sent.
    expect(items.find((i) => i.description === base[0].description)?.quantity).toBe('6')
  })

  it('ignores draft orders, so two open drafts cannot hide material', () => {
    const base = suggestOrderItemsFromFieldTakeoff(takeoffWithBoards()).items
    const draft = orderWith('draft', [
      { description: base[0].description, quantity: base[0].quantity, unit: 'pcs' },
    ])

    const { items, suppressed } = suggestOrderItemsFromFieldTakeoff(takeoffWithBoards(), [draft])

    expect(suppressed).toBe(0)
    expect(items.length).toBe(2)
  })

  it('does not let a different unit cancel a line', () => {
    const base = suggestOrderItemsFromFieldTakeoff(takeoffWithBoards()).items
    const wrongUnit = orderWith('complete', [
      { description: base[0].description, quantity: '99', unit: 'box' },
    ])

    const { items, suppressed } = suggestOrderItemsFromFieldTakeoff(takeoffWithBoards(), [wrongUnit])

    expect(suppressed).toBe(0)
    expect(items.length).toBe(2)
  })

  it('suggests a hand-edited description in full rather than guessing', () => {
    const renamed = orderWith('complete', [
      { description: 'whatever the office typed instead', quantity: '10', unit: 'pcs' },
    ])

    const { items, suppressed } = suggestOrderItemsFromFieldTakeoff(takeoffWithBoards(), [renamed])

    // Over-suggesting costs a delete; under-suggesting is a shortfall found on site.
    expect(suppressed).toBe(0)
    expect(items.length).toBe(2)
  })
})

describe('reconcileOrderedAgainstTakeoff', () => {
  it('reports what is still outstanding after a partial delivery', () => {
    const base = suggestOrderItemsFromFieldTakeoff(takeoffWithBoards()).items
    const delivered = orderWith('complete', [
      { description: base[0].description, quantity: base[0].quantity, unit: 'pcs' },
    ])

    const { rows, outstandingCount } = reconcileOrderedAgainstTakeoff(takeoffWithBoards(), [
      delivered,
    ])

    expect(outstandingCount).toBe(1)
    const covered = rows.find((r) => r.description === base[0].description)
    const owing = rows.find((r) => r.description === base[1].description)
    expect(covered?.outstanding).toBe(0)
    expect(owing?.outstanding).toBe(6)
  })

  it('aggregates the same material across areas before comparing', () => {
    // Same board in two areas: 10 + 10 needed, 12 ordered → 8 outstanding, not 0 and 10.
    const twoAreas = {
      measurements: [
        {
          id: 'a1',
          area: '1st Floor',
          notes: '',
          boards: [
            { id: 'b1', type: '5/8" Fire-Resistant', width: '48', length: '8', quantity: '10' },
          ],
        },
        {
          id: 'a2',
          area: '2nd Floor',
          notes: '',
          boards: [
            { id: 'b2', type: '5/8" Fire-Resistant', width: '48', length: '8', quantity: '10' },
          ],
        },
      ],
      photos: [],
      accessories: [],
      checklist: [],
    } as unknown as FieldTakeoff

    const description = suggestOrderItemsFromFieldTakeoff(twoAreas).items[0].description
    const partial = orderWith('sent', [{ description, quantity: '12', unit: 'pcs' }])

    const { rows } = reconcileOrderedAgainstTakeoff(twoAreas, [partial])

    expect(rows.length).toBe(1)
    expect(rows[0].needed).toBe(20)
    expect(rows[0].ordered).toBe(12)
    expect(rows[0].outstanding).toBe(8)
    // Two areas contributed, so the area label is dropped rather than picking one.
    expect(rows[0].area).toBeUndefined()
  })

  it('surfaces ordered lines with no takeoff behind them', () => {
    const extra = orderWith('complete', [
      { description: 'Ladders, rented', quantity: '2', unit: 'each' },
    ])

    const { unmatched } = reconcileOrderedAgainstTakeoff(takeoffWithBoards(), [extra])

    expect(unmatched.length).toBe(1)
    expect(unmatched[0].ordered).toBe(2)
  })

  it('counts nothing from a draft order', () => {
    const base = suggestOrderItemsFromFieldTakeoff(takeoffWithBoards()).items
    const draft = orderWith('draft', [
      { description: base[0].description, quantity: base[0].quantity, unit: 'pcs' },
    ])

    const { outstandingCount } = reconcileOrderedAgainstTakeoff(takeoffWithBoards(), [draft])

    expect(outstandingCount).toBe(2)
  })
})
