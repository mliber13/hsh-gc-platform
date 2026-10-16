/**
 * Mark, 2026-10-16: editing an approved measurement keeps the approval, but the change is
 * written down — when, who, sqft before and after — and shown under the approval.
 */
import { describe, expect, it } from 'vitest'
import { recordChangeAfterApproval } from './fieldReview'
import type { FieldTakeoff } from '@/types/drywall'

// 4×12 sheets = 48 sqft each.
const takeoff = (sheets: number, review: Partial<FieldTakeoff> = {}): FieldTakeoff =>
  ({
    measurements: [
      { id: 'a', area: '1st floor', boards: [{ id: 'b', boardType: 'Drywall', thickness: '1/2', width: '48', length: '12', quantity: String(sheets) }] },
    ],
    photos: [],
    accessories: [],
    checklist: [],
    ...review,
  }) as FieldTakeoff

const approved = { reviewStatus: 'approved' as const, approvedAt: '2026-10-01T12:00:00Z' }

describe('change after approval', () => {
  it('an approved measurement that grows records from, to, who and when — and stays approved', () => {
    const next = recordChangeAfterApproval(takeoff(20, approved), takeoff(30, approved), 'Mark Liber', '2026-10-16T15:00:00Z')
    expect(next.reviewStatus).toBe('approved')
    expect(next.changesAfterApproval).toEqual([{ at: '2026-10-16T15:00:00Z', by: 'Mark Liber', fromSqft: 960, toSqft: 1440 }])
  })

  it('a second change adds to the list', () => {
    const first = recordChangeAfterApproval(takeoff(20, approved), takeoff(30, approved), 'Mark', 'T1')
    const second = recordChangeAfterApproval(first, { ...first, measurements: takeoff(25).measurements }, 'Kristen', 'T2')
    expect(second.changesAfterApproval?.map((c) => `${c.fromSqft}→${c.toSqft} ${c.by}`)).toEqual(['960→1440 Mark', '1440→1200 Kristen'])
  })

  it('nothing is recorded before approval, or when the sqft did not move', () => {
    expect(recordChangeAfterApproval(takeoff(20), takeoff(30), 'Mark', 'T').changesAfterApproval).toBeUndefined()
    expect(recordChangeAfterApproval(takeoff(20, approved), takeoff(20, { ...approved, notes: 'x' }), 'Mark', 'T').changesAfterApproval).toBeUndefined()
  })

  it('a takeoff approved the old way, with the labor rates, counts as approved', () => {
    const legacy = { reviewApprovedRates: { hangerRate: 0.3, finisherRate: 0.35 } }
    expect(recordChangeAfterApproval(takeoff(20, legacy), takeoff(21, legacy), 'Mark', 'T').changesAfterApproval).toHaveLength(1)
  })

  it('the record survives loading the takeoff', async () => {
    const { mergeFieldTakeoff } = await import('./fieldMeasurementUtils')
    const next = recordChangeAfterApproval(takeoff(20, approved), takeoff(30, approved), 'Mark', 'T')
    expect(mergeFieldTakeoff(next).changesAfterApproval).toHaveLength(1)
  })
})
