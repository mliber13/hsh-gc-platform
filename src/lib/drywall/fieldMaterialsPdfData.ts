import type { FieldTakeoff } from '@/types/drywall'

export interface FieldMaterialsBoardRow {
  id: string
  area: string
  boardType: string
  thickness: string
  width: string
  length: string
  quantity: number
  sqft: number
  measurementNotes: string
}

export interface FieldMaterialsAccessoryRow {
  id: string
  type: string
  subtype: string
  quantity: number
  unit: string
  length: string
  threadType: string
  autoCalculated: boolean
}

/** Board line description without quantity (qty is its own column). */
export function formatBoardLineDescription(board: Pick<FieldMaterialsBoardRow, 'thickness' | 'boardType' | 'width' | 'length'>): string {
  return `${board.thickness || ''}" ${board.boardType || 'Board'} (${board.width || ''}" x ${board.length || ''}')`
}

export function extractMaterialsFromFieldTakeoff(takeoff: FieldTakeoff): {
  boards: FieldMaterialsBoardRow[]
  accessories: FieldMaterialsAccessoryRow[]
} {
  const boards: FieldMaterialsBoardRow[] = []

  for (const measurement of takeoff.measurements ?? []) {
    for (const board of measurement.boards ?? []) {
      const width = parseFloat(String(board.width)) || 0
      const length = parseFloat(String(board.length)) || 0
      const quantity = parseFloat(String(board.quantity)) || 0
      if (quantity <= 0) continue
      const sqftPerBoard = (width / 12) * length
      boards.push({
        id: board.id,
        area: measurement.area || 'Unassigned',
        boardType: board.boardType || 'Standard',
        thickness: String(board.thickness ?? ''),
        width: String(board.width ?? ''),
        length: String(board.length ?? ''),
        quantity,
        sqft: sqftPerBoard * quantity,
        measurementNotes: measurement.notes || '',
      })
    }
  }

  const accessories: FieldMaterialsAccessoryRow[] = []
  for (const acc of takeoff.accessories ?? []) {
    accessories.push({
      id: acc.id,
      type: acc.type || '',
      subtype: acc.subtype || '',
      quantity: parseFloat(String(acc.quantity)) || 0,
      unit: acc.unit || 'pcs',
      length: acc.length || '',
      threadType: acc.threadType || '',
      autoCalculated: Boolean(acc.autoCalculated),
    })
  }

  return { boards, accessories }
}

export function formatAccessoryLineDescription(
  acc: Pick<FieldMaterialsAccessoryRow, 'subtype' | 'type' | 'length' | 'threadType'>,
): string {
  let description = acc.subtype || acc.type || 'Accessory'
  if (acc.length) description += ` (${acc.length})`
  if (acc.threadType) description += ` - ${acc.threadType}`
  return description
}
