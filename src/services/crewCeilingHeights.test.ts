/**
 * The crew Ceiling heights card (2026-10-15): the measurer's heights win, a job not yet
 * measured shows the quote's takeoff areas, tall rooms are flagged — and sqft per area shows
 * only to someone allowed to see the job's size (job info on, not a field foreman).
 */
import { describe, expect, it } from 'vitest'
import { resolveCeilingHeights } from './crewWorkspaceService'
import type { FieldTakeoff } from '@/types/drywall'

const quote = {
  version: 3,
  default_height_ft: 9,
  lineItems: [
    { id: '1', type: 'drywall', location: '1st Floor', quantity: 4000, height_ft: 9, description: "9' 1/2\" Walls" },
    { id: '2', type: 'drywall', location: '1st Floor', quantity: 1800, description: 'Ceiling', height_ft: 9 },
    { id: '3', type: 'drywall', location: 'Great Room', quantity: 1200, height_ft: 18, description: "18' 1/2\" Walls" },
  ],
}

// 4×12 sheets = 48 sqft each.
const board = (n: number) => [{ id: `b${n}`, boardType: 'Drywall', thickness: '1/2', width: '48', length: '12', quantity: String(n) }]

describe('crew ceiling heights', () => {
  it('a job not yet measured shows the quote’s areas with their quoted sqft, tall ones flagged', () => {
    expect(resolveCeilingHeights({ quote }, null, true)).toEqual([
      { area: '1st Floor', heightFt: 9, source: 'quoted', sqft: 5800, tall: false },
      { area: 'Great Room', heightFt: 18, source: 'quoted', sqft: 1200, tall: true },
    ])
  })

  it('sqft is withheld from anyone who may not see the job’s size', () => {
    const rows = resolveCeilingHeights({ quote }, null, false)
    expect(rows.map((r) => r.sqft)).toEqual([null, null])
    expect(rows.map((r) => `${r.area} ${r.heightFt}`)).toEqual(['1st Floor 9', 'Great Room 18'])
  })

  it('the measurer’s heights and sqft win once the job is measured', () => {
    const field = {
      measurements: [
        { id: 'a', area: 'Main floor', heightFt: 9, boards: board(100) },
        { id: 'b', area: 'Great room', heightFt: 17, boards: board(25) },
        { id: 'c', area: 'Closet', boards: board(2) },
      ],
    } as unknown as FieldTakeoff
    expect(resolveCeilingHeights({ quote }, field, true).map((h) => `${h.area} ${h.heightFt} ${h.sqft} ${h.source}`)).toEqual([
      'Main floor 9 4800 measured',
      'Great room 17 1200 measured',
    ])
  })

  it('nothing to show when neither has a height', () => {
    expect(resolveCeilingHeights({ quote: { version: 3, lineItems: [] } }, null, true)).toEqual([])
  })
})
