/**
 * mergeFieldTakeoff rebuilds every board from a list of fields, on the operator field page and
 * the crew pages alike. A field missing from that list is dropped on load and lost on the next
 * save — which is what happened to hangOnly (2026-10-08 → 10-13, Goodwill Multi-1's double
 * layer read as finished board).
 */
import { describe, expect, it } from 'vitest'
import { hangOnlyMeasuredSqft } from './hangOnly'
import { mergeFieldTakeoff } from './fieldMeasurementUtils'
import type { FieldTakeoff } from '@/types/drywall'

const board = (extra: Record<string, unknown>) => ({
  id: 'b',
  boardType: 'Fire-Resistant',
  thickness: '5/8',
  width: '48',
  length: '10',
  quantity: '56',
  ...extra,
})
const takeoff = (boards: Record<string, unknown>[]) =>
  ({ measurements: [{ id: 'a', area: 'Back Hall', notes: '', boards }] }) as unknown as FieldTakeoff

describe('mergeFieldTakeoff', () => {
  it('keeps an explicit hang-only flag, both ways', () => {
    const merged = mergeFieldTakeoff(takeoff([board({ hangOnly: true }), board({ id: 'c', hangOnly: false })]))
    expect(merged.measurements[0].boards.map((b) => b.hangOnly)).toEqual([true, false])
  })

  it('a base layer still counts as hang-only after a load', () => {
    const merged = mergeFieldTakeoff(takeoff([board({ hangOnly: true })]))
    expect(hangOnlyMeasuredSqft(merged.measurements)).toBe(56 * 40)
  })

  it('leaves the flag absent when it was absent, so the board-type default applies', () => {
    const merged = mergeFieldTakeoff(takeoff([board({ boardType: 'Cement' })]))
    expect('hangOnly' in merged.measurements[0].boards[0]).toBe(false)
    expect(hangOnlyMeasuredSqft(merged.measurements)).toBe(56 * 40)
  })

  it('ignores a malformed flag rather than trusting it', () => {
    const merged = mergeFieldTakeoff(takeoff([board({ hangOnly: 'yes' })]))
    expect('hangOnly' in merged.measurements[0].boards[0]).toBe(false)
  })
})
