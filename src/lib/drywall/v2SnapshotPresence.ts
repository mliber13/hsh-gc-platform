/**
 * Whether a v3 quote's legacyV2Snapshot is a real v2 quote, or the blank one new jobs used to get.
 *
 * Until initialV3Quote.ts, opening a new job's quote converted a blank v2 and kept it as the
 * snapshot, so "has a snapshot" never meant "was a v2 quote": on 2026-10-14, 71 of 91 v3 quotes
 * carried an empty one and all showed "Converted from v2" (Mark, on Lakewood - Sweeney: "that job
 * never was in v2"), plus an owner-only "Revert to v2" that would swap the quote for a blank one.
 *
 * "Real" is hasRealDrywallV2QuoteData — the same rule that decides whether a v2 quote opens in the
 * v2 editor, so the two questions cannot get different answers. The snapshots stay in place.
 */
import { hasRealDrywallV2QuoteData } from './createEmptyDrywallQuote'
import type { DrywallQuote } from '@/types/drywall'

export function hasRealV2Snapshot(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false
  return hasRealDrywallV2QuoteData(snapshot as DrywallQuote)
}
