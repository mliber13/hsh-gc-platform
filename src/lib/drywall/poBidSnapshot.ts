import type { BidSnapshot, BidSnapshotPayload } from '@/types/drywall'

export const DEFAULT_PO_SCOPE_TEXT = 'Drywall hang and finish per PO'

function num(v: number): number {
  if (!Number.isFinite(v)) return 0
  return v
}

export function buildPoBidSnapshot(
  customerSqft: number,
  agreedUnitRate: number,
  scopeText: string,
  at: string,
): BidSnapshot {
  const sqft = num(customerSqft)
  const rate = num(agreedUnitRate)
  if (sqft <= 0 || rate <= 0) {
    throw new Error('customerSqft and agreedUnitRate must be greater than 0')
  }

  const total = sqft * rate
  const description = scopeText.trim() || DEFAULT_PO_SCOPE_TEXT

  const payload: BidSnapshotPayload = {
    routineSubtotal: total,
    cleanupTotal: 0,
    overhead: 0,
    profit: 0,
    salesTax: 0,
    bidTotal: total,
    lineItems: [
      {
        id: 'po-line-1',
        type: 'drywall',
        description,
        computed_line_total: total,
      },
    ],
    alternates: [],
  }

  return {
    total,
    at,
    payload,
  }
}
