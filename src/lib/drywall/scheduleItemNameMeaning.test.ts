import { describe, expect, it } from 'vitest'
import {
  parseBillingDrawName,
  scheduleItemRenameImpact,
} from '@/lib/drywall/scheduleItemNameMeaning'

describe('parseBillingDrawName', () => {
  it('reads an explicit percentage', () => {
    expect(parseBillingDrawName('Bill 50%')).toEqual({ kind: 'percent', pct: 50 })
    expect(parseBillingDrawName('Bill 12.5 %')).toEqual({ kind: 'percent', pct: 12.5 })
  })

  it('treats completion words as the remainder', () => {
    for (const name of ['Bill final', 'Bill - complete', 'Bill remaining', 'Bill balance']) {
      expect(parseBillingDrawName(name)).toEqual({ kind: 'remainder' })
    }
  })

  it('requires "bill" as a leading word, not a substring', () => {
    expect(parseBillingDrawName('Billboard install')).toBeNull()
    expect(parseBillingDrawName('Final bill 50%')).toBeNull()
  })

  it('is not a draw without a percentage or completion word', () => {
    expect(parseBillingDrawName('Bill')).toBeNull()
    expect(parseBillingDrawName('Hang 2nd floor')).toBeNull()
  })
})

describe('scheduleItemRenameImpact', () => {
  it('stays quiet when the rename changes nothing derived', () => {
    const impact = scheduleItemRenameImpact('Hang main floor', 'Hang 1st floor')
    expect(impact.hasImpact).toBe(false)
    expect(impact.warnings).toEqual([])
  })

  it('warns when a billing draw would drop out of the forecast', () => {
    const impact = scheduleItemRenameImpact('Bill 50%', 'Progress billing')
    expect(impact.billingChanged).toBe(true)
    expect(impact.warnings[0]).toContain('stops counting as a billing draw')
    expect(impact.warnings[0]).toContain('50%')
  })

  it('warns when a rename would create a new billing draw', () => {
    const impact = scheduleItemRenameImpact('Progress billing', 'Bill 30%')
    expect(impact.billingChanged).toBe(true)
    expect(impact.warnings[0]).toContain('starts counting as a billing draw')
    expect(impact.warnings[0]).toContain('30%')
  })

  it('warns when the draw amount changes', () => {
    const impact = scheduleItemRenameImpact('Bill 50%', 'Bill 40%')
    expect(impact.billingChanged).toBe(true)
    expect(impact.warnings[0]).toContain('from 50% to 40%')
  })

  it('does not flag a billing rename that keeps the same draw', () => {
    const impact = scheduleItemRenameImpact('Bill 50%', 'Bill 50% - second draw')
    expect(impact.billingChanged).toBe(false)
  })

  it('warns when the phase would change', () => {
    const impact = scheduleItemRenameImpact('Hang 2nd floor', '2nd floor boards')
    expect(impact.phaseChanged).toBe(true)
    expect(impact.fromPhase).toBe('hang')
    expect(impact.toPhase).toBe('other')
    expect(impact.warnings[0]).toContain('Phase changes from Hang to Other')
  })

  it('reports billing before phase when both change', () => {
    const impact = scheduleItemRenameImpact('Bill 50%', 'Hang main floor')
    expect(impact.warnings).toHaveLength(2)
    expect(impact.warnings[0]).toContain('billing draw')
    expect(impact.warnings[1]).toContain('Phase changes')
  })

  it('never reports a phase change for office items', () => {
    const impact = scheduleItemRenameImpact('Hang main floor', 'Order materials', 'office')
    expect(impact.phaseChanged).toBe(false)
    expect(impact.fromPhase).toBe('office')
    expect(impact.toPhase).toBe('office')
  })

  it('treats renames within the same phase as harmless', () => {
    const impact = scheduleItemRenameImpact('Finish 1st floor', 'Mud and tape 1st floor')
    expect(impact.phaseChanged).toBe(false)
    expect(impact.hasImpact).toBe(false)
  })
})
