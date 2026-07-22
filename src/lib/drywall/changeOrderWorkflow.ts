import type { DrywallChangeOrder } from '@/types/drywall'

export type DrywallChangeOrderTransition =
  | { action: 'submit' }
  | { action: 'accept'; acceptedAmount: string; acceptanceReference: string }
  | { action: 'reject'; rejectionNotes: string }

export interface ChangeOrderTransitionContext {
  now: string
  actorUserId?: string
  actorName?: string
}

function finiteNonZeroAmount(value: unknown, label: string): string {
  const text = String(value ?? '').trim()
  const amount = Number(text)
  if (!text || !Number.isFinite(amount) || amount === 0) {
    throw new Error(`${label} must be a non-zero amount.`)
  }
  return text
}

export function applyDrywallChangeOrderTransition(
  existing: DrywallChangeOrder,
  siblings: DrywallChangeOrder[],
  transition: DrywallChangeOrderTransition,
  context: ChangeOrderTransitionContext,
): DrywallChangeOrder {
  const status = existing.status === 'approved' ? 'accepted' : existing.status || 'draft'
  const now = context.now

  if (transition.action === 'submit') {
    if (status !== 'draft' && status !== 'rejected') {
      throw new Error('Only draft or rejected change orders can be submitted.')
    }
    const number = existing.changeOrderNumber?.trim()
    // `description` is the merged field; fall back to legacy scopeChanges for old drafts.
    const scope = existing.description?.trim() || existing.scopeChanges?.trim()
    if (!number || !scope) {
      throw new Error('CO number and a description of the change are required before submission.')
    }
    const duplicate = siblings.some(
      (co) =>
        co.id !== existing.id &&
        co.changeOrderNumber?.trim().toLowerCase() === number.toLowerCase(),
    )
    if (duplicate) throw new Error('Change order number must be unique for this project.')
    return {
      ...existing,
      status: 'submitted',
      requestedAmount: finiteNonZeroAmount(existing.requestedAmount, 'Requested amount'),
      submittedAt: now,
      rejectedAt: undefined,
      rejectionNotes: undefined,
      updatedAt: now,
    }
  }

  if (transition.action === 'accept') {
    if (status !== 'submitted') throw new Error('Only submitted change orders can be accepted.')
    const reference = transition.acceptanceReference.trim()
    if (!reference) throw new Error('Customer acceptance reference is required.')
    return {
      ...existing,
      status: 'accepted',
      acceptedAmount: finiteNonZeroAmount(transition.acceptedAmount, 'Accepted amount'),
      acceptedAt: now,
      acceptedByUserId: context.actorUserId,
      acceptedByName: context.actorName || 'Office user',
      acceptanceReference: reference,
      rejectedAt: undefined,
      rejectionNotes: undefined,
      updatedAt: now,
    }
  }

  if (status !== 'submitted') throw new Error('Only submitted change orders can be rejected.')
  const notes = transition.rejectionNotes.trim()
  if (!notes) throw new Error('Rejection notes are required.')
  return {
    ...existing,
    status: 'rejected',
    rejectedAt: now,
    rejectionNotes: notes,
    acceptedAmount: undefined,
    acceptedAt: undefined,
    acceptedByUserId: undefined,
    acceptedByName: undefined,
    acceptanceReference: undefined,
    updatedAt: now,
  }
}
