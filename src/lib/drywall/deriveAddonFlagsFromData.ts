import type { DrywallQuote } from '@/types/drywall'

function n(v: unknown): number {
  return parseFloat(String(v)) || 0
}

/** Turn on include* toggles when stored quantities exist (legacy rows may omit flags). */
export function deriveAddonFlagsFromData(quote: DrywallQuote): DrywallQuote {
  const breakdowns = quote.breakdowns || []
  const hasBreakdownRc = breakdowns.some(
    (b) =>
      n(b.rcChannelCeilingSqft) > 0 ||
      n(b.rcChannelWallLinearFt) > 0 ||
      (Array.isArray(b.rcChannelWallEntries) && b.rcChannelWallEntries.length > 0),
  )
  const hasProjectRc =
    n(quote.rcChannelCeilingSqft) > 0 ||
    (Array.isArray(quote.rcChannelWallEntries) && quote.rcChannelWallEntries.length > 0)

  const hasBreakdownGrid = breakdowns.some(
    (b) => n(b.suspendedGridSqft) > 0 || n(b.suspendedGridPerimeter) > 0,
  )
  const hasProjectGrid = n(quote.suspendedGridSqft) > 0 || n(quote.suspendedGridPerimeter) > 0

  const hasInsulation =
    (Array.isArray(quote.insulationEntries) && quote.insulationEntries.length > 0)

  const hasMetalStud =
    (Array.isArray(quote.metalStudEntries) && quote.metalStudEntries.length > 0) ||
    breakdowns.some(
      (b) =>
        n(b.metalStudWallLf) > 0 ||
        (Array.isArray(b.metalStudEntries) && b.metalStudEntries.length > 0),
    )

  const hasAcoustic = n(quote.acousticCeilingSqft) > 0 || n(quote.acousticCeilingPerimeter) > 0

  const hasFrp =
    n(quote.frpSqft) > 0 ||
    n(quote.frpWallCount) > 0 ||
    n(quote.frpInsideCorners) > 0

  return {
    ...quote,
    includeRcChannel: Boolean(quote.includeRcChannel) || hasBreakdownRc || hasProjectRc,
    includeSuspendedGrid:
      Boolean(quote.includeSuspendedGrid) || hasBreakdownGrid || hasProjectGrid,
    includeInsulation: Boolean(quote.includeInsulation) || hasInsulation,
    includeMetalStudFraming: Boolean(quote.includeMetalStudFraming) || hasMetalStud,
    includeAcousticCeiling: Boolean(quote.includeAcousticCeiling) || hasAcoustic,
    includeFRP: Boolean(quote.includeFRP) || hasFrp,
  }
}
