import { generateFieldId } from '@/lib/drywall/fieldMeasurementUtils'
import {
  extractMaterialsFromFieldTakeoff,
  formatAccessoryLineDescription,
  formatBoardLineDescription,
} from '@/lib/drywall/fieldMaterialsPdfData'
import { normalizeOrderUnit } from '@/lib/drywall/orderConstants'
import type { DrywallOrderItem, FieldTakeoff } from '@/types/drywall'

/** Build draft order line items from field takeoff (editor rows — no qty in description, no area in notes). */
export function suggestOrderItemsFromFieldTakeoff(takeoff: FieldTakeoff): DrywallOrderItem[] {
  const { boards, accessories } = extractMaterialsFromFieldTakeoff(takeoff)
  const items: DrywallOrderItem[] = []

  for (const board of boards) {
    items.push({
      id: generateFieldId(),
      description: formatBoardLineDescription(board),
      quantity: String(board.quantity),
      unit: 'pcs',
      notes: board.measurementNotes || '',
    })
  }

  for (const acc of accessories) {
    if (acc.quantity <= 0 && !acc.subtype) continue
    items.push({
      id: generateFieldId(),
      description: formatAccessoryLineDescription(acc),
      quantity: String(acc.quantity || ''),
      unit: normalizeOrderUnit(acc.unit),
      notes: acc.autoCalculated ? 'Auto-calculated' : '',
    })
  }

  return items
}
