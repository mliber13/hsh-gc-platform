/** Drywall customer quote numbers — DW-YYYY-NNN (GC commercial quotes use Q-YYYY-NNN). */

const DW_QUOTE_NUMBER_RE = /^DW-\d{4}-\d{3}$/

export function isValidDrywallQuoteNumber(value: unknown): value is string {
  return typeof value === 'string' && DW_QUOTE_NUMBER_RE.test(value.trim())
}

export function drywallQuoteNumberLabel(quoteNumber: string | undefined | null): string {
  const n = String(quoteNumber ?? '').trim()
  return isValidDrywallQuoteNumber(n) ? n : ''
}
