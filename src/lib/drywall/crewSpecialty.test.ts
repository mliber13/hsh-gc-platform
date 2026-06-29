import { describe, expect, it } from 'vitest'
import { isMeasurerSpecialty, specialtyFromPositionName } from './crewSpecialty'

describe('specialtyFromPositionName', () => {
  it('detects measurer from position name substring', () => {
    expect(specialtyFromPositionName('Field Measurer')).toBe('measurer')
    expect(specialtyFromPositionName('Measure Tech')).toBe('measurer')
  })

  it('checks measurer before hanger/finisher', () => {
    expect(specialtyFromPositionName('Hanger')).toBe('hanger')
    expect(specialtyFromPositionName('Finisher')).toBe('finisher')
    expect(specialtyFromPositionName('Hanger / Finisher')).toBe('both')
  })

  it('returns unknown for empty or unrelated positions', () => {
    expect(specialtyFromPositionName(null)).toBe('unknown')
    expect(specialtyFromPositionName('Laborer')).toBe('unknown')
  })
})

describe('isMeasurerSpecialty', () => {
  it('is true only for measurer', () => {
    expect(isMeasurerSpecialty('measurer')).toBe(true)
    expect(isMeasurerSpecialty('hanger')).toBe(false)
    expect(isMeasurerSpecialty('finisher')).toBe(false)
  })
})
