import { describe, expect, it } from 'vitest'
import {
  changeOrderTile,
  fieldTile,
  filesTile,
  financialsTile,
  infoTile,
  orderTile,
  quoteTile,
} from './ProjectOverviewPage'

/**
 * A v3 quote whose single drywall line gives a known quoted-with-waste sqft.
 *
 * `outcome` and the money both live inside the quote object — `getQuoteOutcomeFromLegacy`
 * reads `legacy.quote.outcome` and `resolveBaseContractValue` prefers `quote.bidSnapshot.total`.
 * An earlier draft of these fixtures put both at the legacy root and every colour assertion
 * failed, which is the test earning its place.
 */
function quote(
  quantity: number,
  opts: { wastePct?: number; outcome?: string; total?: number } = {},
) {
  const { wastePct = 0, outcome, total } = opts
  return {
    version: 3,
    lineItems: [{ type: 'drywall', quantity, waste_pct: wastePct, id: 'l1' }],
    alternates: [],
    ...(outcome ? { outcome } : {}),
    ...(total == null ? {} : { calculations: { finalTotal: total } }),
  }
}

function takeoff(totalMeasuredSqft: number, extra: Record<string, unknown> = {}) {
  return { totalMeasuredSqft, measurements: [], ...extra }
}

describe('quoteTile', () => {
  it('is green and says approved once the quote is agreed', () => {
    const tile = quoteTile({ quote: quote(1000, { outcome: 'approved', total: 12_500 }) })
    expect(tile.value).toBe('$12,500')
    expect(tile.status).toBe('green')
    expect(tile.caption).toBe('approved')
  })

  it('is amber while a quote is out', () => {
    const tile = quoteTile({ quote: quote(1000, { outcome: 'sent', total: 12_500 }) })
    expect(tile.status).toBe('yellow')
    expect(tile.caption).toBe('sent, awaiting answer')
  })

  it('carries no colour for a draft', () => {
    const tile = quoteTile({ quote: quote(1000, { total: 12_500 }) })
    expect(tile.status).toBeNull()
    expect(tile.caption).toBe('draft, not sent')
  })

  // 122 Sherman St is the live case: approved, but a legacy GC quote with no total.
  it('shows an em dash rather than zero when an approved quote has no total', () => {
    const tile = quoteTile({ quote: { version: 3, lineItems: [], outcome: 'approved' } })
    expect(tile.value).toBeNull()
    expect(tile.status).toBe('green')
  })
})

describe('fieldTile', () => {
  it('says so when nothing has been measured', () => {
    expect(fieldTile({ quote: quote(1000) }).caption).toBe('not measured yet')
    expect(fieldTile({ quote: quote(1000) }).value).toBeNull()
  })

  it('reports the variance against quoted sqft, with the direction spelled out', () => {
    const tile = fieldTile({ quote: quote(1000), fieldTakeoff: takeoff(900) })
    expect(tile.value).toBe('900 sqft')
    expect(tile.caption).toBe('10.0% under quoted sqft')
  })

  it('greens inside the stage warning tolerance and reds past twice it', () => {
    expect(fieldTile({ quote: quote(1000), fieldTakeoff: takeoff(950) }).status).toBe('green')
    expect(fieldTile({ quote: quote(1000), fieldTakeoff: takeoff(850) }).status).toBe('yellow')
    expect(fieldTile({ quote: quote(1000), fieldTakeoff: takeoff(700) }).status).toBe('red')
  })

  // A measurement waiting on someone is more actionable than how close it came.
  it('puts a pending review ahead of the variance', () => {
    const tile = fieldTile({
      quote: quote(1000),
      fieldTakeoff: takeoff(900, { reviewStatus: 'pending_review' }),
    })
    expect(tile.caption).toBe('waiting on review')
    expect(tile.status).toBe('yellow')
  })

  it('is red when a measurement was rejected', () => {
    const tile = fieldTile({
      quote: quote(1000),
      fieldTakeoff: takeoff(900, { reviewStatus: 'rejected' }),
    })
    expect(tile.caption).toBe('rejected, needs redo')
    expect(tile.status).toBe('red')
  })

  it('still shows the measurement when there is no quote to compare', () => {
    const tile = fieldTile({ fieldTakeoff: takeoff(900) })
    expect(tile.value).toBe('900 sqft')
    expect(tile.caption).toBe('measured, nothing to compare')
  })

  it('falls back to summing boards when no total was stored', () => {
    const tile = fieldTile({
      fieldTakeoff: {
        measurements: [{ boards: [{ width: 48, length: 12, quantity: 2 }] }],
      },
    })
    // 48/12 ft wide x 12 ft x 2 boards = 96 sqft
    expect(tile.value).toBe('96 sqft')
  })
})

describe('orderTile', () => {
  it('says nothing ordered when there are no orders', () => {
    expect(orderTile({}).value).toBeNull()
    expect(orderTile({}).caption).toBe('nothing ordered')
  })

  // A draft is an order nobody actually sent to a supplier, so it outranks delivery counts.
  it('flags drafts ahead of delivery progress', () => {
    const tile = orderTile({
      orders: [{ id: 'a', items: [], status: 'draft' }, { id: 'b', items: [], status: 'complete' }],
    })
    expect(tile.caption).toBe('1 still a draft')
    expect(tile.status).toBe('yellow')
  })

  it('is green once every order is delivered', () => {
    const tile = orderTile({ orders: [{ id: 'a', items: [], status: 'complete' }] })
    expect(tile.caption).toBe('all delivered')
    expect(tile.status).toBe('green')
  })

  // "0 of 1 delivered" read badly on seven live projects.
  it('words nothing-delivered-yet in words rather than a zero', () => {
    const tile = orderTile({ orders: [{ id: 'a', items: [], status: 'sent' }] })
    expect(tile.caption).toBe('placed, none delivered')
  })

  it('counts partial delivery', () => {
    const tile = orderTile({
      orders: [
        { id: 'a', items: [], status: 'complete' },
        { id: 'b', items: [], status: 'sent' },
      ],
    })
    expect(tile.caption).toBe('1 of 2 delivered')
  })
})

describe('changeOrderTile', () => {
  it('says none raised on the common case', () => {
    expect(changeOrderTile({}).caption).toBe('none raised')
  })

  it('leads with accepted money, because that moves the contract', () => {
    const tile = changeOrderTile({
      changeOrders: [{ id: 'c1', status: 'accepted', requestedAmount: 1600 }],
    })
    expect(tile.value).toBe('$1,600')
    expect(tile.caption).toBe('1 accepted')
  })

  it('flags one awaiting an answer', () => {
    const tile = changeOrderTile({
      changeOrders: [{ id: 'c1', status: 'submitted', requestedAmount: 500 }],
    })
    expect(tile.caption).toBe('1 awaiting an answer')
    expect(tile.status).toBe('yellow')
  })
})

describe('financialsTile', () => {
  // It used to show contract value, which equalled the Quote tile on 172 of 179 live
  // projects. These two assertions are the regression guard for that.
  it('does not repeat the quote amount', () => {
    const legacy = { quote: quote(1000, { total: 12_500 }) }
    expect(quoteTile(legacy).value).toBe('$12,500')
    expect(financialsTile(legacy, 'quote').value).not.toBe('$12,500')
  })

  it('says production has not started when it has not', () => {
    const tile = financialsTile({ quote: quote(1000, { total: 12_500 }) }, 'quote')
    expect(tile.value).toBeNull()
    expect(tile.caption).toBe('production not started')
  })

  it('names the stage and when it got there', () => {
    const tile = financialsTile(
      { productionTimestamps: { productionStartedAt: '2026-09-16T12:00:00.000Z' } },
      'production',
    )
    expect(tile.value).toBe('Production')
    expect(tile.caption).toMatch(/^since 2026-09-1[56]$/)
  })

  it('is green and dated once closed', () => {
    const tile = financialsTile(
      {
        productionTimestamps: {
          productionStartedAt: '2026-07-01T12:00:00.000Z',
          closedAt: '2026-09-29T12:00:00.000Z',
        },
      },
      'closed',
    )
    expect(tile.value).toBe('Closed')
    expect(tile.status).toBe('green')
    expect(tile.caption).toMatch(/2026-09-2[89]/)
  })
})

describe('infoTile', () => {
  // The first version showed the purchase order, which was empty on all 179 live projects.
  it('shows the customer', () => {
    const tile = infoTile({ client: 'Payne and Payne' })
    expect(tile.value).toBe('Payne and Payne')
    expect(tile.caption).toBe('customer')
  })

  it('does not invent one when the field is blank', () => {
    expect(infoTile({ client: '   ' }).value).toBeNull()
    expect(infoTile({}).caption).toBe('no customer recorded')
  })
})

describe('filesTile', () => {
  it('counts the photos riding in the takeoff', () => {
    const tile = filesTile({ fieldTakeoff: { photos: [{ id: 'p1' }, { id: 'p2' }] } })
    expect(tile.value).toBe('2')
    expect(tile.caption).toBe('field photos')
  })

  it('is empty rather than zero when there are none', () => {
    expect(filesTile({}).value).toBeNull()
  })
})
