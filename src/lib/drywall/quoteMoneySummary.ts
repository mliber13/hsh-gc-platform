/**
 * The quote's money in the shape Mark reads it (2026-10-14):
 *
 *   - the three numbers he needs wherever he is editing — total, cost, margin vs floor — in one
 *     place, so the pinned bar and the line-edit dialog cannot disagree;
 *   - labour as WAGES, with the burden on its own line, not folded into each trade
 *     ("Finish labor for one, I'd prefer to see without the burden and then the burden on its own").
 *
 * The pricing engine (quoteV3Math) is unchanged. Burden is a flat LABOR_TAX_RATE applied per
 * trade when that trade's toggle is on (applyLaborBurden), so wages and burden split back out
 * exactly from the burdened figure — nothing is re-priced here.
 */
import { LABOR_TAX_RATE, includeLaborBurden } from './calculations/quantityUtils'
import { computeQuoteEstimatedCost, evaluateMarginVsFloor, marginFloorIndicator } from './marginFloor'
import type { QuoteV3TotalsSummary } from './quoteV3Math'
import type { DrywallQuoteV3, QuoteLineItemType } from '@/types/drywall'

export function splitLaborBurden(burdened: number, include: unknown): { wages: number; burden: number } {
  const amount = Number(burdened) || 0
  if (!includeLaborBurden(include)) return { wages: amount, burden: 0 }
  const wages = amount / (1 + LABOR_TAX_RATE)
  return { wages, burden: amount - wages }
}

export interface QuoteMoneySummary {
  /** Routine grand total — what the base quote prices at. */
  total: number
  /** Total once accepted alternates are applied; null when none is accepted. */
  contractTotal: number | null
  /** Lines + cleanup + sales tax — the cost the margin is measured against. */
  cost: number
  marginPct: number | null
  indicator: ReturnType<typeof marginFloorIndicator>
  floorPct: number
  /**
   * Scope sold: drywall sqft and sqft with waste — the accepted scope when an alternate is
   * accepted, as the quote header computed it (moved into the bar, Mark 2026-10-14).
   */
  sqft: number
  sqftWithWaste: number
  /** Price per sqft with waste, against the scope sold; null with no sqft. */
  pricePerSqft: number | null
}

export function quoteMoneySummary(totals: QuoteV3TotalsSummary, marginFloorTarget: number): QuoteMoneySummary {
  const { routine } = totals
  // The one definition of quote cost — the same one the send-time margin gate uses.
  const cost = computeQuoteEstimatedCost(routine.linesSubtotal, routine.cleanupTotal, routine.salesTaxAmount)
  // Measured on acceptedTotal, as the send/approve gate (QuoteOutcomeBar) measures it: a
  // selected deduct lowers the bid the customer gets. Equal to routine.total with none selected.
  const evaluation = evaluateMarginVsFloor(totals.acceptedTotal, cost, marginFloorTarget)
  const anyAccepted = totals.alternates.some((a) => a.selected)
  // Per-sqft only means anything against the scope actually sold (QuoteHeaderV3's rule).
  const sqft = anyAccepted ? totals.acceptedSqft : totals.totalSqft
  const sqftWithWaste = anyAccepted ? totals.acceptedSqftWithWaste : totals.totalSqftWithWaste
  const priced = anyAccepted ? totals.acceptedTotal : routine.total
  return {
    sqft,
    sqftWithWaste,
    pricePerSqft: sqftWithWaste > 0 ? priced / sqftWithWaste : null,
    total: routine.total,
    contractTotal: anyAccepted ? totals.acceptedTotal : null,
    cost,
    marginPct: evaluation.marginPct,
    indicator: marginFloorIndicator(evaluation),
    floorPct: marginFloorTarget,
  }
}

export interface TradeCostRow {
  type: QuoteLineItemType
  label: string
  material: number
  /** Wages only — burden is in QuoteCostBreakdown.laborBurden. */
  hangerWages: number
  finisherWages: number
  componentWages: number
  accessories: number
  /** Material + wages + accessories (no burden). */
  subtotal: number
}

export interface QuoteCostBreakdown {
  trades: TradeCostRow[]
  cleanupWages: number
  /** Tall-wall labor wages (tallWallPricing.ts); its burden is in laborBurden. 0 without tall board. */
  tallWallWages: number
  /** Every trade's burden plus cleanup's and tall-wall's, as one line. */
  laborBurden: number
}

const TRADE_ORDER: { type: QuoteLineItemType; label: string }[] = [
  { type: 'drywall', label: 'Drywall' },
  { type: 'rc_channel', label: 'RC Channel' },
  { type: 'suspended_grid', label: 'Suspended Grid' },
  { type: 'metal_stud', label: 'Metal Stud' },
  { type: 'insulation', label: 'Insulation' },
  { type: 'acoustic', label: 'Acoustic Ceiling' },
  { type: 'frp', label: 'FRP' },
  { type: 'door_install', label: 'Door Install' },
]

export function quoteCostBreakdown(quote: DrywallQuoteV3, totals: QuoteV3TotalsSummary): QuoteCostBreakdown {
  const { routine } = totals
  let laborBurden = 0
  const trades: TradeCostRow[] = []
  for (const { type, label } of TRADE_ORDER) {
    const t = routine.byTrade?.[type]
    if (!t) continue
    const hanger = splitLaborBurden(t.hangerLabor, quote.hanger_include_labor_burden)
    const finisher = splitLaborBurden(t.finisherLabor, quote.finisher_include_labor_burden)
    const component = splitLaborBurden(t.componentLabor, quote.component_include_labor_burden)
    laborBurden += hanger.burden + finisher.burden + component.burden
    const subtotal = t.material + hanger.wages + finisher.wages + component.wages + t.accessories
    if (subtotal <= 0) continue
    trades.push({
      type,
      label,
      material: t.material,
      hangerWages: hanger.wages,
      finisherWages: finisher.wages,
      componentWages: component.wages,
      accessories: t.accessories,
      subtotal,
    })
  }
  const cleanup = splitLaborBurden(routine.cleanupTotal, quote.prep_clean_include_labor_burden)
  laborBurden += cleanup.burden
  // Burdened with finishing in quoteV3Math, so split back out the same way.
  const tallWall = splitLaborBurden(routine.tallWallLaborSubtotal ?? 0, quote.finisher_include_labor_burden)
  laborBurden += tallWall.burden
  return { trades, cleanupWages: cleanup.wages, tallWallWages: tallWall.wages, laborBurden }
}
