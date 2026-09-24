import { describe, expect, it } from 'vitest'
import { suggestOrderItemsFromFieldTakeoff } from './orderSuggest'
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
