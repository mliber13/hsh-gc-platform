// Change-order line-item math. Shared by the editor UI and the PDF so they never drift.
// Markup mirrors the quote engine (buildDrywallQuoteCalculations): overhead on the subtotal,
// profit on (subtotal + overhead).

import type {
  DrywallChangeOrder,
  DrywallChangeOrderLineItem,
  DrywallChangeOrderOption,
} from '@/types/drywall'

function num(value: unknown): number {
  const parsed = Number(String(value ?? '').trim())
  return Number.isFinite(parsed) ? parsed : 0
}

/** Blended per-unit rate: material + labor, falling back to the legacy single `rate`. */
export function changeOrderLineRate(line: DrywallChangeOrderLineItem): number {
  const material = num(line.materialRate)
  const labor = num(line.laborRate)
  if (material !== 0 || labor !== 0) return material + labor
  return num(line.rate)
}

/** quantity × (material + labor) rate for one line (0 when blank/invalid). */
export function changeOrderLineTotal(line: DrywallChangeOrderLineItem): number {
  return num(line.quantity) * changeOrderLineRate(line)
}

export interface ChangeOrderLocationGroup {
  location: string
  lines: DrywallChangeOrderLineItem[]
  subtotal: number
}

export interface ChangeOrderTotals {
  hasLineItems: boolean
  groups: ChangeOrderLocationGroup[]
  /** Sum of quantity × materialRate across all lines. */
  materialSubtotal: number
  /** Sum of quantity × laborRate across all lines. */
  laborSubtotal: number
  subtotal: number
  overheadPct: number
  profitPct: number
  overhead: number
  profit: number
  /** subtotal + overhead + profit (the CO's requested amount when line items exist). */
  total: number
}

/** Group lines by location (insertion order preserved) with per-location subtotals. */
export function groupChangeOrderLines(
  lines: DrywallChangeOrderLineItem[],
): ChangeOrderLocationGroup[] {
  const groups: ChangeOrderLocationGroup[] = []
  const byKey = new Map<string, ChangeOrderLocationGroup>()
  for (const line of lines) {
    const location = (line.location || '').trim() || 'General'
    let group = byKey.get(location)
    if (!group) {
      group = { location, lines: [], subtotal: 0 }
      byKey.set(location, group)
      groups.push(group)
    }
    group.lines.push(line)
    group.subtotal += changeOrderLineTotal(line)
  }
  return groups
}

/** A priced scope: either a whole change order or one of its options. */
export type ChangeOrderScope = {
  lineItems?: DrywallChangeOrderLineItem[]
  overheadPct?: number
  profitPct?: number
}

/** Full computed totals for a scope (subtotal → overhead → profit → total). */
export function computeChangeOrderTotals(co: ChangeOrderScope): ChangeOrderTotals {
  const lines = Array.isArray(co.lineItems) ? co.lineItems : []
  const groups = groupChangeOrderLines(lines)
  const subtotal = groups.reduce((sum, g) => sum + g.subtotal, 0)
  const materialSubtotal = lines.reduce((sum, li) => sum + num(li.quantity) * num(li.materialRate), 0)
  const laborSubtotal = lines.reduce((sum, li) => sum + num(li.quantity) * num(li.laborRate), 0)
  const overheadPct = num(co.overheadPct)
  const profitPct = num(co.profitPct)
  const overhead = subtotal * (overheadPct / 100)
  const profit = (subtotal + overhead) * (profitPct / 100)
  return {
    hasLineItems: lines.length > 0,
    groups,
    materialSubtotal,
    laborSubtotal,
    subtotal,
    overheadPct,
    profitPct,
    overhead,
    profit,
    total: subtotal + overhead + profit,
  }
}

/** Computed total for one option (subtotal + its own overhead + profit). */
export function changeOrderOptionTotal(option: DrywallChangeOrderOption): number {
  return computeChangeOrderTotals(option).total
}

/** True when the CO presents mutually-exclusive options. */
export function changeOrderHasOptions(co: DrywallChangeOrder): boolean {
  return Array.isArray(co.options) && co.options.length > 0
}

/**
 * The dollar amount a change order requests:
 *  - options CO → the selected option's total, else the largest option total (max exposure);
 *  - line-item CO → the computed total;
 *  - otherwise → the manually-entered lump sum.
 */
export function resolveChangeOrderRequestedAmount(co: DrywallChangeOrder): number {
  if (changeOrderHasOptions(co)) {
    const options = co.options ?? []
    const selected = options.find((o) => o.id === co.selectedOptionId)
    if (selected) return changeOrderOptionTotal(selected)
    return options.reduce((max, o) => Math.max(max, changeOrderOptionTotal(o)), 0)
  }
  const totals = computeChangeOrderTotals(co)
  if (totals.hasLineItems) return totals.total
  return num(co.requestedAmount)
}
