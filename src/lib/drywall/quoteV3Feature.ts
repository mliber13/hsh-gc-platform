/** Feature flag: `drywall_quote_v3` — hardcoded true for MVP (Phase Q.B). */
export const DRYWALL_QUOTE_V3_ENABLED = true

export function isDrywallQuoteV3FeatureEnabled(): boolean {
  return DRYWALL_QUOTE_V3_ENABLED
}
