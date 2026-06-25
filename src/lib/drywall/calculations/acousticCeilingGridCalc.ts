/**
 * Acoustic ceiling tile & grid component counts from project sqft, perimeter, waste %, and tile size.
 * Matches legacy hsh-drywall-app QuoteStage acoustic auto-calc.
 */

import { applyWaste } from './quantityUtils'

export interface AcousticCeilingGridCountInputs {
  baseSqft: number
  perimeter?: number
  wastePct?: number
  tileSize?: string
}

export interface AcousticCeilingGridCounts {
  wallAngleCount: number
  mainsCount: number
  tees4ftCount: number
  tees2ftCount: number
  /** One decimal place, as stored on the quote (e.g. "200.0"). */
  wireLinearFt: string
  lagsCount: number
}

export function calcAcousticCeilingGridCounts(
  inputs: AcousticCeilingGridCountInputs,
): AcousticCeilingGridCounts | null {
  const baseSqft = Number(inputs.baseSqft) || 0
  if (baseSqft <= 0) return null

  const wastePct = Number(inputs.wastePct) || 0
  const perimeter = Number(inputs.perimeter) || 0
  const tileSize = inputs.tileSize || '2x4'

  const sqftWithWaste = applyWaste(baseSqft, wastePct)
  const basePerim = perimeter > 0 ? perimeter : 4 * Math.sqrt(baseSqft)
  const perimWithWaste = applyWaste(basePerim, wastePct)

  const mainsLf = tileSize === '2x2' ? sqftWithWaste / 2 : sqftWithWaste / 4

  return {
    wallAngleCount: Math.ceil(perimWithWaste / 10),
    mainsCount: Math.ceil(mainsLf / 12),
    tees4ftCount: Math.ceil(sqftWithWaste / 8),
    tees2ftCount: tileSize === '2x4' ? 0 : Math.ceil(sqftWithWaste / 4),
    wireLinearFt: (sqftWithWaste / 5).toFixed(1),
    lagsCount: Math.ceil(perimWithWaste / 5),
  }
}
