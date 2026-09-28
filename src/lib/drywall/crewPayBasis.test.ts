import { describe, expect, it } from 'vitest'
import { getSqftFromJob } from '@/lib/payrollMath'
import { resolveCrewPaySqft, resolveCrewPaySqftFromMetadata } from './crewPayBasis'

const eastPalestine = {
  legacy: {
    fieldTakeoff: { totalMeasuredSqft: 4954 },
    changeOrders: [{ id: 'co', status: 'accepted', additionalCrewSqft: '540' }],
  },
}

describe('resolveCrewPaySqft', () => {
  it('adds accepted change-order sqft to the field measurement', () => {
    const result = resolveCrewPaySqftFromMetadata(eastPalestine)
    expect(result.baseSqft).toBe(4954)
    expect(result.baseSource).toBe('measured')
    expect(result.acceptedChangeOrderSqft).toBe(540)
    expect(result.sqft).toBe(5494)
    expect(getSqftFromJob({ metadata: eastPalestine, fieldMeasuredSqft: 4954 })).toBe(5494)
  })

  it('ignores change orders that are not accepted', () => {
    const result = resolveCrewPaySqftFromMetadata({
      legacy: {
        fieldTakeoff: { totalMeasuredSqft: 4954 },
        changeOrders: [{ status: 'submitted', additionalCrewSqft: 540 }],
      },
    })
    expect(result.sqft).toBe(4954)
    expect(result.acceptedChangeOrderSqft).toBe(0)
  })

  it('falls back to quoted sqft with waste when nothing has been measured', () => {
    const result = resolveCrewPaySqftFromMetadata({
      legacy: {
        quote: {
          version: 3,
          lineItems: [{ type: 'drywall', quantity: 1000, waste_pct: 10 }],
        },
      },
    })
    expect(result.baseSource).toBe('quoted')
    expect(result.sqft).toBe(1100)
  })

  it('uses PO customer sqft only for a PO intake with no measurement or quote', () => {
    const po = {
      poReference: 'PO-1',
      intakeAt: '2026-01-01T00:00:00.000Z',
      customerSqft: 800,
      agreedUnitRate: 2.5,
      scopeText: 'Hang and finish',
    }
    const asPo = resolveCrewPaySqft({
      legacy: { intakeSource: 'po', po },
      intakeSource: 'po',
      po,
    })
    expect(asPo.baseSource).toBe('po')
    expect(asPo.sqft).toBe(800)

    const asQuote = resolveCrewPaySqft({
      legacy: { intakeSource: 'quote', po },
      intakeSource: 'quote',
      po,
    })
    expect(asQuote.sqft).toBeNull()
  })

  it('returns null when there is no measurement, quote, or PO', () => {
    expect(resolveCrewPaySqftFromMetadata({ legacy: {} }).sqft).toBeNull()
    expect(resolveCrewPaySqftFromMetadata(null).sqft).toBeNull()
  })
})
