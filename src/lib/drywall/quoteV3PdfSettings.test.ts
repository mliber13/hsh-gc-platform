import { describe, expect, it } from 'vitest'
import {
  buildQuoteV3PdfTermsLines,
  mapV2PdfSettingsToV3,
  mergeQuoteV3DocumentOptions,
  resolveQuoteV3DocumentOptions,
  resolveQuoteV3PdfSettings,
} from './quoteV3PdfSettings'

describe('resolveQuoteV3DocumentOptions', () => {
  it('uses document_options when present', () => {
    const opts = resolveQuoteV3DocumentOptions({
      document_options: { showTaxesSeparately: false, paymentTerms: 'net_15' },
    })
    expect(opts.showTaxesSeparately).toBe(false)
    expect(opts.paymentTerms).toBe('net_15')
  })

  it('falls back to legacy flat validity and signature fields', () => {
    const opts = resolveQuoteV3DocumentOptions({
      validity_days: 45,
      signature_lines: false,
    })
    expect(opts.showValidityPeriod).toBe(true)
    expect(opts.quoteValidityDays).toBe(45)
    expect(opts.includeSignatureLines).toBe(false)
  })
})

describe('mapV2PdfSettingsToV3', () => {
  it('carries full v2 pdf toggles into document_options', () => {
    const mapped = mapV2PdfSettingsToV3({
      showTaxesSeparately: true,
      includeGcDumpster: true,
      paymentTerms: 'fifty_fifty',
    })
    expect(mapped.document_options?.showTaxesSeparately).toBe(true)
    expect(mapped.document_options?.includeGcDumpster).toBe(true)
    expect(mapped.document_options?.paymentTerms).toBe('fifty_fifty')
  })
})

describe('buildQuoteV3PdfTermsLines', () => {
  it('includes GC assumption bullets and legacy payment line', () => {
    const lines = buildQuoteV3PdfTermsLines(
      resolveQuoteV3PdfSettings({
        document_options: { includeGcWater: true, paymentTerms: 'none' },
        payment_terms: 'Custom payment schedule',
      }),
      null,
    )
    expect(lines.some((l) => l.includes('water'))).toBe(true)
    expect(lines[0]).toBe('Custom payment schedule')
  })
})

describe('mergeQuoteV3DocumentOptions', () => {
  it('merges patches onto resolved options', () => {
    const merged = mergeQuoteV3DocumentOptions(
      { pdf_settings: { document_options: { showTaxesSeparately: true } } },
      { showTaxesSeparately: false },
    )
    expect(merged.showTaxesSeparately).toBe(false)
  })
})
