// What tall board costs (Mark, 2026-10-16) — steps 2 and 3 of docs/briefs/CEILING_HEIGHTS.md.
// Kept apart from ceilingHeights.ts on purpose: that file is on the crew path
// (crewProjectionAllowlist.test.ts), and these rates are money crew must never be sent.

import type { DrywallQuoteV3, FieldMeasurementArea } from '@/types/drywall'
import { heightBand, quoteTallSqftByBand, type HeightBand } from './ceilingHeights'
import { computeMeasuredSqft } from './fieldMeasurementUtils'
import { hangOnlyMeasuredSqft } from './hangOnly'

/**
 * Mud and tape scale up on tall board (Mark, 2026-10-16: keep these as the starting point).
 * Applied to the compound and tape quantities of a tall line — quote material and Field orders.
 */
export const TALL_WALL_MUD_TAPE_FACTOR: Record<HeightBand, number> = {
  '10-11': 1.1,
  '12-14': 1.2,
  '15+': 1.3,
}

/**
 * Tall-wall labor, $ per sqft of tall board (Mark, 2026-10-16: "higher, since we are only
 * applying to that area's sqft" than the 2/4/8¢ first proposed). Editable per quote.
 */
export const TALL_WALL_LABOR_DEFAULT: Record<HeightBand, number> = {
  '10-11': 0.03,
  '12-14': 0.06,
  '15+': 0.12,
}

export const HEIGHT_BANDS: HeightBand[] = ['10-11', '12-14', '15+']

/** The mud/tape multiplier for a height — 1 below 10' or with no height. */
export function mudTapeFactor(heightFt: number | null | undefined): number {
  const band = heightBand(heightFt)
  return band ? TALL_WALL_MUD_TAPE_FACTOR[band] : 1
}

/** This quote's tall-wall labor rates: its own where set, the defaults elsewhere. */
export function tallWallLaborRates(
  quote: Pick<DrywallQuoteV3, 'tall_wall_labor_rates'>,
): Record<HeightBand, number> {
  const own = quote.tall_wall_labor_rates ?? {}
  return {
    '10-11': own['10-11'] ?? TALL_WALL_LABOR_DEFAULT['10-11'],
    '12-14': own['12-14'] ?? TALL_WALL_LABOR_DEFAULT['12-14'],
    '15+': own['15+'] ?? TALL_WALL_LABOR_DEFAULT['15+'],
  }
}

/** Tall-wall labor before burden: tall sqft in each band × its rate. 0 on a quote with none. */
export function tallWallLaborWages(
  quote: Pick<DrywallQuoteV3, 'lineItems' | 'default_height_ft' | 'tall_wall_labor_rates'>,
): number {
  const sqft = quoteTallSqftByBand(quote)
  const rates = tallWallLaborRates(quote)
  return HEIGHT_BANDS.reduce((sum, band) => sum + (sqft[band] ?? 0) * rates[band], 0)
}

/** Stored per-quote rates, for the hydrator: only bands with a usable number. */
export function hydrateTallWallLaborRates(raw: unknown): DrywallQuoteV3['tall_wall_labor_rates'] | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const out: Partial<Record<HeightBand, number>> = {}
  for (const band of HEIGHT_BANDS) {
    const v = (raw as Record<string, unknown>)[band]
    const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
    if (Number.isFinite(n) && n >= 0) out[band] = n
  }
  return Object.keys(out).length ? out : undefined
}

/**
 * How much extra finished board the Field order should size mud and tape for: each tall area's
 * finished sqft × (its factor − 1). The same factors the quote prices, so orders follow quotes.
 */
export function tallFieldMudTapeExtraSqft(areas: FieldMeasurementArea[]): number {
  return areas.reduce((sum, area) => {
    const factor = mudTapeFactor(area.heightFt)
    if (factor === 1) return sum
    const finished = Math.max(0, computeMeasuredSqft([area]) - hangOnlyMeasuredSqft([area]))
    return sum + finished * (factor - 1)
  }, 0)
}
