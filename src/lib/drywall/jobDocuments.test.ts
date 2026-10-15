import { describe, expect, it } from 'vitest'
import { guessDrywallDocumentType, sentQuoteFileName } from './jobDocuments'

describe('job documents', () => {
  it('names a sent quote by number, revision and the day it went out', () => {
    // Local noon, so the day is the same in every zone CI runs in.
    const sent = new Date(2026, 9, 15, 12).toISOString()
    expect(sentQuoteFileName('DW-2026-041', 2, sent)).toBe('Quote DW-2026-041 rev 2 - sent 10-15-2026.pdf')
    expect(sentQuoteFileName(undefined, 1, sent)).toBe('Quote rev 1 - sent 10-15-2026.pdf')
  })

  it('a PDF defaults to Plan — crew see it — unless its name says it is money paperwork', () => {
    expect(guessDrywallDocumentType('Langenmayr A-101 set.pdf', 'application/pdf')).toBe('plan')
    expect(guessDrywallDocumentType('PO 45512.pdf', 'application/pdf')).toBe('purchase-order')
    expect(guessDrywallDocumentType('Purchase Order - Payne.pdf', 'application/pdf')).toBe('purchase-order')
    expect(guessDrywallDocumentType('Quote DW-2026-041.pdf', 'application/pdf')).toBe('quote')
    expect(guessDrywallDocumentType('invoice 1182.pdf', 'application/pdf')).toBe('invoice')
    expect(guessDrywallDocumentType('Finish specs.pdf', 'application/pdf')).toBe('specification')
    expect(guessDrywallDocumentType('site.jpg', 'image/jpeg')).toBeNull()
  })

  it('a word that merely contains "po" is not a purchase order', () => {
    expect(guessDrywallDocumentType('Pool house plans.pdf', 'application/pdf')).toBe('plan')
    expect(guessDrywallDocumentType('Report.pdf', 'application/pdf')).toBe('plan')
  })
})
