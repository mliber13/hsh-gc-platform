import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { parseTakeoffFileV3 } from './quoteTakeoffImportV3'

/** Build an in-memory Togal-style xlsx (no floor column) and wrap it as a File. */
function makeTogalFile(): File {
  const aoa = [
    ['Classification', 'Quantity 1', 'Quantity1 UOM', 'Quantity 2', 'Quantity2 UOM'],
    ['Unassigned'],
    ['Ceiling Assembly', 188816.79, 'Square Feet (SF)', 0, ''],
    ['Suspending Drywall Grid', 29623.29, 'Square Feet (SF)', 9769.17, 'Feet (FT)'],
    ['ACT-4', 42959.37, 'Square Feet (SF)', 1875.27, 'Feet (FT)'],
    ['10\' - Type X w/RC 24"OC', 115119.43, 'Square Feet (SF)', 11511.94, 'Feet (FT)'],
    ['9\' 5/8" Walls', 450324.31, 'Square Feet (SF)', 0, ''],
    ['13\' - 3 5/8" Metal Stud', 1540.7, 'Feet (FT)', 0, ''],
    ['Total', 947257.7, '', 24418.5, ''],
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Togal')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new File([buf], 'togal.xlsx')
}

describe('parseTakeoffFileV3', () => {
  it('maps a floorless Togal export to v3 line items, two lines for RC rows', async () => {
    const { lines } = await parseTakeoffFileV3(makeTogalFile())
    const byClass = (c: string) => lines.filter((l) => l.sourceClassification === c).map((l) => l.line)

    // Total + Unassigned skipped; 6 classifications → 9 lines (Ceiling Assembly,
    // the w/RC row, and Suspended Grid each expand to two lines).
    expect(lines).toHaveLength(9)

    // Ceiling Assembly = drywall ceiling + RC channel ceiling.
    const ceiling = byClass('Ceiling Assembly')
    expect(ceiling.map((l) => l.type).sort()).toEqual(['drywall', 'rc_channel'])
    const ceilDrywall = ceiling.find((l) => l.type === 'drywall')!
    expect(ceilDrywall.catalog_id).toBe('5_8_type_x')
    expect(ceilDrywall.quantity).toBeCloseTo(188816.79)
    const ceilRc = ceiling.find((l) => l.type === 'rc_channel')!
    expect(ceilRc.rc_surface).toBe('ceiling')
    expect(ceilRc.quantity).toBeCloseTo(188816.79)

    // Wall RC row: drywall SF + rc_channel wall LF @ height.
    const wRc = byClass('10\' - Type X w/RC 24"OC')
    const wRcDrywall = wRc.find((l) => l.type === 'drywall')!
    expect(wRcDrywall.quantity).toBeCloseTo(115119.43)
    const wRcChannel = wRc.find((l) => l.type === 'rc_channel')!
    expect(wRcChannel.rc_surface).toBe('wall')
    expect(wRcChannel.quantity).toBeCloseTo(11511.94)
    expect(wRcChannel.rc_wall_height).toBe(10)

    // Plain wall defaults to 5/8" Type X per owner decision.
    const walls = byClass('9\' 5/8" Walls')
    expect(walls).toHaveLength(1)
    expect(walls[0].type).toBe('drywall')
    expect(walls[0].catalog_id).toBe('5_8_type_x')
    expect(walls[0].quantity).toBeCloseTo(450324.31)

    // Suspended grid = two lines: the grid (SF + perimeter) + drywall on it (same SF).
    const gridLines = byClass('Suspending Drywall Grid')
    expect(gridLines.map((l) => l.type).sort()).toEqual(['drywall', 'suspended_grid'])
    const grid = gridLines.find((l) => l.type === 'suspended_grid')!
    expect(grid.quantity).toBeCloseTo(29623.29)
    expect(grid.grid_perimeter).toBeCloseTo(9769.17)
    const gridDrywall = gridLines.find((l) => l.type === 'drywall')!
    expect(gridDrywall.quantity).toBeCloseTo(29623.29)
    expect(gridDrywall.catalog_id).toBe('5_8_type_x')

    // Acoustic: SF + perimeter.
    const act = byClass('ACT-4')[0]
    expect(act.type).toBe('acoustic')
    expect(act.quantity).toBeCloseTo(42959.37)
    expect(act.grid_perimeter).toBeCloseTo(1875.27)

    // Metal stud: LF-driven.
    const stud = byClass('13\' - 3 5/8" Metal Stud')[0]
    expect(stud.type).toBe('metal_stud')
    expect(stud.quantity).toBeCloseTo(1540.7)

    // No line came from the Total / Unassigned rows.
    expect(lines.some((l) => /total|unassigned/i.test(l.sourceClassification))).toBe(false)
  })

  /**
   * Shaped like the Goodwill Multi export (2026-10-13): area header rows, 2-layer rows with
   * the second layer in Quantity 2, an RC-only row, a 10' 6" height. Before this, the importer
   * summed both layers into one Level 4 line, priced RC on both layers, invented a drywall line
   * from the RC-only row's LF, left RC at $0, and put every line under "Imported takeoff".
   */
  describe('area headers, double layers and RC (Goodwill export)', () => {
    function goodwillFile(): File {
      const aoa = [
        ['Classification', 'Quantity 1', 'Quantity1 UOM', 'Quantity 2', 'Quantity2 UOM'],
        ['1st Floor', '', '', '', ''],
        ['Ceiling 5/8" Drywall 2 Layers w/RC 24" OC', 6367.35, 'SF', 6367.35, 'SF'],
        ['10\' 6" 5/8" Walls ', 7013.51, 'SF', 0, ''],
        ['10\' 6" 5/8" MR Walls ', 554.2, 'SF', 0, ''],
        ['Total', 13935.06, '', 6367.35, ''],
        ['2nd Floor', '', '', '', ''],
        ['10\' 5/8" Walls - 2 Layers', 2051.66, 'SF', 2051.66, 'SF'],
        ['10\' RC 24" OC', 412.06, 'FT', 0, ''],
        ['10\' 6" Walls w/RC', 1050, 'SF', 0, ''],
        ['Total', 3513.72, '', 2051.66, ''],
        ['Unassigned', '', '', '', ''],
        ['2x2 ACT', 3872.07, 'SF', 412.12, 'FT'],
      ]
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Togal')
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
      return new File([buf], 'goodwill.xlsx')
    }

    const RC = 'rc_deluxe'
    async function parse() {
      const { lines } = await parseTakeoffFileV3(goodwillFile(), { defaultRcCatalogId: RC })
      return lines
    }
    const of = (lines: Awaited<ReturnType<typeof parse>>, c: string) =>
      lines.filter((l) => l.sourceClassification === c.trim()).map((l) => l.line)

    it('takes each line’s location from the area header above it', async () => {
      const lines = await parse()
      expect(of(lines, '10\' 6" 5/8" Walls')[0].location).toBe('1st Floor')
      expect(of(lines, '10\' 5/8" Walls - 2 Layers')[0].location).toBe('2nd Floor')
      // "Unassigned" means no area.
      expect(of(lines, '2x2 ACT')[0].location).toBe('Imported takeoff')
      expect(lines.some((l) => /^(1st floor|2nd floor|total|unassigned)$/i.test(l.sourceClassification))).toBe(false)
    })

    it('splits a 2-layer row into a finished face and a hang-only base', async () => {
      const lines = await parse()
      const walls = of(lines, '10\' 5/8" Walls - 2 Layers')
      expect(walls).toHaveLength(2)
      const face = walls.find((l) => l.finish_scope_id === 'level_4')!
      const base = walls.find((l) => l.finish_scope_id === 'hang_only')!
      expect(face.quantity).toBeCloseTo(2051.66)
      expect(base.quantity).toBeCloseTo(2051.66)
      expect(base.catalog_id).toBe(face.catalog_id)
      // Set on the line so a project finisher rate cannot price the base as finished.
      expect(base.custom_finisher_rate).toBe(0)
      expect(face.custom_finisher_rate).toBeUndefined()
    })

    it('prices RC under a 2-layer ceiling on one layer, with the product preselected', async () => {
      const lines = await parse()
      const ceiling = of(lines, 'Ceiling 5/8" Drywall 2 Layers w/RC 24" OC')
      expect(ceiling.map((l) => l.type).sort()).toEqual(['drywall', 'drywall', 'rc_channel'])
      const rc = ceiling.find((l) => l.type === 'rc_channel')!
      expect(rc.quantity).toBeCloseTo(6367.35) // not 12,734.70
      expect(rc.rc_spacing_in).toBe(24)
      expect(rc.catalog_id).toBe(RC)
    })

    it('an RC-only row makes an RC line and no drywall', async () => {
      const lines = await parse()
      const rcOnly = of(lines, '10\' RC 24" OC')
      expect(rcOnly).toHaveLength(1)
      expect(rcOnly[0].type).toBe('rc_channel')
      expect(rcOnly[0].rc_surface).toBe('wall')
      expect(rcOnly[0].quantity).toBeCloseTo(412.06)
      expect(rcOnly[0].rc_wall_height).toBe(10)
    })

    it('reads 10\' 6" as 10.5 feet', async () => {
      const lines = await parse()
      const rc = of(lines, '10\' 6" Walls w/RC').find((l) => l.type === 'rc_channel')!
      expect(rc.rc_wall_height).toBe(10.5)
      expect(rc.quantity).toBeCloseTo(1050 / 10.5) // wall LF derived from SF ÷ height
    })

    it('reads the ACT tile size from the name instead of leaving it to default to 2x4', async () => {
      const lines = await parse()
      const act = lines.find((l) => l.sourceClassification === '2x2 ACT')!
      expect(act.line.acst_tile_size).toBe('2x2')
      expect(act.warning).toBeUndefined()
    })

    it('MR walls come in as MR board', async () => {
      const lines = await parse()
      expect(of(lines, '10\' 6" 5/8" MR Walls')[0].catalog_id).toBe('5_8_mr')
    })

    it('without a product to preselect, RC says so instead of quietly pricing $0', async () => {
      const { lines } = await parseTakeoffFileV3(goodwillFile())
      const rc = lines.find((l) => l.line.type === 'rc_channel')!
      expect(rc.line.catalog_id || '').toBe('')
      expect(rc.warning).toMatch(/pick the rc product/i)
    })

    it('a 2-layer row with one quantity gives both layers that quantity', async () => {
      const ws = XLSX.utils.aoa_to_sheet([
        ['Classification', 'Quantity 1', 'Quantity1 UOM'],
        ['Walls - 2 Layers', 1000, 'SF'],
      ])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Togal')
      const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
      const { lines } = await parseTakeoffFileV3(new File([buf], 'x.xlsx'))
      expect(lines.map((l) => [l.line.finish_scope_id, l.line.quantity])).toEqual([
        ['level_4', 1000],
        ['hang_only', 1000],
      ])
    })
  })

  it('throws a clear error when there are no priced rows', async () => {
    const ws = XLSX.utils.aoa_to_sheet([['Classification'], ['Notes only']])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    await expect(parseTakeoffFileV3(new File([buf], 'empty.xlsx'))).rejects.toThrow(/no priced rows/i)
  })
})
