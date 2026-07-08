import { describe, expect, it } from 'vitest'
import { createDefaultDrywallCatalogSeeds } from './catalogSeeds'
import {
  CORNER_BEAD_LF_PER_STICK,
  allocateQuoteBeadSticksAcrossLines,
  computeLineAccessories,
} from './quoteV3Accessories'
import type { QuoteLineItem } from '@/types/drywall'

const catalogs = createDefaultDrywallCatalogSeeds()
const level4 = catalogs.finish_scopes.find((s) => s.id === 'level_4')!

function drywallLine(id: string, sqft: number): QuoteLineItem {
  return {
    id,
    type: 'drywall',
    description: 'Walls',
    location: '1st',
    quantity: sqft,
    catalog_id: '1_2_regular',
    finish_scope_id: 'level_4',
    waste_pct: 10,
  }
}

describe('quote bead sticks → corner bead accessories', () => {
  it('allocates quote bead_sticks across drywall lines by sqft share', () => {
    const lines = [drywallLine('a', 8000), drywallLine('b', 2000)]
    const alloc = allocateQuoteBeadSticksAcrossLines(lines, 22)
    expect(alloc.get('a')).toBe(17)
    expect(alloc.get('b')).toBe(5)
    expect([...alloc.values()].reduce((s, n) => s + n, 0)).toBe(22)
  })

  it('includes metal corner bead and compound add-ons when bead sticks are allocated', () => {
    const line = drywallLine('line-1', 10000)
    const result = computeLineAccessories(
      line,
      level4,
      catalogs.accessories,
      22,
    )
    const cornerBead = result.byCategory.corner_bead
    expect(cornerBead).toHaveLength(1)
    expect(cornerBead[0].display_name).toBe('Metal Corner Bead')
    expect(cornerBead[0].units).toBe(22 * CORNER_BEAD_LF_PER_STICK)
    expect(cornerBead[0].cost).toBeCloseTo(22 * CORNER_BEAD_LF_PER_STICK * 0.85, 2)

    const lite = result.items.find((i) => i.catalogEntryId === 'joint_compound_lite_weight')
    const easy = result.items.find((i) => i.catalogEntryId === 'joint_compound_easy_sand_90')
    expect(lite).toBeDefined()
    expect(easy).toBeDefined()
    const baseLite = Math.ceil((11000 / 4800) * 8)
    expect(lite!.units).toBe(baseLite + Math.ceil(22 / 15))
    expect(easy!.units).toBe(Math.ceil(11000 / 5000) + Math.ceil(22 / 10))
  })

  it('uses per-line corner_bead_lf override when set', () => {
    const line: QuoteLineItem = {
      ...drywallLine('line-1', 1000),
      accessoryOverrides: { corner_bead_lf: 120 },
    }
    const result = computeLineAccessories(line, level4, catalogs.accessories, 0)
    expect(result.byCategory.corner_bead[0].units).toBe(120)
  })

  it('skips bead allocation on lines with accessories_in_material_rate', () => {
    const lines = [
      { ...drywallLine('a', 5000), accessories_in_material_rate: true },
      drywallLine('b', 5000),
    ]
    const alloc = allocateQuoteBeadSticksAcrossLines(lines, 10)
    expect(alloc.has('a')).toBe(false)
    expect(alloc.get('b')).toBe(10)
  })
})
