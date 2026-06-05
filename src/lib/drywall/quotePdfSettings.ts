// ============================================================================
// Drywall quote PDF — document options (persisted on quote.pdfSettings)
// ============================================================================

import type { DrywallQuote, DrywallQuotePdfSettings } from '@/types/drywall'

export type DrywallQuotePaymentTerms =
  | 'none'
  | 'net_30'
  | 'net_15'
  | 'due_on_completion'
  | 'fifty_fifty'
  | 'progress_billing'

export const PAYMENT_TERM_OPTIONS: {
  value: DrywallQuotePaymentTerms
  label: string
}[] = [
  { value: 'none', label: 'Do not show payment terms' },
  { value: 'net_30', label: 'Net 30 (from invoice date)' },
  { value: 'net_15', label: 'Net 15 (from invoice date)' },
  { value: 'due_on_completion', label: 'Due upon completion' },
  { value: 'fifty_fifty', label: '50% deposit / 50% on completion' },
  { value: 'progress_billing', label: 'Progress billing (draw schedule)' },
]

export const DEFAULT_QUOTE_PDF_SETTINGS: Required<
  Pick<
    DrywallQuotePdfSettings,
    | 'showCostBreakdown'
    | 'showDurationSummary'
    | 'showValidityPeriod'
    | 'quoteValidityDays'
    | 'showTaxesSeparately'
    | 'paymentTerms'
    | 'includeGcDumpster'
    | 'includeGcWater'
    | 'includeGcPower'
    | 'includeGcClimateControl'
    | 'includeTwoPointUpTrips'
    | 'includeSignatureLines'
    | 'includeDrywallSubBreakdown'
    | 'includeTradeCostBreakdown'
  >
> = {
  showCostBreakdown: true,
  showDurationSummary: false,
  showValidityPeriod: true,
  quoteValidityDays: 120,
  showTaxesSeparately: true,
  paymentTerms: 'net_30',
  includeGcDumpster: false,
  includeGcWater: false,
  includeGcPower: false,
  includeGcClimateControl: false,
  includeTwoPointUpTrips: false,
  includeSignatureLines: true,
  includeDrywallSubBreakdown: false,
  includeTradeCostBreakdown: false,
}

export function resolveQuotePdfSettings(
  raw?: DrywallQuotePdfSettings | null,
): Required<typeof DEFAULT_QUOTE_PDF_SETTINGS> {
  const days = parseInt(String(raw?.quoteValidityDays ?? ''), 10)
  const includeTradeCostBreakdown =
    raw?.includeTradeCostBreakdown ??
    raw?.includeDrywallSubBreakdown ??
    DEFAULT_QUOTE_PDF_SETTINGS.includeTradeCostBreakdown
  return {
    ...DEFAULT_QUOTE_PDF_SETTINGS,
    ...raw,
    quoteValidityDays:
      Number.isFinite(days) && days > 0 ? days : DEFAULT_QUOTE_PDF_SETTINGS.quoteValidityDays,
    paymentTerms: raw?.paymentTerms ?? DEFAULT_QUOTE_PDF_SETTINGS.paymentTerms,
    includeTradeCostBreakdown,
    includeDrywallSubBreakdown: includeTradeCostBreakdown,
  }
}

export function mergeQuotePdfSettings(
  quote: DrywallQuote,
  patch: Partial<DrywallQuotePdfSettings>,
): DrywallQuotePdfSettings {
  return { ...resolveQuotePdfSettings(quote.pdfSettings), ...patch }
}

const PAYMENT_TERM_LINES: Record<DrywallQuotePaymentTerms, string | null> = {
  none: null,
  net_30: 'Payment terms: Net 30 days from the date of invoice.',
  net_15: 'Payment terms: Net 15 days from the date of invoice.',
  due_on_completion:
    'Payment terms: Balance due upon substantial completion of our drywall scope.',
  fifty_fifty:
    'Payment terms: 50% deposit upon acceptance of this quote; balance due upon completion of our scope.',
  progress_billing:
    'Payment terms: Progress billing per a mutually agreed draw schedule.',
}

/** Bullet lines for TERMS & CONDITIONS section on the PDF. */
export function buildQuotePdfTermsLines(
  settings: ReturnType<typeof resolveQuotePdfSettings>,
): string[] {
  const lines: string[] = []

  const payment = PAYMENT_TERM_LINES[settings.paymentTerms]
  if (payment) lines.push(payment)

  if (settings.showValidityPeriod && settings.quoteValidityDays > 0) {
    lines.push(
      `This quote is valid for ${settings.quoteValidityDays} days from the date shown above.`,
    )
  }

  if (settings.includeGcDumpster) {
    lines.push(
      'Dumpster and debris disposal for our drywall waste shall be provided by the General Contractor.',
    )
  }
  if (settings.includeGcWater) {
    lines.push(
      'Temporary water for mixing and cleanup shall be provided by the General Contractor.',
    )
  }
  if (settings.includeGcPower) {
    lines.push(
      'Temporary electrical power for tools and adequate lighting shall be provided by the General Contractor.',
    )
  }
  if (settings.includeGcClimateControl) {
    lines.push(
      'Heating and/or cooling adequate to maintain suitable finishing conditions (typically 50–95°F with reasonable humidity) shall be provided by the General Contractor during hang, finish, and punch work.',
    )
  }
  if (settings.includeTwoPointUpTrips) {
    lines.push(
      'Price includes two (2) return trips for touch-up / point-up after other trades are complete.',
    )
  }

  return lines
}
