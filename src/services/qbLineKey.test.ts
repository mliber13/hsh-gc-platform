// The key that stops a QuickBooks line being booked on both ledgers.
//
// Drywall material lives in `drywall_qb_materials`, GC material in `material_entries`, and
// neither knows about the other. If this key stops matching, the GC importer silently goes
// back to offering drywall transactions for allocation — which double-counts the cost
// without any error anywhere.

import { describe, expect, it } from 'vitest'
import { qbLineKey } from './drywallQbMaterialsService'

describe('qbLineKey', () => {
  it('matches the same line coming from either ledger', () => {
    // The GC feed spells it qbTransactionId; the drywall table stores qb_transaction_id.
    const fromGcFeed = { qbTransactionType: 'Bill', qbTransactionId: '68222', qbLineId: '1' }
    const fromDrywallRow = { qbTransactionType: 'Bill', qbTransactionId: '68222', qbLineId: '1' }
    expect(qbLineKey(fromGcFeed)).toBe(qbLineKey(fromDrywallRow))
  })

  it('separates the lines of one bill', () => {
    // A bill carries several lines, so the transaction id alone is not unique — "Beachwood -
    // Bannet" appeared twice in one pending list.
    const a = qbLineKey({ qbTransactionType: 'Bill', qbTransactionId: '68222', qbLineId: '1' })
    const b = qbLineKey({ qbTransactionType: 'Bill', qbTransactionId: '68222', qbLineId: '2' })
    expect(a).not.toBe(b)
  })

  it('separates the transaction types QuickBooks actually sends', () => {
    // Live data holds Bill, Purchase and VendorCredit, and ids are only unique within a type.
    const seen = new Set(
      ['Bill', 'Purchase', 'VendorCredit'].map((t) =>
        qbLineKey({ qbTransactionType: t, qbTransactionId: '1', qbLineId: '1' }),
      ),
    )
    expect(seen.size).toBe(3)
  })

  it('ignores surrounding whitespace', () => {
    expect(qbLineKey({ qbTransactionType: ' Bill ', qbTransactionId: ' 68222 ', qbLineId: ' 1 ' })).toBe(
      qbLineKey({ qbTransactionType: 'Bill', qbTransactionId: '68222', qbLineId: '1' }),
    )
  })

  it('treats a null line id the same as a missing one', () => {
    expect(qbLineKey({ qbTransactionType: 'Bill', qbTransactionId: '9', qbLineId: null })).toBe(
      qbLineKey({ qbTransactionType: 'Bill', qbTransactionId: '9' }),
    )
  })

  it('does not collapse different transactions into one key', () => {
    // A key built by concatenation without a separator would make ("1","23") and ("12","3")
    // identical, hiding a GC transaction that was never allocated anywhere.
    const a = qbLineKey({ qbTransactionType: 'Bill', qbTransactionId: '1', qbLineId: '23' })
    const b = qbLineKey({ qbTransactionType: 'Bill', qbTransactionId: '12', qbLineId: '3' })
    expect(a).not.toBe(b)
  })
})
