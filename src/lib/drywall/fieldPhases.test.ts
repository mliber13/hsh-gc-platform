/**
 * Field phases, step 1 (docs/briefs/FIELD_PHASES.md): a fresh sheet per phase without losing
 * anything, and a job nobody phases behaving exactly as before.
 */
import { describe, expect, it } from 'vitest'
import {
  currentPhase,
  earlierPhases,
  inPhase,
  isPhased,
  phaseOf,
  startNextPhase,
  unmeasuredQuoteAreas,
} from './fieldPhases'
import { computeMeasuredSqft, mergeFieldTakeoff } from './fieldMeasurementUtils'
import type { FieldMeasurementArea, FieldTakeoff } from '@/types/drywall'

// 4×12 sheets = 48 sqft each.
const area = (name: string, sheets: number, phase?: number): FieldMeasurementArea => ({
  id: name,
  area: name,
  boards: [{ id: `${name}-b`, boardType: 'Drywall', thickness: '1/2', width: '48', length: '12', quantity: String(sheets) }],
  ...(phase ? { phase } : {}),
})

const takeoff = (areas: FieldMeasurementArea[], extra: Partial<FieldTakeoff> = {}): FieldTakeoff =>
  ({ measurements: areas, photos: [], accessories: [], checklist: [], ...extra }) as FieldTakeoff

describe('field phases', () => {
  it('a job nobody phases is Phase 1, untagged, exactly as before', () => {
    const t = takeoff([area('West Wing', 29)])
    expect(currentPhase(t)).toBe(1)
    expect(isPhased(t)).toBe(false)
    expect(earlierPhases(t)).toEqual([])
    expect(inPhase({ id: 'x', phase: 1 }, 1)).toEqual({ id: 'x' })
  })

  it('starting the next phase opens an empty sheet and folds the last one, keeping it', () => {
    const t = startNextPhase(takeoff([area('West Wing', 29)]))
    expect(currentPhase(t)).toBe(2)
    expect(earlierPhases(t)).toEqual([{ phase: 1, areas: t.measurements, sqft: 1392 }])
    // Job totals still count every phase.
    const withPhase2 = { ...t, measurements: [...t.measurements, inPhase(area('Grid ceiling', 11), 2)] }
    expect(computeMeasuredSqft(withPhase2.measurements)).toBe(1392 + 528)
    expect(withPhase2.measurements.map(phaseOf)).toEqual([1, 2])
  })

  it('an area already in a later phase keeps the current phase from falling behind it', () => {
    expect(currentPhase(takeoff([area('A', 1), area('B', 1, 3)]))).toBe(3)
  })

  it('the quote’s areas already measured in any phase are not offered again', () => {
    const measured = [area('1st Floor', 10), area('Garage', 5, 2)]
    expect(unmeasuredQuoteAreas([{ name: '1st floor' }, { name: 'Garage ' }, { name: 'Great Room' }], measured)).toEqual([
      { name: 'Great Room' },
    ])
  })

  /** mergeFieldTakeoff rebuilds areas and material lines field by field — the hangOnly trap. */
  it('phases survive loading the takeoff', () => {
    const saved = takeoff([area('A', 1), area('B', 1, 2)], {
      currentPhase: 2,
      accessories: [{ id: 'g', type: 'Suspended Drywall Grid', subtype: 'Main Runners', quantity: '12', phase: 2 }],
    })
    const loaded = mergeFieldTakeoff(saved)
    expect(loaded.currentPhase).toBe(2)
    expect(loaded.measurements.map((a) => a.phase)).toEqual([undefined, 2])
    expect(loaded.accessories[0].phase).toBe(2)
  })
})

describe('order phase', () => {
  /** normalizeOrder rebuilds every order on read — a key it does not list is gone on the next save. */
  it('an order keeps its phase through loading', async () => {
    const { parseLegacyOrders } = await import('@/services/drywallProjectsService')
    const orders = parseLegacyOrders({
      orders: [
        { id: 'a', status: 'complete', phase: 3, items: [{ id: 'i', description: '5/8" Fire-Resistant (48" x 12\')', quantity: '17' }] },
        { id: 'b', status: 'draft', items: [] },
      ],
    })
    expect(orders.map((o) => o.phase)).toEqual([3, undefined])
  })
})
