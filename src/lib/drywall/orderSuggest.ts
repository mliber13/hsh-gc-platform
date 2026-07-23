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
      area: board.area || undefined,
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
      // Accessories are project-level (no field area) → grouped under "Accessories".
    })
  }

  return items
}

export interface OrderItemAreaGroup {
  area: string
  items: DrywallOrderItem[]
}

/** Group order items by their field area for display/PDF. Area-less items (accessories,
 *  manual adds) fall into a trailing "Accessories & general" group. */
export function groupOrderItemsByArea(items: DrywallOrderItem[]): OrderItemAreaGroup[] {
  const GENERAL = 'Accessories & general'
  const groups: OrderItemAreaGroup[] = []
  const byKey = new Map<string, OrderItemAreaGroup>()
  for (const item of items) {
    const area = (item.area || '').trim() || GENERAL
    let group = byKey.get(area)
    if (!group) {
      group = { area, items: [] }
      byKey.set(area, group)
      groups.push(group)
    }
    group.items.push(item)
  }
  // Keep the general bucket last.
  return groups.sort((a, b) => {
    if (a.area === GENERAL) return 1
    if (b.area === GENERAL) return -1
    return 0
  })
}
