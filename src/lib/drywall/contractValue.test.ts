import { describe, expect, it } from 'vitest'
import {
  acceptedChangeOrderTotal,
  computeContractValue,
  computeContractValueFromLegacy,
} from './contractValue'

describe('drywall contract value', () => {
  it('prefers the locked bid and includes only accepted change orders', () => {
    const result = computeContractValue({
      quote: {
        bidSnapshot: { total: 100_000 },
        calculations: { finalTotal: 90_000 },
        totalQuoteAmount: 80_000,
      },
      changeOrders: [
        { id: 'accepted', status: 'accepted', acceptedAmount: '12,000'.replace(',', '') },
        { id: 'submitted', status: 'submitted', requestedAmount: '5000' },
        { id: 'rejected', status: 'rejected', requestedAmount: '7000' },
      ],
      billedToDate: 40_000,
    })

    expect(result.baseContractValue).toBe(100_000)
    expect(result.acceptedChangeOrderRevenue).toBe(12_000)
    expect(result.effectiveContractValue).toBe(112_000)
    expect(result.remainingToBill).toBe(72_000)
    expect(result.overbilledAmount).toBe(0)
  })

  it('supports legacy approved records and deductive change orders', () => {
    expect(
      acceptedChangeOrderTotal([
        { id: 'legacy', status: 'approved', requestedAmount: '5000' },
        { id: 'deduction', status: 'accepted', acceptedAmount: '-1250' },
      ]),
    ).toBe(3750)
  })

  it('ignores malformed amounts and reports overbilling', () => {
    const result = computeContractValue({
      quote: { totalQuoteAmount: '10000' },
      changeOrders: [
        { id: 'bad', status: 'accepted', acceptedAmount: '100abc' },
        { id: 'good', status: 'accepted', acceptedAmount: '500' },
      ],
      billedToDate: 11_000,
    })

    expect(result.effectiveContractValue).toBe(10_500)
    expect(result.remainingToBill).toBe(0)
    expect(result.overbilledAmount).toBe(500)
  })

  it('falls back to purchase-order value and reads project legacy JSON', () => {
    const result = computeContractValueFromLegacy({
      poData: { customerSqft: 10_000, agreedUnitRate: 2.5 },
      changeOrders: [{ id: 'co', status: 'accepted', acceptedAmount: '2500' }],
    })

    expect(result.baseContractValue).toBe(25_000)
    expect(result.effectiveContractValue).toBe(27_500)
  })

  it('does not treat change orders alone as a base contract', () => {
    const result = computeContractValue({
      changeOrders: [{ id: 'co', status: 'accepted', acceptedAmount: '1000' }],
    })

    expect(result.baseContractValue).toBeNull()
    expect(result.effectiveContractValue).toBeNull()
    expect(result.acceptedChangeOrderRevenue).toBe(1000)
  })

  it('treats sub-cent contract vs billed drift as fully billed, not overbilled', () => {
    const result = computeContractValue({
      quote: { calculations: { finalTotal: 61266.34623211532 } },
      billedToDate: 61266.35,
    })

    expect(result.effectiveContractValue).toBe(61266.34623211532)
    expect(result.billedToDate).toBe(61266.35)
    expect(result.remainingToBill).toBe(0)
    expect(result.overbilledAmount).toBe(0)
  })

  it('still reports a genuine overbill after rounding to cents', () => {
    const result = computeContractValue({
      quote: { bidSnapshot: { total: 60_000 } },
      billedToDate: 61266.35,
    })

    expect(result.remainingToBill).toBe(0)
    expect(result.overbilledAmount).toBe(1266.35)
  })

  it('still reports remaining to bill when under billed', () => {
    const result = computeContractValue({
      quote: { bidSnapshot: { total: 61266.35 } },
      billedToDate: 40_000,
    })

    expect(result.remainingToBill).toBe(21266.35)
    expect(result.overbilledAmount).toBe(0)
  })

  it('leaves remaining null and overbilled zero when there is no contract baseline', () => {
    const result = computeContractValue({
      billedToDate: 61266.35,
    })

    expect(result.effectiveContractValue).toBeNull()
    expect(result.remainingToBill).toBeNull()
    expect(result.overbilledAmount).toBe(0)
  })
})
