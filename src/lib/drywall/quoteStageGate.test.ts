/**
 * Langenmayr, 2026-10-15: revised and re-sent, but the job sat in Field with no approval. Unlocking
 * an approved quote left the job where approval had put it, and the pill could step a sent quote
 * into Field by hand.
 */
import { describe, expect, it } from 'vitest'
import { moveToOrderBlockReason, quoteToFieldBlockReason, statusAfterQuoteUnlock } from './quoteStageGate'

describe('quote stage gate', () => {
  it('unlocking a quote sends a job in Field back to Quote', () => {
    expect(statusAfterQuoteUnlock('field-measurement', 'quote')).toBe('quote')
    expect(statusAfterQuoteUnlock('field-measurement', null)).toBe('quote')
  })

  it('jobs past Field, still in Quote, or taken in on a PO stay where they are', () => {
    expect(statusAfterQuoteUnlock('order', 'quote')).toBeUndefined()
    expect(statusAfterQuoteUnlock('production', null)).toBeUndefined()
    expect(statusAfterQuoteUnlock('quote', null)).toBeUndefined()
    expect(statusAfterQuoteUnlock('field-measurement', 'po')).toBeUndefined()
  })

  it('the pill cannot step a quote that is not approved into Field', () => {
    for (const outcome of ['drafted', 'sent', 'lost'] as const) {
      expect(quoteToFieldBlockReason('quote', 'field-measurement', outcome)).toMatch(/approv/i)
    }
    expect(quoteToFieldBlockReason('quote', 'field-measurement', 'approved')).toBeNull()
  })

  it('every other pill move is untouched, including Field back to Quote', () => {
    expect(quoteToFieldBlockReason('field-measurement', 'quote', 'sent')).toBeNull()
    expect(quoteToFieldBlockReason('project-info', 'quote', 'drafted')).toBeNull()
    expect(quoteToFieldBlockReason('field-measurement', 'order', 'sent')).toBeNull()
  })
})

describe('move to order', () => {
  it('a job still in Quote waits for the quote to be approved', () => {
    for (const outcome of ['drafted', 'sent', 'lost'] as const) {
      expect(moveToOrderBlockReason('quote', outcome)).toMatch(/approved/)
      expect(moveToOrderBlockReason('project-info', outcome)).toMatch(/approved/)
    }
  })

  it('an approved quote, or a job already in Field, goes ahead', () => {
    expect(moveToOrderBlockReason('quote', 'approved')).toBeNull()
    expect(moveToOrderBlockReason('field-measurement', 'sent')).toBeNull()
    expect(moveToOrderBlockReason('field-measurement', 'approved')).toBeNull()
  })
})
