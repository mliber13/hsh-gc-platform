// Ceiling height (Mark, 2026-10-15): tall rooms cost more to hang and finish — labor, tape and
// mud all grow — from 10' up. One height per area covers its walls and ceiling. Step 1 records
// heights; the material factors and the tall-wall labor line come after (docs/briefs/
// CEILING_HEIGHTS.md).

import type { FieldMeasurementArea } from '@/types/drywall'
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
