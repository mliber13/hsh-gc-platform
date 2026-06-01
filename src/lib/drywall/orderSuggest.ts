import { generateFieldId } from '@/lib/drywall/fieldMeasurementUtils'
import { normalizeOrderUnit } from '@/lib/drywall/orderConstants'
import type { DrywallOrderItem, FieldTakeoff } from '@/types/drywall'

/** Build draft order line items from field takeoff (parity with OrderStage handleCreateOrder). */
export function suggestOrderItemsFromFieldTakeoff(takeoff: FieldTakeoff): DrywallOrderItem[] {
  const items: DrywallOrderItem[] = []

  for (const measurement of takeoff.measurements ?? []) {
    for (const board of measurement.boards ?? []) {
      const width = parseFloat(String(board.width)) || 0
      const length = parseFloat(String(board.length)) || 0
      const quantity = parseFloat(String(board.quantity)) || 0
      if (quantity <= 0) continue

      items.push({
        id: generateFieldId(),
        description: `${quantity}x ${board.thickness || ''}" ${board.boardType || 'Standard'} (${board.width || ''}" x ${board.length || ''}')`,
        quantity: String(quantity),
        unit: 'pcs',
        notes: measurement.area ? `Area: ${measurement.area}` : '',
      })
    }
  }

  for (const acc of takeoff.accessories ?? []) {
    const qty = parseFloat(String(acc.quantity)) || 0
    if (qty <= 0 && !acc.subtype) continue

    let description = acc.subtype || acc.type || 'Accessory'
    if (acc.length) description += ` (${acc.length})`
    if (acc.threadType) description += ` - ${acc.threadType}`

    items.push({
      id: generateFieldId(),
      description,
      quantity: String(qty || acc.quantity || ''),
      unit: normalizeOrderUnit(acc.unit),
      notes: acc.autoCalculated ? 'Auto-calculated' : '',
    })
  }

  return items
}
