/**
 * When refreshing a quote from its v2 snapshot needs a human first.
 *
 * Refresh replaces the priced lines. Three quotes were found on 2026-09-14 still
 * carrying pre-1db8d7b line splits, and two of them had already been sent —
 * together $9,192 under their own v2 figures. Correcting them is right; doing it
 * without the operator seeing the new total is not.
 */
import { describe, expect, it } from 'vitest'
import { refreshNeedsConfirmation } from './staleV3ConvertAudit'

describe('refreshNeedsConfirmation', () => {
  it('asks before rewriting a quote the customer is holding', () => {
    expect(refreshNeedsConfirmation('sent')).toBe(true)
    expect(refreshNeedsConfirmation('approved')).toBe(true)
  })

  it('stays out of the way on a draft', () => {
    // Nobody has seen it, so there is no number to disturb.
    expect(refreshNeedsConfirmation('drafted')).toBe(false)
  })

  it('stays out of the way on a lost quote', () => {
    expect(refreshNeedsConfirmation('lost')).toBe(false)
  })

  it('treats a missing outcome as a draft', () => {
    // Older quotes predate the outcome field; D.1.2 defaults them to drafted.
    expect(refreshNeedsConfirmation(undefined)).toBe(false)
  })
})
