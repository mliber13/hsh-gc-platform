import { generateFieldId } from '@/lib/drywall/fieldMeasurementUtils'
import {
  extractMaterialsFromFieldTakeoff,
  formatAccessoryLineDescription,
  formatBoardLineDescription,
} from '@/lib/drywall/fieldMaterialsPdfData'
import { normalizeOrderUnit } from '@/lib/drywall/orderConstants'
import type { DrywallOrder, DrywallOrderItem, FieldTakeoff } from '@/types/drywall'

/**
 * Order statuses that count as material already committed to this job.
 *
 * `draft` is deliberately absent: a draft is not a commitment, and two drafts open at
 * once must not hide material from each other.
 */
const COMMITTED_ORDER_STATUSES = new Set(['sent', 'confirmed', 'partial', 'complete'])

/** Description + unit, so a box of screws can never cancel out pieces of board. */
function coverageKey(description: string, unit: string): string {
  return `${description.trim().toLowerCase()}|${normalizeOrderUnit(unit).trim().toLowerCase()}`
}

/** Quantities already committed on earlier orders, keyed by description + unit. */
function committedQuantities(orders: DrywallOrder[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const order of orders) {
    if (!COMMITTED_ORDER_STATUSES.has(String(order?.status ?? ''))) continue
    for (const item of order.items ?? []) {
      const qty = parseFloat(String(item.quantity))
      if (!Number.isFinite(qty) || qty <= 0) continue
      const key = coverageKey(String(item.description ?? ''), String(item.unit ?? ''))
      out.set(key, (out.get(key) ?? 0) + qty)
    }
  }
  return out
}

export interface OrderSuggestion {
  items: DrywallOrderItem[]
  /** Lines already covered in full by committed orders, and therefore omitted. */
  suppressed: number
  /** Lines partly covered, emitted at the remaining quantity. */
  reduced: number
}

/**
 * Build draft order line items from the field takeoff, minus what earlier orders already
 * committed (editor rows — no qty in description, no area in notes).
 *
 * A job delivered in stages used to get the whole takeoff suggested on every order, so the
 * second load arrived pre-filled with the first one's material and the operator had to
 * remember to delete it. See docs/DRYWALL_PROJECT_IA.md §12.
 *
 * Matching is on the generated description, which both sides produce from the same
 * formatters. When an operator has hand-edited a description the match fails and the line
 * is suggested in full — the safe direction, because over-suggesting costs a delete while
 * under-suggesting is a shortfall found on site.
 */
export function suggestOrderItemsFromFieldTakeoff(
  takeoff: FieldTakeoff,
  committedOrders: DrywallOrder[] = [],
): OrderSuggestion {
  const { boards, accessories } = extractMaterialsFromFieldTakeoff(takeoff)
  const committed = committedQuantities(committedOrders)
  const items: DrywallOrderItem[] = []
  let suppressed = 0
  let reduced = 0

  /** Remaining quantity after earlier orders, or null when the line is fully covered. */
  const remaining = (description: string, unit: string, wanted: number): number | null => {
    if (!(wanted > 0)) return wanted
    const key = coverageKey(description, unit)
    const already = committed.get(key) ?? 0
    if (already <= 0) return wanted
    const left = wanted - already
    // Consume what was matched so a repeated description cannot be credited twice.
    committed.set(key, Math.max(0, already - wanted))
    if (left <= 0) {
      suppressed += 1
      return null
    }
    reduced += 1
    return left
  }

  for (const board of boards) {
    const description = formatBoardLineDescription(board)
    const qty = remaining(description, 'pcs', board.quantity)
    if (qty === null) continue
    items.push({
      id: generateFieldId(),
      description,
      quantity: String(qty),
      unit: 'pcs',
      notes: board.measurementNotes || '',
      area: board.area || undefined,
    })
  }

  for (const acc of accessories) {
    if (acc.quantity <= 0 && !acc.subtype) continue
    const description = formatAccessoryLineDescription(acc)
    const unit = normalizeOrderUnit(acc.unit)
    // An accessory with a subtype but no count carries an empty quantity; it is a line to
    // fill in, not a quantity to subtract, so it is never suppressed.
    const qty = remaining(description, unit, acc.quantity || 0)
    if (qty === null) continue
    items.push({
      id: generateFieldId(),
      description,
      quantity: String(qty || ''),
      unit,
      notes: acc.autoCalculated ? 'Auto-calculated' : '',
      // Accessories are project-level (no field area) → grouped under "Accessories".
    })
  }

  return { items, suppressed, reduced }
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
