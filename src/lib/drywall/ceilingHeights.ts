// Ceiling height (Mark, 2026-10-15): tall rooms cost more to hang and finish — labor, tape and
// mud all grow — from 10' up. One height per area covers its walls and ceiling. Step 1 records
// heights; the material factors and the tall-wall labor line come after (docs/briefs/
// CEILING_HEIGHTS.md).

import type { DrywallQuoteV3, FieldMeasurementArea, QuoteTallArea } from '@/types/drywall'
import { computeMeasuredSqft } from './fieldMeasurementUtils'

/** Below this an area prices and orders as it always has. */
export const TALL_WALL_THRESHOLD_FT = 10

export type HeightBand = '10-11' | '12-14' | '15+'

/** The band a height falls in, or null for a standard height (or none entered). */
export function heightBand(heightFt: number | null | undefined): HeightBand | null {
  if (heightFt == null || !Number.isFinite(heightFt) || heightFt < TALL_WALL_THRESHOLD_FT) return null
  if (heightFt < 12) return '10-11'
  if (heightFt < 15) return '12-14'
  return '15+'
}

export const HEIGHT_BAND_LABEL: Record<HeightBand, string> = {
  '10-11': "10–11'",
  '12-14': "12–14'",
  '15+': "15' and up",
}

/** A typed height: a positive number of feet, or undefined to clear it. */
export function parseHeightFt(raw: string): number | undefined {
  const n = parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** Measured sqft in each tall band; standard-height and height-less areas are left out. */
export function tallSqftByBand(areas: FieldMeasurementArea[]): Partial<Record<HeightBand, number>> {
  const out: Partial<Record<HeightBand, number>> = {}
  for (const area of areas) {
    const band = heightBand(area.heightFt)
    if (!band) continue
    out[band] = (out[band] ?? 0) + computeMeasuredSqft([area])
  }
  return out
}

// ---------------------------------------------------------------------------- the quote

const positive = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * The quote's height fields as stored, for hydrateDrywallQuoteV3. Keys appear only when set, so
 * a quote saved before heights existed loads exactly as it did.
 */
export function hydrateQuoteHeights(
  q: Record<string, unknown>,
): Pick<DrywallQuoteV3, 'default_height_ft' | 'tall_areas'> {
  const out: Pick<DrywallQuoteV3, 'default_height_ft' | 'tall_areas'> = {}
  const def = positive(q.default_height_ft)
  if (def !== undefined) out.default_height_ft = def
  if (Array.isArray(q.tall_areas)) {
    out.tall_areas = q.tall_areas
      .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === 'object')
      .map((r) => ({
        id: typeof r.id === 'string' && r.id ? r.id : newTallAreaId(),
        name: typeof r.name === 'string' ? r.name : '',
        height_ft: positive(r.height_ft) ?? 0,
        sqft: positive(r.sqft) ?? 0,
      }))
  }
  return out
}

export function newTallAreaId(): string {
  return `ta-${Math.random().toString(36).slice(2, 10)}`
}

/** The tall areas a measured job implies: each field area 10' and up, with its measured sqft. */
export function tallAreasFromField(areas: FieldMeasurementArea[]): QuoteTallArea[] {
  return areas
    .filter((a) => heightBand(a.heightFt) !== null)
    .map((a) => ({
      id: newTallAreaId(),
      name: a.area?.trim() || 'Measured area',
      height_ft: a.heightFt!,
      sqft: Math.round(computeMeasuredSqft([a])),
    }))
}

/** Tall sqft on a quote, per band — what the material factors and labor adder will price. */
export function quoteTallSqftByBand(quote: Pick<DrywallQuoteV3, 'tall_areas'>): Partial<Record<HeightBand, number>> {
  const out: Partial<Record<HeightBand, number>> = {}
  for (const row of quote.tall_areas ?? []) {
    const band = heightBand(row.height_ft)
    if (!band || !(row.sqft > 0)) continue
    out[band] = (out[band] ?? 0) + row.sqft
  }
  return out
}
