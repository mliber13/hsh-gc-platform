import { DRYWALL_QUOTE_BASE_DEFAULTS } from './drywallQuoteDefaults'

export function getStudRateKey(size: string | undefined, gauge: string | undefined): string {
  return `${size || ''}_${gauge || ''}`
}

function insulationTypeHasFace(type: string): boolean {
  return type !== 'rigidInsulation1' && type !== 'rigidInsulation2'
}

/** Material $/sqft for insulation line — matches QuoteStage.jsx. */
export function getInsulationMaterialRate(
  type: string,
  face: string,
  overrideRate: unknown,
  pricingDefaults: Record<string, number> = DRYWALL_QUOTE_BASE_DEFAULTS.insulationPricing,
): number {
  if (overrideRate !== undefined && overrideRate !== null && overrideRate !== '') {
    return parseFloat(String(overrideRate)) || 0
  }
  if (!insulationTypeHasFace(type)) {
    return pricingDefaults[`${type}Rate`] || 0
  }
  const rateKey = `${type}${face.charAt(0).toUpperCase() + face.slice(1)}Rate`
  return pricingDefaults[rateKey] || 0
}

export function generateQuoteId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
