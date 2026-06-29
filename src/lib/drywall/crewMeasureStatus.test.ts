import { describe, expect, it } from 'vitest'
import { crewMeasureWorkflowStatus } from './crewMeasureStatus'
import type { FieldTakeoff } from '@/types/drywall'

describe('crewMeasureWorkflowStatus', () => {
  it('returns not_started for empty takeoff', () => {
    expect(crewMeasureWorkflowStatus(null)).toBe('not_started')
    expect(crewMeasureWorkflowStatus({ measurements: [], photos: [], accessories: [], checklist: [] })).toBe(
      'not_started',
    )
  })

  it('returns in_progress when draft content exists', () => {
    const takeoff: FieldTakeoff = {
      measurements: [
        {
          id: '1',
          area: 'Kitchen',
          boards: [{ id: 'b1', boardType: 'Drywall', thickness: '1/2', width: '48', length: '10', quantity: '10' }],
        },
      ],
      photos: [],
      accessories: [],
      checklist: [],
    }
    expect(crewMeasureWorkflowStatus(takeoff)).toBe('in_progress')
  })

  it('prioritizes review status over draft content', () => {
    const takeoff: FieldTakeoff = {
      measurements: [
        {
          id: '1',
          area: 'Kitchen',
          boards: [{ id: 'b1', boardType: 'Drywall', thickness: '1/2', width: '48', length: '10', quantity: '10' }],
        },
      ],
      photos: [],
      accessories: [],
      checklist: [],
      reviewStatus: 'pending_review',
    }
    expect(crewMeasureWorkflowStatus(takeoff)).toBe('pending_review')
  })
})
