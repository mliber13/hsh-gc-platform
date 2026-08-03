import { describe, expect, it } from 'vitest'
import { formatDateOnly } from './dateFormat'

describe('formatDateOnly', () => {
  it('keeps a date-only string on its calendar day (no UTC-midnight off-by-one)', () => {
    // These parts are timezone-independent because the date is parsed as local midnight.
    expect(formatDateOnly('2026-07-27', { day: 'numeric' })).toBe('27')
    expect(formatDateOnly('2026-07-27', { month: 'numeric' })).toBe('7')
    expect(formatDateOnly('2026-01-01', { day: 'numeric' })).toBe('1')
    expect(formatDateOnly('2026-12-31', { day: 'numeric' })).toBe('31')
  })

  it('accepts a Date and uses its local calendar parts', () => {
    expect(formatDateOnly(new Date(2026, 6, 27), { day: 'numeric' })).toBe('27')
  })

  it('returns the fallback for null/empty', () => {
    expect(formatDateOnly(null)).toBe('')
    expect(formatDateOnly(undefined)).toBe('')
    expect(formatDateOnly('', {}, '—')).toBe('—')
  })
})
