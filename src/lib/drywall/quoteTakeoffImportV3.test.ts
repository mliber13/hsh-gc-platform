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

  it('throws a clear error when there are no priced rows', async () => {
    const ws = XLSX.utils.aoa_to_sheet([['Classification'], ['Notes only']])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    await expect(parseTakeoffFileV3(new File([buf], 'empty.xlsx'))).rejects.toThrow(/no priced rows/i)
  })
})
