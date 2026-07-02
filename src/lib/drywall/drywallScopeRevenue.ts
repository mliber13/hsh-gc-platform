import type { BidSnapshot } from '@/types/drywall'

/** Drywall-only sell revenue (incl. OH&P) from a bid snapshot, or null if not derivable. */
export function deriveDrywallScopeRevenue(snapshot: BidSnapshot | null): number | null {
  if (!snapshot?.payload) return null
  const { lineItems, routineSubtotal, bidTotal } = snapshot.payload
  if (!Array.isArray(lineItems) || !(routineSubtotal > 0) || !(bidTotal > 0)) return null
  const drywallDirect = lineItems
    .filter((li) => li.type === 'drywall')
    .reduce((sum, li) => sum + (Number(li.computed_line_total) || 0), 0)
  if (!(drywallDirect > 0)) return null
  const share = Math.min(1, drywallDirect / routineSubtotal)
  return bidTotal * share
}
