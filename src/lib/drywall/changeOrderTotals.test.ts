import { describe, expect, it } from 'vitest'
import {
  computeChangeOrderTotals,
  groupChangeOrderLines,
  resolveChangeOrderRequestedAmount,
} from './changeOrderTotals'
import type { DrywallChangeOrder, DrywallChangeOrderLineItem } from '@/types/drywall'

function line(over: Partial<DrywallChangeOrderLineItem>): DrywallChangeOrderLineItem {
  return { id: over.id ?? 'l', location: '', description: '', quantity: 0, unit: '', rate: 0, ...over }
}

describe('computeChangeOrderTotals', () => {
  it('sums quantity × rate and applies overhead then profit on (subtotal + overhead)', () => {
    const co: DrywallChangeOrder = {
      id: 'co',
      overheadPct: 10,
      profitPct: 10,
      lineItems: [
        line({ id: 'a', location: 'Basement Bedroom', quantity: 420, rate: 7.4 }), // 3108
        line({ id: 'b', location: 'Basement Bedroom', quantity: 210, rate: 4 }), // 840
        line({ id: 'c', location: 'Kitchen', quantity: 1, rate: 450 }), // 450
      ],
    }
    const t = computeChangeOrderTotals(co)
    expect(t.hasLineItems).toBe(true)
    expect(t.subtotal).toBeCloseTo(4398, 2)
    expect(t.overhead).toBeCloseTo(439.8, 2) // 4398 × 10%
    expect(t.profit).toBeCloseTo(483.78, 2) // (4398 + 439.8) × 10%
    expect(t.total).toBeCloseTo(5321.58, 2)
  })

  it('splits material + labor rates into the line total and reports both subtotals', () => {
    const co: DrywallChangeOrder = {
      id: 'co',
      lineItems: [
        line({ id: 'a', location: 'Bedroom', quantity: 400, materialRate: 1.5, laborRate: 5.9 }), // 600 + 2360
        line({ id: 'b', location: 'Bedroom', quantity: 200, materialRate: 0, laborRate: 4 }), // 0 + 800
      ],
    }
    const t = computeChangeOrderTotals(co)
    expect(t.materialSubtotal).toBeCloseTo(600, 2)
    expect(t.laborSubtotal).toBeCloseTo(3160, 2)
    expect(t.subtotal).toBeCloseTo(3760, 2) // material + labor
    expect(t.total).toBeCloseTo(3760, 2) // no markup
  })

  it('falls back to a legacy blended rate when material/labor are unset', () => {
    const t = computeChangeOrderTotals({
      lineItems: [line({ id: 'a', quantity: 10, rate: 7 })],
    })
    expect(t.subtotal).toBe(70)
    expect(t.materialSubtotal).toBe(0)
    expect(t.laborSubtotal).toBe(0)
  })

  it('groups lines by location preserving first-seen order', () => {
    const groups = groupChangeOrderLines([
      line({ id: 'a', location: 'Kitchen', quantity: 1, rate: 100 }),
      line({ id: 'b', location: 'Bath', quantity: 1, rate: 50 }),
      line({ id: 'c', location: 'Kitchen', quantity: 1, rate: 25 }),
    ])
    expect(groups.map((g) => g.location)).toEqual(['Kitchen', 'Bath'])
    expect(groups[0].subtotal).toBe(125)
    expect(groups[1].subtotal).toBe(50)
  })

  it('falls back blank location to "General"', () => {
    const groups = groupChangeOrderLines([line({ id: 'a', location: '  ', quantity: 2, rate: 10 })])
    expect(groups[0].location).toBe('General')
  })

  it('no markup percentages → total equals subtotal', () => {
    const t = computeChangeOrderTotals({
      lineItems: [line({ id: 'a', quantity: 3, rate: 100 })],
    })
    expect(t.total).toBe(300)
    expect(t.overhead).toBe(0)
    expect(t.profit).toBe(0)
  })

  it('resolveChangeOrderRequestedAmount uses the manual lump sum when there are no line items', () => {
    expect(resolveChangeOrderRequestedAmount({ id: 'co', requestedAmount: '1250.50' })).toBe(1250.5)
    expect(resolveChangeOrderRequestedAmount({ id: 'co', lineItems: [] })).toBe(0)
  })

  it('an options CO resolves to the selected option, else the largest option total', () => {
    const co: DrywallChangeOrder = {
      id: 'co',
      options: [
        { id: 'opt-a', name: 'Ceiling only', lineItems: [line({ id: 'a', quantity: 100, laborRate: 5 })] }, // 500
        {
          id: 'opt-b',
          name: 'Ceiling + walls',
          lineItems: [line({ id: 'b', quantity: 300, laborRate: 5 })], // 1500
        },
      ],
    }
    // No selection → largest (max exposure).
    expect(resolveChangeOrderRequestedAmount(co)).toBe(1500)
    // Selecting the smaller option pins to it.
    expect(resolveChangeOrderRequestedAmount({ ...co, selectedOptionId: 'opt-a' })).toBe(500)
  })
})
