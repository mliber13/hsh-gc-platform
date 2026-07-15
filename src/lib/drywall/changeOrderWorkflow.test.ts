import { describe, expect, it } from 'vitest'
import type { DrywallChangeOrder } from '@/types/drywall'
import { applyDrywallChangeOrderTransition } from './changeOrderWorkflow'

const NOW = '2026-07-15T12:00:00.000Z'
const actor = { now: NOW, actorUserId: 'user-1', actorName: 'Office User' }

function draft(overrides: Partial<DrywallChangeOrder> = {}): DrywallChangeOrder {
  return {
    id: 'co-1',
    changeOrderNumber: 'CO-001',
    status: 'draft',
    reason: 'Added soffit',
    scopeChanges: 'Frame, hang, and finish added soffit.',
    requestedAmount: '2500',
    ...overrides,
  }
}

describe('change-order workflow', () => {
  it('submits a valid draft and permits deductive amounts', () => {
    const co = draft({ requestedAmount: '-500' })
    const result = applyDrywallChangeOrderTransition(co, [co], { action: 'submit' }, actor)

    expect(result.status).toBe('submitted')
    expect(result.submittedAt).toBe(NOW)
    expect(result.requestedAmount).toBe('-500')
  })

  it('rejects missing fields, duplicate numbers, and zero amounts', () => {
    expect(() =>
      applyDrywallChangeOrderTransition(
        draft({ scopeChanges: '' }),
        [],
        { action: 'submit' },
        actor,
      ),
    ).toThrow('required')
    expect(() =>
      applyDrywallChangeOrderTransition(
        draft(),
        [draft(), draft({ id: 'co-2' })],
        { action: 'submit' },
        actor,
      ),
    ).toThrow('unique')
    expect(() =>
      applyDrywallChangeOrderTransition(
        draft({ requestedAmount: '0' }),
        [],
        { action: 'submit' },
        actor,
      ),
    ).toThrow('non-zero')
  })

  it('allows Reason to be blank', () => {
    const co = draft({ reason: '' })
    const result = applyDrywallChangeOrderTransition(co, [co], { action: 'submit' }, actor)

    expect(result.status).toBe('submitted')
  })

  it('accepts only submitted records and stamps the audit details', () => {
    const submitted = draft({ status: 'submitted', submittedAt: NOW })
    const result = applyDrywallChangeOrderTransition(
      submitted,
      [submitted],
      { action: 'accept', acceptedAmount: '2250', acceptanceReference: 'Email 7/15/2026' },
      actor,
    )

    expect(result).toMatchObject({
      status: 'accepted',
      acceptedAmount: '2250',
      acceptedAt: NOW,
      acceptedByUserId: 'user-1',
      acceptedByName: 'Office User',
      acceptanceReference: 'Email 7/15/2026',
    })
  })

  it('requires an acceptance reference and rejection notes', () => {
    const submitted = draft({ status: 'submitted' })
    expect(() =>
      applyDrywallChangeOrderTransition(
        submitted,
        [submitted],
        { action: 'accept', acceptedAmount: '2500', acceptanceReference: '' },
        actor,
      ),
    ).toThrow('reference')
    expect(() =>
      applyDrywallChangeOrderTransition(
        submitted,
        [submitted],
        { action: 'reject', rejectionNotes: '' },
        actor,
      ),
    ).toThrow('notes')
  })

  it('rejects a submitted record and clears stale acceptance data', () => {
    const submitted = draft({
      status: 'submitted',
      acceptedAmount: '2500',
      acceptedAt: NOW,
      acceptanceReference: 'stale',
    })
    const result = applyDrywallChangeOrderTransition(
      submitted,
      [submitted],
      { action: 'reject', rejectionNotes: 'Customer declined.' },
      actor,
    )

    expect(result.status).toBe('rejected')
    expect(result.rejectionNotes).toBe('Customer declined.')
    expect(result.acceptedAmount).toBeUndefined()
    expect(result.acceptedAt).toBeUndefined()
  })
})
