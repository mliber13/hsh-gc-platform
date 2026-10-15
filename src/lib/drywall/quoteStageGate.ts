// What ties a job's stage to its quote's outcome. Approval is the only thing that should move a
// job from Quote to Field: both rules below keep Field from holding a job whose quote is not
// approved (Mark, 2026-10-15 — Langenmayr sat in Field with its revised quote only sent).

import type { DrywallProjectStatus, DrywallQuoteOutcome } from '@/types/drywall'

/**
 * Unlocking a quote for revision undoes its approval, so a job that approval moved into Field
 * goes back to Quote; re-approving moves it forward again. Later stages stay put — by Order
 * there are orders and a schedule hanging off the job, and a revision there is a change order's
 * business. A PO-intake job never passed through Quote, so it has nowhere to go back to.
 */
export function statusAfterQuoteUnlock(
  status: DrywallProjectStatus,
  intakeSource: 'po' | 'quote' | null,
): DrywallProjectStatus | undefined {
  if (status !== 'field-measurement' || intakeSource === 'po') return undefined
  return 'quote'
}

/**
 * The status pill may move a job one stage either way, but Quote → Field is approval's move:
 * stepping over it by hand leaves a job in Field with a quote that was never accepted.
 * Returns why the move is refused, or null when it may go ahead.
 */
export function quoteToFieldBlockReason(
  from: DrywallProjectStatus,
  to: DrywallProjectStatus,
  outcome: DrywallQuoteOutcome,
): string | null {
  if (from !== 'quote' || to !== 'field-measurement' || outcome === 'approved') return null
  return outcome === 'sent'
    ? 'Mark the quote approved to move this job to Field — approval is what moves it.'
    : `The quote is ${outcome}, not approved. Approve it on the Quote tab to move the job to Field.`
}
