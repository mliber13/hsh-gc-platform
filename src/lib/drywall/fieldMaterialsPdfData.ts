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

/** Group key for thickness + width (board type and length stay on individual rows). */
export function boardThicknessWidthKey(
  board: Pick<FieldMaterialsBoardRow, 'thickness' | 'width'>,
): string {
  return `${String(board.thickness ?? '').trim()}|${String(board.width ?? '').trim()}`
}

export function formatBoardThicknessWidthGroupLabel(
  thickness: string,
  width: string,
): string {
  const t = thickness ? `${thickness}"` : '—'
  const w = width ? `${width}" wide` : '—'
  return `${t} · ${w}`
}

/** Line description when thickness/width are shown on the group header. */
export function formatBoardLineDescriptionInGroup(
  board: Pick<FieldMaterialsBoardRow, 'boardType' | 'length'>,
): string {
  const type = board.boardType || 'Board'
  const length = board.length ? `${board.length}'` : ''
  return length ? `${type} (${length})` : type
}

export interface FieldMaterialsThicknessWidthGroup {
  thickness: string
  width: string
  label: string
  boards: FieldMaterialsBoardRow[]
}

export interface FieldMaterialsAreaGroup {
  area: string
  thicknessWidthGroups: FieldMaterialsThicknessWidthGroup[]
}

function parseBoardDimension(value: string): number {
  const n = parseFloat(String(value).replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function compareBoardThicknessWidth(
  a: Pick<FieldMaterialsThicknessWidthGroup, 'thickness' | 'width'>,
  b: Pick<FieldMaterialsThicknessWidthGroup, 'thickness' | 'width'>,
): number {
  const thicknessDiff = parseBoardDimension(a.thickness) - parseBoardDimension(b.thickness)
  if (thicknessDiff !== 0) return thicknessDiff
  return parseBoardDimension(a.width) - parseBoardDimension(b.width)
}

function compareBoardLines(a: FieldMaterialsBoardRow, b: FieldMaterialsBoardRow): number {
  const typeDiff = (a.boardType || '').localeCompare(b.boardType || '')
  if (typeDiff !== 0) return typeDiff
  const lengthDiff = parseBoardDimension(a.length) - parseBoardDimension(b.length)
  if (lengthDiff !== 0) return lengthDiff
  return (a.quantity || 0) - (b.quantity || 0)
}

/** Boards grouped by area, then thickness + width (for field materials PDF). */
export function groupBoardsForMaterialsPdf(boards: FieldMaterialsBoardRow[]): FieldMaterialsAreaGroup[] {
  const byArea = new Map<string, FieldMaterialsBoardRow[]>()

  for (const board of boards) {
    const area = board.area || 'Unassigned'
    if (!byArea.has(area)) byArea.set(area, [])
    byArea.get(area)!.push(board)
  }

  return [...byArea.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([area, areaBoards]) => {
      const byThicknessWidth = new Map<string, FieldMaterialsThicknessWidthGroup>()

      for (const board of areaBoards) {
        const key = boardThicknessWidthKey(board)
        if (!byThicknessWidth.has(key)) {
          byThicknessWidth.set(key, {
            thickness: board.thickness,
            width: board.width,
            label: formatBoardThicknessWidthGroupLabel(board.thickness, board.width),
            boards: [],
          })
        }
        byThicknessWidth.get(key)!.boards.push(board)
      }

      const thicknessWidthGroups = [...byThicknessWidth.values()]
        .sort(compareBoardThicknessWidth)
        .map((group) => ({
          ...group,
          boards: [...group.boards].sort(compareBoardLines),
        }))

      return { area, thicknessWidthGroups }
    })
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
