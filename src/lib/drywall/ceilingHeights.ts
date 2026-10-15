// Ceiling height (Mark, 2026-10-15): tall rooms cost more to hang and finish — labor, tape and
// mud all grow — from 10' up. One height covers an area's walls and ceiling.
//
// Where heights come from: every drywall quote line carries one. A Togal import fills it — the
// wall label says it ("9' 1/2" walls"), and a ceiling takes its area's wall height; Mark breaks
// tall rooms out as their own Togal area, so an area's walls share one height. Lines typed by
// hand default to the quote's height for most of the job. The Field areas carry heights too, and
// can be started from the quote's areas. See docs/briefs/CEILING_HEIGHTS.md.

import type { DrywallQuoteV3, FieldMeasurementArea, QuoteLineItem } from '@/types/drywall'
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

const positive = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** A stored height, for the field-by-field hydrators: a positive number or nothing. */
export const hydrateHeightFt = positive

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

/** The quote's own height field as stored; the key appears only when set. */
export function hydrateQuoteHeights(q: Record<string, unknown>): Pick<DrywallQuoteV3, 'default_height_ft'> {
  const def = positive(q.default_height_ft)
  return def !== undefined ? { default_height_ft: def } : {}
}

/** A line's height: its own, else the quote's height for most of the job. */
export function lineHeightFt(
  line: Pick<QuoteLineItem, 'height_ft'>,
  quote: Pick<DrywallQuoteV3, 'default_height_ft'>,
): number | undefined {
  return line.height_ft ?? quote.default_height_ft
}

const isCeilingLine = (line: Pick<QuoteLineItem, 'description'>) => /ceiling/i.test(line.description ?? '')

/**
 * The height of each area's walls: the height carrying the most sqft among its wall lines.
 * Mark breaks tall rooms out as their own area, so this is normally the one height they share.
 */
export function wallHeightByArea(lines: QuoteLineItem[]): Map<string, number> {
  const tally = new Map<string, Map<number, number>>()
  for (const line of lines) {
    if (line.type !== 'drywall' || isCeilingLine(line) || !(line.height_ft && line.height_ft > 0)) continue
    const area = line.location ?? ''
    const byHeight = tally.get(area) ?? new Map<number, number>()
    byHeight.set(line.height_ft, (byHeight.get(line.height_ft) ?? 0) + (Number(line.quantity) || 0))
    tally.set(area, byHeight)
  }
  const out = new Map<string, number>()
  for (const [area, byHeight] of tally) {
    const [height] = [...byHeight.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]!
    out.set(area, height)
  }
  return out
}

/** Ceiling lines with no height take their area's wall height ("Ceiling" carries no number). */
export function withCeilingHeights(lines: QuoteLineItem[]): QuoteLineItem[] {
  const byArea = wallHeightByArea(lines)
  return lines.map((line) => {
    if (line.type !== 'drywall' || line.height_ft || !isCeilingLine(line)) return line
    const h = byArea.get(line.location ?? '')
    return h ? { ...line, height_ft: h } : line
  })
}

/** Drywall sqft (as quoted, before waste) in each tall band. */
export function quoteTallSqftByBand(
  quote: Pick<DrywallQuoteV3, 'lineItems' | 'default_height_ft'>,
): Partial<Record<HeightBand, number>> {
  const out: Partial<Record<HeightBand, number>> = {}
  for (const line of quote.lineItems) {
    if (line.type !== 'drywall') continue
    const band = heightBand(lineHeightFt(line, quote))
    const sqft = Number(line.quantity) || 0
    if (!band || sqft <= 0) continue
    out[band] = (out[band] ?? 0) + sqft
  }
  return out
}

/**
 * The quote's areas, in order, with their wall height — to start a Field measurement already
 * laid out the way the job was quoted (2nd Floor 9', Great Room 18').
 */
export function quoteAreasForField(
  quote: Pick<DrywallQuoteV3, 'lineItems' | 'default_height_ft'>,
): { name: string; heightFt?: number }[] {
  const heights = wallHeightByArea(quote.lineItems)
  const seen = new Set<string>()
  const out: { name: string; heightFt?: number }[] = []
  for (const line of quote.lineItems) {
    if (line.type !== 'drywall') continue
    const name = (line.location ?? '').trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    const heightFt = heights.get(name) ?? quote.default_height_ft
    out.push(heightFt ? { name, heightFt } : { name })
  }
  return out
}
