import { describe, expect, it } from 'vitest'
import {
  formatBoardLineDescriptionInGroup,
  formatBoardThicknessWidthGroupLabel,
  groupBoardsForMaterialsPdf,
  type FieldMaterialsBoardRow,
} from './fieldMaterialsPdfData'

function board(partial: Partial<FieldMaterialsBoardRow> & Pick<FieldMaterialsBoardRow, 'id'>): FieldMaterialsBoardRow {
  return {
    area: 'Main',
    boardType: 'Standard',
    thickness: '5/8',
    width: '48',
    length: '12',
    quantity: 1,
    sqft: 48,
    measurementNotes: '',
    ...partial,
  }
}

describe('groupBoardsForMaterialsPdf', () => {
  it('groups boards by area then thickness and width', () => {
    const grouped = groupBoardsForMaterialsPdf([
      board({ id: '1', area: 'Level 1', thickness: '5/8', width: '54', length: '10', quantity: 4 }),
      board({ id: '2', area: 'Level 1', thickness: '5/8', width: '48', length: '12', quantity: 10 }),
      board({ id: '3', area: 'Level 1', thickness: '5/8', width: '48', length: '10', quantity: 6 }),
      board({ id: '4', area: 'Garage', thickness: '1/2', width: '48', length: '12', quantity: 2 }),
    ])

    expect(grouped).toHaveLength(2)
    expect(grouped[0].area).toBe('Garage')
    expect(grouped[0].thicknessWidthGroups).toHaveLength(1)
    expect(grouped[0].thicknessWidthGroups[0].label).toBe('1/2" · 48" wide')

    const level1 = grouped[1]
    expect(level1.area).toBe('Level 1')
    expect(level1.thicknessWidthGroups).toHaveLength(2)
    expect(level1.thicknessWidthGroups[0].label).toBe('5/8" · 48" wide')
    expect(level1.thicknessWidthGroups[0].boards).toHaveLength(2)
    expect(level1.thicknessWidthGroups[1].label).toBe('5/8" · 54" wide')
    expect(level1.thicknessWidthGroups[1].boards).toHaveLength(1)
  })
})

describe('formatBoardThicknessWidthGroupLabel', () => {
  it('formats thickness and width for subgroup headers', () => {
    expect(formatBoardThicknessWidthGroupLabel('5/8', '48')).toBe('5/8" · 48" wide')
  })
})

describe('formatBoardLineDescriptionInGroup', () => {
  it('omits thickness and width from line items under a group', () => {
    expect(
      formatBoardLineDescriptionInGroup({ boardType: 'Type X', length: '12' }),
    ).toBe('Type X (12\')')
  })
})
