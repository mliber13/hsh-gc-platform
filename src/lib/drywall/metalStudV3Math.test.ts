import { describe, expect, it } from 'vitest'
import { computeLineItem } from './quoteV3Math'
import { createDefaultDrywallCatalogSeeds } from './catalogSeeds'
import { createQuoteLineItem } from './createEmptyDrywallQuoteV3'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

function catalogsWithMetalStud(): OrgDrywallCatalogs {
  return {
    ...createDefaultDrywallCatalogSeeds(),
    metal_stud: [
      {
        id: 'ms_stud_3625_20',
        display_name: '3⅝" 20ga stud',
        size: '3.625',
        gauge: '20',
        component: 'stud',
        material_rate_per_lf: 0.9,
        labor_rate: 1.5,
      },
      {
        id: 'ms_track_3625_20',
        display_name: '3⅝" 20ga track',
        size: '3.625',
        gauge: '20',
        component: 'track',
        material_rate_per_lf: 1.1,
        labor_rate: 0,
      },
    ],
  }
}

// Labor burden off so the assertions are the raw v2 formula results.
const NO_BURDEN = { componentIncludeLaborBurden: false }

describe('computeLineItem metal_stud', () => {
  it('matches the v2 stud/track LF formulas (waste 0)', () => {
    const line = {
      ...createQuoteLineItem('metal_stud', { location: 'L1' }),
      quantity: 100, // wall LF
      ms_wall_height: 10,
      ms_spacing_in: 16,
      ms_tracks_per_run: 2,
      ms_size: '3.625',
      ms_gauge: '20',
      waste_pct: 0,
    }
    const m = computeLineItem(line, catalogsWithMetalStud(), NO_BURDEN)
    // studs = ceil(100 / (16/12)) = ceil(75) = 75
    expect(m.metalStudBreakdown?.studCount).toBe(75)
    // stud LF = 75 * 10 = 750; track LF = 100 * 2 = 200
    expect(m.metalStudBreakdown?.studLf).toBeCloseTo(750)
    expect(m.metalStudBreakdown?.trackLf).toBeCloseTo(200)
    // material = 750*0.9 + 200*1.1 = 675 + 220 = 895
    expect(m.materialTotal).toBeCloseTo(895)
    // labor = 100 * 1.5 = 150
    expect(m.laborTotal).toBeCloseTo(150)
    expect(m.lineTotal).toBeCloseTo(1045)
  })

  it('applies waste to stud LF, track LF and labor', () => {
    const line = {
      ...createQuoteLineItem('metal_stud', { location: 'L1' }),
      quantity: 100,
      ms_wall_height: 10,
      ms_spacing_in: 16,
      ms_tracks_per_run: 2,
      ms_size: '3.625',
      ms_gauge: '20',
      waste_pct: 10,
    }
    const m = computeLineItem(line, catalogsWithMetalStud(), NO_BURDEN)
    // material = (825*0.9) + (220*1.1) = 742.5 + 242 = 984.5 ; labor = 110*1.5 = 165
    expect(m.materialTotal).toBeCloseTo(984.5)
    expect(m.laborTotal).toBeCloseTo(165)
  })

  it('preserves a converted/blended line (custom_material_rate) without itemizing', () => {
    const line = {
      ...createQuoteLineItem('metal_stud', { location: 'L1' }),
      quantity: 300,
      custom_material_rate: 2.0,
      custom_labor_rate: 1.0,
      waste_pct: 0,
      // no ms geometry
      ms_wall_height: undefined,
    }
    const m = computeLineItem(line, catalogsWithMetalStud(), NO_BURDEN)
    expect(m.materialTotal).toBeCloseTo(600) // 300 * 2.0, no stud/track math
    expect(m.laborTotal).toBeCloseTo(300) // 300 * 1.0
    expect(m.metalStudBreakdown).toBeUndefined()
  })

  it('prices $0 material when the catalog has no matching size/gauge', () => {
    const line = {
      ...createQuoteLineItem('metal_stud', { location: 'L1' }),
      quantity: 100,
      ms_wall_height: 10,
      ms_size: '6', // no catalog entry for 6"
      ms_gauge: '20',
      waste_pct: 0,
    }
    const m = computeLineItem(line, catalogsWithMetalStud(), NO_BURDEN)
    expect(m.materialTotal).toBe(0)
  })
})
