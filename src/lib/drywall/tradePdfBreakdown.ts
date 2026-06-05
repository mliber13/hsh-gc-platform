// Per-trade sell-side material / labor lines for quote PDF pricing table.
// Material lines include sales tax plus proportional overhead & profit (trades sum to TOTAL).

import type { DrywallQuote, DrywallQuoteCalculations } from '@/types/drywall'

export type TradePdfSubLine = { label: string; amount: number }

const round2 = (n: number) => Math.round(n * 100) / 100

const toNum = (v: unknown): number => parseFloat(String(v ?? 0)) || 0

/**
 * Split trade sell price by direct-cost ratio — material share includes sales tax,
 * overhead, and profit so Labor + Material = tradeTotal.
 */
function blendMatLabSellSide(
  materialDirect: number,
  laborDirect: number,
  directCost: number,
  tradeTotal: number,
): { material: number; labor: number } {
  if (tradeTotal <= 0) return { material: 0, labor: 0 }
  const direct = directCost > 0 ? directCost : materialDirect + laborDirect
  if (direct <= 0) {
    if (materialDirect > 0 && laborDirect <= 0) return { material: round2(tradeTotal), labor: 0 }
    if (laborDirect > 0 && materialDirect <= 0) return { material: 0, labor: round2(tradeTotal) }
    return { material: 0, labor: 0 }
  }
  const material = round2((materialDirect / direct) * tradeTotal)
  const labor = round2(tradeTotal - material)
  return { material, labor }
}

function fixSubLineTotals(lines: TradePdfSubLine[], targetTotal: number): TradePdfSubLine[] {
  if (lines.length === 0) return lines
  const filtered = lines.filter((l) => l.amount > 0)
  if (filtered.length === 0) return filtered
  const sum = round2(filtered.reduce((s, l) => s + l.amount, 0))
  const drift = round2(targetTotal - sum)
  if (drift !== 0) {
    filtered[filtered.length - 1].amount = round2(filtered[filtered.length - 1].amount + drift)
  }
  return filtered.filter((l) => l.amount > 0)
}

function scaleSubLinesToTotal(lines: TradePdfSubLine[], targetTotal: number): TradePdfSubLine[] {
  if (lines.length === 0 || targetTotal <= 0) return lines
  const sum = lines.reduce((s, l) => s + l.amount, 0)
  if (sum <= 0) return lines
  if (Math.abs(sum - targetTotal) < 0.02) return fixSubLineTotals(lines, targetTotal)
  const factor = targetTotal / sum
  const scaled = lines.map((l) => ({ ...l, amount: round2(l.amount * factor) }))
  return fixSubLineTotals(scaled, targetTotal)
}

/** Drywall: Hang, Finish, Material — full sell-side totals per line. */
export function getDrywallTradeSubLines(
  quote: DrywallQuote,
  calculations: DrywallQuoteCalculations,
  tradeTotal: number,
): TradePdfSubLine[] {
  const scope = String(quote.drywallScope || 'hang_and_finish')
  const direct = toNum(calculations.standardDrywallDirectCost)
  const total = tradeTotal > 0 ? tradeTotal : toNum(calculations.standardDrywallTotal)
  if (direct <= 0 || total <= 0) return []

  const matDirect = toNum(calculations.standardDrywallMaterialCost)
  const hangLaborDirect =
    scope !== 'finish_only' ? toNum(calculations.hangerCostWithTax) : 0
  const finishPrepDirect =
    scope !== 'hang_only'
      ? toNum(calculations.finisherCostWithTax) + toNum(calculations.prepCleanCostWithTax)
      : 0
  const laborDirect = hangLaborDirect + finishPrepDirect

  const { material: materialsBlended, labor: laborBlended } = blendMatLabSellSide(
    matDirect,
    laborDirect,
    direct,
    total,
  )

  const lines: TradePdfSubLine[] = []

  if (laborDirect > 0) {
    if (hangLaborDirect > 0) {
      lines.push({
        label: 'Hang:',
        amount: round2(laborBlended * (hangLaborDirect / laborDirect)),
      })
    }
    if (finishPrepDirect > 0) {
      lines.push({
        label: 'Finish:',
        amount: round2(laborBlended * (finishPrepDirect / laborDirect)),
      })
    }
  }

  if (matDirect > 0 || materialsBlended > 0) {
    lines.push({ label: 'Material:', amount: round2(materialsBlended) })
  }

  return scaleSubLinesToTotal(lines, total)
}

function matLabSubLines(
  materialDirect: number,
  laborDirect: number,
  directCost: number,
  tradeTotal: number,
): TradePdfSubLine[] {
  const { material, labor } = blendMatLabSellSide(
    materialDirect,
    laborDirect,
    directCost,
    tradeTotal,
  )
  const lines: TradePdfSubLine[] = []
  if (labor > 0) lines.push({ label: 'Labor:', amount: labor })
  if (material > 0) lines.push({ label: 'Material:', amount: material })
  return fixSubLineTotals(lines, tradeTotal)
}

/** Map trade summary label → sub-lines (material / labor sell-side). */
export function getTradeCostSubLines(
  tradeLabel: string,
  tradeAmount: number,
  quote: DrywallQuote,
  calculations: DrywallQuoteCalculations,
): TradePdfSubLine[] {
  if (tradeAmount <= 0) return []

  switch (tradeLabel) {
    case 'Drywall:':
      return getDrywallTradeSubLines(quote, calculations, tradeAmount)

    case 'Suspended Drywall Grid Ceiling:':
      return matLabSubLines(
        toNum(calculations.suspendedGridTotalMaterialCost),
        toNum(calculations.suspendedGridLaborCost),
        toNum(calculations.suspendedGridTotalDirectCost),
        tradeAmount,
      )

    case 'RC Channel:':
      return matLabSubLines(
        toNum(calculations.rcChannelTotalMaterialCost),
        toNum(calculations.rcChannelLaborCost),
        toNum(calculations.rcChannelTotalDirectCost),
        tradeAmount,
      )

    case 'Insulation:':
      return matLabSubLines(
        toNum(calculations.insulationTotalMaterialCost),
        toNum(calculations.insulationLaborCost),
        toNum(calculations.insulationTotalDirectCost),
        tradeAmount,
      )

    case 'Acoustic Ceiling Tile & Grid:':
      return matLabSubLines(
        toNum(calculations.acousticCeilingTotalMaterialCost),
        toNum(calculations.acousticCeilingLaborCost),
        toNum(calculations.acousticCeilingTotalDirectCost),
        tradeAmount,
      )

    case 'Metal Stud Framing:':
      return matLabSubLines(
        toNum(calculations.metalStudMaterialCost) + toNum(calculations.metalStudSalesTax),
        toNum(calculations.metalStudLaborCost),
        toNum(calculations.metalStudTotalDirectCost),
        tradeAmount,
      )

    case 'FRP:':
      return matLabSubLines(
        toNum(calculations.frpMaterialCost) + toNum(calculations.frpSalesTax),
        0,
        toNum(calculations.frpTotalDirectCost),
        tradeAmount,
      )

    default:
      return []
  }
}
