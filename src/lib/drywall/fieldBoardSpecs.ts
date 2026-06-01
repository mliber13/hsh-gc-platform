// Board type / size presets — parity with FieldMeasurementStage.jsx

export const FIELD_BOARD_TYPES = [
  'Standard',
  'Moisture-Resistant',
  'Cement',
  'Fire-Resistant',
] as const

export function getAvailableWidths(boardType: string, thickness: string): string[] {
  if (boardType === 'Moisture-Resistant') return ['48']
  if (thickness === '1/4') return ['48']
  return ['48', '54']
}

export function getAvailableThicknesses(boardType: string): string[] {
  if (boardType === 'Moisture-Resistant') return ['1/2', '5/8']
  if (boardType === 'Cement') return ['1/2', '5/8']
  return ['1/4', '3/8', '1/2', '5/8']
}

export function getAvailableLengths(boardType: string, width: string, thickness: string): string[] {
  if (width === '54') return ['16', '14', '12', '10']
  if (boardType === 'Moisture-Resistant') return ['12', '10', '8']
  if (thickness === '1/4') return ['8', '10']
  return ['8', '9', '10', '12', '14', '16']
}

export function formatThicknessLabel(thickness: string): string {
  if (thickness === '1/4') return '1/4"'
  if (thickness === '3/8') return '3/8"'
  if (thickness === '1/2') return '1/2"'
  if (thickness === '5/8') return '5/8"'
  return thickness
}

/** Apply board field change with dependent clears (drywall handleBoardChange). */
export function applyBoardFieldChange(
  board: {
    boardType?: string
    thickness?: string
    width?: string
    length?: string
    quantity?: string
  },
  field: 'boardType' | 'thickness' | 'width' | 'length' | 'quantity',
  value: string,
): typeof board {
  const updated = { ...board, [field]: value }

  if (field === 'boardType') {
    const thicknesses = getAvailableThicknesses(value)
    if (updated.thickness && !thicknesses.includes(updated.thickness)) {
      updated.thickness = ''
    }
    const widths = getAvailableWidths(value, updated.thickness || '')
    if (updated.width && !widths.includes(updated.width)) {
      updated.width = ''
    }
    const lengths = getAvailableLengths(value, updated.width || '', updated.thickness || '')
    if (updated.length && !lengths.includes(updated.length)) {
      updated.length = ''
    }
  }

  if (field === 'thickness') {
    const widths = getAvailableWidths(updated.boardType || '', value)
    if (updated.width && !widths.includes(updated.width)) {
      updated.width = ''
    }
    const lengths = getAvailableLengths(updated.boardType || '', updated.width || '', value)
    if (updated.length && !lengths.includes(updated.length)) {
      updated.length = ''
    }
  }

  if (field === 'width') {
    const lengths = getAvailableLengths(updated.boardType || '', value, updated.thickness || '')
    if (updated.length && !lengths.includes(updated.length)) {
      updated.length = ''
    }
  }

  return updated
}
