import { describe, expect, it } from 'vitest'
import {
  isMeasurerSpecialty,
  isSupportSpecialty,
  specialtyFromPositionName,
} from './crewSpecialty'

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

  it('returns unknown for a missing position', () => {
    expect(specialtyFromPositionName(null)).toBe('unknown')
    expect(specialtyFromPositionName('')).toBe('unknown')
  })

  // Non-drywall positions are real, not unresolved. Previously everything unmatched fell to
  // 'unknown', which told correctly-configured people their account was broken.
  it('classifies non-drywall positions as support', () => {
    expect(specialtyFromPositionName('Laborer')).toBe('support')
    expect(specialtyFromPositionName('Carpenter')).toBe('support')
    expect(specialtyFromPositionName('Administrative')).toBe('support')
  })

  // The allowlist is the safety net: an unclassified position still raises the flag, so a
  // new or misspelled drywall position cannot be quietly waved through as "not your trade".
  it('leaves genuinely ambiguous positions unknown', () => {
    expect(specialtyFromPositionName('Foreman')).toBe('unknown')
    expect(specialtyFromPositionName('Lead')).toBe('unknown')
    expect(specialtyFromPositionName('Apprentice')).toBe('unknown')
    expect(specialtyFromPositionName('Taper')).toBe('unknown')
  })

  it('still prefers a drywall trade over support when both could match', () => {
    expect(specialtyFromPositionName('Apprentice Finisher')).toBe('finisher')
    expect(specialtyFromPositionName('Finish Carpenter')).toBe('finisher')
  })
})

describe('isSupportSpecialty', () => {
  it('is true only for support', () => {
    expect(isSupportSpecialty('support')).toBe(true)
    expect(isSupportSpecialty('unknown')).toBe(false)
    expect(isSupportSpecialty('finisher')).toBe(false)
  })
})

describe('isMeasurerSpecialty', () => {
  it('is true only for measurer', () => {
    expect(isMeasurerSpecialty('measurer')).toBe(true)
    expect(isMeasurerSpecialty('hanger')).toBe(false)
    expect(isMeasurerSpecialty('finisher')).toBe(false)
  })
})
