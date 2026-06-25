// ============================================================================
// D.4 — Margin floor evaluation (pure)
// ============================================================================

export const DEFAULT_MARGIN_FLOOR_TARGET = 0.3
export const DEFAULT_PO_ESTIMATED_COST_PER_SQFT = 2.5

export interface MarginFloorEvaluation {
  bidTotal: number
  estimatedCost: number
  marginPct: number | null
  floorTarget: number
  belowFloor: boolean
}

export type MarginFloorIndicator = 'green' | 'yellow' | 'red' | 'neutral'

function num(v: number): number {
  return Number.isFinite(v) ? v : 0
}

export function evaluateMarginVsFloor(
  bidTotal: number,
  estimatedCost: number,
  floorTarget: number,
): MarginFloorEvaluation {
  const bid = num(bidTotal)
  const cost = num(estimatedCost)
  const floor = num(floorTarget)

  if (bid <= 0) {
    return {
      bidTotal: bid,
      estimatedCost: cost,
      marginPct: null,
      floorTarget: floor,
      belowFloor: false,
    }
  }

  const marginPct = (bid - cost) / bid
  return {
    bidTotal: bid,
    estimatedCost: cost,
    marginPct,
    floorTarget: floor,
    belowFloor: marginPct < floor,
  }
}

export function computeQuoteEstimatedCost(routineSubtotal: number, cleanupTotal: number): number {
  return num(routineSubtotal) + num(cleanupTotal)
}

export function computePoEstimatedCost(fieldMeasuredSqft: number, costPerSqft: number): number {
  return num(fieldMeasuredSqft) * num(costPerSqft)
}

export function marginFloorIndicator(
  evaluation: MarginFloorEvaluation,
): MarginFloorIndicator {
  if (evaluation.marginPct == null) return 'neutral'
  if (evaluation.belowFloor) return 'red'
  if (evaluation.marginPct < evaluation.floorTarget + 0.05) return 'yellow'
  return 'green'
}

export function formatMarginFloorPct(marginPct: number | null): string {
  if (marginPct == null || !Number.isFinite(marginPct)) return '—'
  return `${(marginPct * 100).toFixed(1)}%`
}
