import { describe, expect, it } from 'vitest'
import { defaultPieceTypeForPositionName } from './payrollPieceKeys'

describe('defaultPieceTypeForPositionName', () => {
  it('starts a hanger on drywall hanging', () => {
    // Roberto Galvan's roster position. Every run used to open him on the finisher rate.
    expect(defaultPieceTypeForPositionName('Hanger')).toEqual({
      workType: 'drywall_hanging',
      catalogSource: 'v3_drywall',
      totalPhases: 1,
    })
  })

  it('leaves the finish trades on the existing default', () => {
    // Four live position names resolve to finish work; none of them should move.
    for (const name of ['Finisher', 'Pointup Specialist', 'Apprentice Finisher', 'Assistant Finisher']) {
      expect(defaultPieceTypeForPositionName(name).workType).toBe('finisher')
    }
  })

  it('leaves non-trade and unknown positions alone', () => {
    for (const name of ['Laborer', 'Administrative', 'Carpenter', 'Field Measurer', '', null]) {
      expect(defaultPieceTypeForPositionName(name).workType).toBe('finisher')
    }
  })
})
