import {
  buildQuotePdfTermsLines,
  resolveQuotePdfSettings,
} from './quotePdfSettings'
import { format } from 'date-fns'
import type { DrywallQuotePdfSettings, DrywallQuoteV3PdfSettings } from '@/types/drywall'

export interface ResolvedQuoteV3PdfSettings {
  documentOptions: ReturnType<typeof resolveQuotePdfSettings>
  notes_for_customer: string
  /** Legacy flat payment line when document_options were not stored. */
  legacy_payment_terms?: string
}

export function resolveQuoteV3DocumentOptions(
  raw?: DrywallQuoteV3PdfSettings | null,
): ReturnType<typeof resolveQuotePdfSettings> {
  const base = resolveQuotePdfSettings(raw?.document_options)

  if (!raw?.document_options) {
    const legacyValidity =
      raw?.validity_days != null ? parseInt(String(raw.validity_days), 10) : NaN
    const legacySignature = raw?.signature_lines

    return {
      ...base,
      ...(Number.isFinite(legacyValidity) && legacyValidity > 0
        ? {
            showValidityPeriod: true,
            quoteValidityDays: legacyValidity,
          }
        : {}),
      ...(legacySignature != null ? { includeSignatureLines: legacySignature } : {}),
    }
  }

  return base
}

export function resolveQuoteV3PdfSettings(
  raw?: DrywallQuoteV3PdfSettings | null,
): ResolvedQuoteV3PdfSettings {
  return {
    documentOptions: resolveQuoteV3DocumentOptions(raw),
    notes_for_customer: raw?.notes_for_customer?.trim() ?? '',
    legacy_payment_terms: raw?.payment_terms?.trim() || undefined,
  }
}

export function mergeQuoteV3DocumentOptions(
  quote: { pdf_settings?: DrywallQuoteV3PdfSettings },
  patch: Partial<DrywallQuotePdfSettings>,
): DrywallQuotePdfSettings {
  const current = resolveQuoteV3DocumentOptions(quote.pdf_settings)
  return { ...current, ...patch }
}

export function mapV2PdfSettingsToV3(
  raw?: DrywallQuotePdfSettings | null,
): DrywallQuoteV3PdfSettings {
  return {
    document_options: resolveQuotePdfSettings(raw),
  }
}

/** Bullet lines for v3 PDF TERMS & CONDITIONS (v2 parity + optional legacy payment string). */
export function buildQuoteV3PdfTermsLines(
  resolved: ResolvedQuoteV3PdfSettings,
  validUntil?: Date | null,
): string[] {
  const lines = buildQuotePdfTermsLines({
    ...resolved.documentOptions,
    showValidityPeriod: false,
  })
  const hasPayment = lines.some((line) => line.toLowerCase().startsWith('payment terms'))
  if (!hasPayment && resolved.legacy_payment_terms) {
    lines.unshift(resolved.legacy_payment_terms)
  }
  if (validUntil) {
    lines.push(`This quote is valid until ${format(validUntil, 'MMMM d, yyyy')}.`)
  } else if (
    resolved.documentOptions.showValidityPeriod &&
    resolved.documentOptions.quoteValidityDays > 0
  ) {
    lines.push(
      `This quote is valid for ${resolved.documentOptions.quoteValidityDays} days from the date shown above.`,
    )
  }
  if (resolved.notes_for_customer) {
    lines.push(resolved.notes_for_customer)
  }
  lines.push('This quote includes labor and materials unless otherwise noted.')
  return lines
}
