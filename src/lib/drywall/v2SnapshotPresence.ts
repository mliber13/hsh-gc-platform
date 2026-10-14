/**
 * Whether a v3 quote's legacyV2Snapshot is a real v2 quote, or the blank one every new job gets.
 *
 * New jobs are still created with an empty v2 quote, and opening the quote page converts it to v3,
 * keeping that empty quote as the snapshot. So "has a snapshot" never meant "was a v2 quote": on
 * 2026-10-14, 71 of 91 v3 quotes carried an empty one — every job since June — and all of them
 * showed "Converted from v2" (Mark, on Lakewood - Sweeney: "that job never was in v2"), plus an
 * owner-only "Revert to v2" that would swap the quote for a blank one.
 *
 * Real = any sqft, any breakdown with sqft, or any total. The snapshot itself is left in place:
 * the v3 hydrate backfills structured-scope defaults from it.
 */
function positive(v: unknown): boolean {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) && n > 0
}

export function hasRealV2Snapshot(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false
  const s = snapshot as Record<string, unknown>
  if (positive(s.sqft) || positive(s.totalQuoteAmount)) return true
  const calc = s.calculations as Record<string, unknown> | undefined
  if (calc && (positive(calc.finalTotal) || positive(calc.totalQuote))) return true
  const breakdowns = Array.isArray(s.breakdowns) ? (s.breakdowns as Record<string, unknown>[]) : []
  return breakdowns.some((b) => positive(b?.sqft))
}
