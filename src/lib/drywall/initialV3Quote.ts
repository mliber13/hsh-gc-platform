/**
 * The v3 quote a job gets the first time its quote is opened.
 *
 * New jobs are created with an empty quote (`{}`, createDrywallProject). Reading it used to
 * hydrate a blank v2 and convert that — keeping the blank v2 as legacyV2Snapshot, so every job
 * since June claimed "Converted from v2" (71 of 91 on 2026-10-14; read side fixed in e5d06d3).
 * A quote that was never started is now built as v3 directly: no v2, no snapshot. A quote with
 * anything stored still converts as before, keeping its snapshot.
 */
import { buildV3FromV2 } from './convertQuoteV2ToV3'
import { createEmptyDrywallQuoteV3 } from './createEmptyDrywallQuoteV3'
import type { DrywallQuote, DrywallQuoteV3 } from '@/types/drywall'

/** Nothing stored yet — absent, or the `{}` a new job is created with. */
export function isUnstartedQuote(raw: unknown): boolean {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return true
  return Object.keys(raw).length === 0
}

export function initialV3Quote(raw: unknown, hydratedV2: DrywallQuote): DrywallQuoteV3 {
  return isUnstartedQuote(raw) ? createEmptyDrywallQuoteV3() : buildV3FromV2(hydratedV2)
}
