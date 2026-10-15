/**
 * The crew Ceiling heights card (2026-10-15): the measurer's heights win, a job not yet
 * measured shows the quote's takeoff areas, and tall rooms are flagged.
 */
import { describe, expect, it } from 'vitest'

import { resolveCeilingHeights } from './crewWorkspaceService'
import type { FieldTakeoff } from '@/types/drywall'

const quote = {
  version: 3,
  default_height_ft: 9,
  lineItems: [
    { id: '1', type: 'drywall', location: '1st Floor', quantity: 4000, height_ft: 9, description: "9' 1/2\" Walls" },
    { id: '2', type: 'drywall', location: 'Great Room', quantity: 1200, height_ft: 18, description: "18' 1/2\" Walls" },
  ],
}

describe('crew ceiling heights', () => {
  it('a job not yet measured shows the quote’s areas, tall ones flagged', () => {
    expect(resolveCeilingHeights({ quote }, null)).toEqual([
      { area: '1st Floor', heightFt: 9, source: 'quoted', tall: false },
      { area: 'Great Room', heightFt: 18, source: 'quoted', tall: true },
    ])
  })

  it('the measurer’s heights win once the job is measured', () => {
    const field = {
      measurements: [
        { id: 'a', area: 'Main floor', heightFt: 9, boards: [] },
        { id: 'b', area: 'Great room', heightFt: 17, boards: [] },
        { id: 'c', area: 'Closet', boards: [] },
      ],
    } as unknown as FieldTakeoff
    expect(resolveCeilingHeights({ quote }, field).map((h) => `${h.area} ${h.heightFt} ${h.source}`)).toEqual([
      'Main floor 9 measured',
      'Great room 17 measured',
    ])
  })

  it('nothing to show when neither has a height', () => {
    expect(resolveCeilingHeights({ quote: { version: 3, lineItems: [] } }, null)).toEqual([])
  })
})
