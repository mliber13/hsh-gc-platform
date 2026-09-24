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

export interface MaterialReconcileRow {
  description: string
  unit: string
  area?: string
  /** From the field takeoff — what the job measured out at. */
  needed: number
  /** Committed across sent / confirmed / partial / complete orders. */
  ordered: number
  /** needed − ordered, floored at zero. */
  outstanding: number
}

export interface MaterialReconciliation {
  rows: MaterialReconcileRow[]
  /** Rows still owing material. */
  outstandingCount: number
  /**
   * Lines on committed orders with no matching takeoff line — hand-added material, or a
   * description someone edited. Surfaced rather than hidden: the view would otherwise
   * claim a job is fully covered while quietly ignoring half of what was bought.
   */
  unmatched: MaterialReconcileRow[]
}

/**
 * Measured against ordered, for a job delivered in stages.
 *
 * Shares `coverageKey` and the committed-status set with the suggestion above, so the two
 * can never disagree about what counts as already ordered.
 */
export function reconcileOrderedAgainstTakeoff(
  takeoff: FieldTakeoff,
  orders: DrywallOrder[],
): MaterialReconciliation {
  const { boards, accessories } = extractMaterialsFromFieldTakeoff(takeoff)
  const committed = committedQuantities(orders)

  // Aggregate the need by description + unit before comparing. The same board can appear in
  // several areas, and material is ordered by description, not by area — comparing row by
  // row would credit the first area with the whole order and show the rest as outstanding.
  const needs = new Map<string, MaterialReconcileRow>()
  const want = (description: string, unit: string, needed: number, area?: string) => {
    const key = coverageKey(description, unit)
    const existing = needs.get(key)
    if (existing) {
      existing.needed += needed
      // More than one area contributes — the description is the useful label now.
      if (existing.area && existing.area !== area) existing.area = undefined
      return
    }
    needs.set(key, { description, unit, area, needed, ordered: 0, outstanding: 0 })
  }

  for (const board of boards) {
    want(formatBoardLineDescription(board), 'pcs', board.quantity, board.area || undefined)
  }
  for (const acc of accessories) {
    if (acc.quantity <= 0 && !acc.subtype) continue
    want(formatAccessoryLineDescription(acc), normalizeOrderUnit(acc.unit), acc.quantity || 0)
  }

  const rows: MaterialReconcileRow[] = []
  for (const [key, row] of needs) {
    row.ordered = committed.get(key) ?? 0
    row.outstanding = Math.max(0, row.needed - row.ordered)
    committed.delete(key)
    rows.push(row)
  }

  // Whatever is left in the map was ordered without a takeoff line behind it.
  const unmatched: MaterialReconcileRow[] = []
  for (const [key, ordered] of committed) {
    const [description, unit] = key.split('|')
    unmatched.push({ description, unit, needed: 0, ordered, outstanding: 0 })
  }

  return {
    rows,
    outstandingCount: rows.filter((r) => r.outstanding > 0).length,
    unmatched,
  }
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
