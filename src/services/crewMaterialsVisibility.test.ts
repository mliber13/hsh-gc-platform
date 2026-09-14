/**
 * Why a crew member's Materials card is empty — the real cases, from live data.
 *
 * A Laborer reported he couldn't see the material list. The office looked at the
 * same job and saw a full one. It took two weeks to establish he was right,
 * because every way of being empty looked identical on his phone.
 */
import { describe, expect, it } from 'vitest'
import { resolveMaterials } from './crewWorkspaceService'
import { specialtyFromPositionName } from '@/lib/drywall/crewSpecialty'
import type { FieldTakeoff } from '@/types/drywall'

function takeoff(accessories: unknown[]): FieldTakeoff {
  return { accessories } as unknown as FieldTakeoff
}

const BEAD = { id: 'a1', type: 'Corner Bead', subtype: 'Square Bead', quantity: '40', unit: 'pcs' }
const MUD = { id: 'a2', type: 'Joint Compound', subtype: 'All Purpose', quantity: '12', unit: 'Box' }

describe('position name → specialty', () => {
  it('treats point-up as finish work', () => {
    // Robert Allen and Doug Ryman are both "Pointup Specialist" and were
    // resolving to unknown, which silently emptied their materials and pay.
    expect(specialtyFromPositionName('Pointup Specialist')).toBe('finisher')
    expect(specialtyFromPositionName('Point Up')).toBe('finisher')
  })

  it('still resolves the trades it always did', () => {
    expect(specialtyFromPositionName('Finisher')).toBe('finisher')
    expect(specialtyFromPositionName('Apprentice Finisher')).toBe('finisher')
    expect(specialtyFromPositionName('Hanger')).toBe('hanger')
    expect(specialtyFromPositionName('Field Measurer')).toBe('measurer')
  })

  it('still cannot resolve a Laborer — that is a real gap, not a bug', () => {
    // Shane Plats. A Laborer is not a trade, so the answer is to grant access
    // explicitly rather than infer it. See the showJobInfo case below.
    expect(specialtyFromPositionName('Laborer')).toBe('unknown')
  })
})

describe('why the card is empty', () => {
  it('says nothing is recorded when the takeoff has no accessories', () => {
    const r = resolveMaterials(takeoff([]), 'finisher', false)
    expect(r.items).toEqual([])
    expect(r.emptyReason).toBe('none_recorded')
  })

  it('distinguishes "listed but no quantities" — the Austintown case', () => {
    // The job had ten accessory rows and the share toggle was on, and the card
    // was still blank: the quantity filter runs before the unfiltered bypass, so
    // blank quantities drop every row and no toggle can rescue them.
    const r = resolveMaterials(
      takeoff([
        { ...BEAD, quantity: '' },
        { ...MUD, quantity: '0' },
      ]),
      'unknown',
      true,
    )
    expect(r.items).toEqual([])
    expect(r.emptyReason).toBe('no_quantities')
    expect(r.emptyReason).not.toBe('none_recorded')
  })

  it('says the trade is unresolved rather than showing nothing', () => {
    const r = resolveMaterials(takeoff([BEAD]), 'unknown', false)
    expect(r.emptyReason).toBe('trade_unresolved')
  })

  it('reports a real trade filter separately from an unresolved one', () => {
    // Adhesives and Fasteners are hidden from finishers by design.
    const r = resolveMaterials(
      takeoff([{ id: 'x', type: 'Adhesives', subtype: 'TiteBond Foam', quantity: '4', unit: 'Tube' }]),
      'finisher',
      false,
    )
    expect(r.items).toEqual([])
    expect(r.emptyReason).toBe('not_your_trade')
  })

  it('has no reason to give when it actually found something', () => {
    const r = resolveMaterials(takeoff([BEAD, MUD]), 'finisher', false)
    expect(r.items).toHaveLength(2)
    expect(r.emptyReason).toBeNull()
  })
})

describe('an explicit grant outranks an inferred trade', () => {
  it('shows an unknown trade the whole list when unfiltered', () => {
    // This is what showJobInfo now passes for an unresolved trade: the operator
    // putting someone on the job-info list IS the decision that they should see
    // it, and that should not lose to a position-name substring.
    const r = resolveMaterials(takeoff([BEAD, MUD]), 'unknown', true)
    expect(r.items).toHaveLength(2)
    expect(r.emptyReason).toBeNull()
  })

  it('still narrows for a trade we do know', () => {
    // A hanger with job info keeps the hanger-relevant list — narrowing by a
    // KNOWN trade is useful, not obstructive.
    const r = resolveMaterials(
      takeoff([BEAD, { id: 'x', type: 'Adhesives', subtype: 'TiteBond Foam', quantity: '4', unit: 'Tube' }]),
      'finisher',
      false,
    )
    expect(r.items.map((i) => i.type)).toEqual(['Corner Bead'])
  })
})
