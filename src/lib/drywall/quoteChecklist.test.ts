import { describe, expect, it } from 'vitest'
import { buildQuoteChecklist, type QuoteChecklistInput } from './quoteChecklist'

const ready: QuoteChecklistInput = {
  lineCount: 11,
  total: 135702.31,
  useCustomScope: false,
  customScopeText: '',
  ceilingFinish: 'Level 4',
  wallFinish: 'Level 4',
  marginPct: 0.34,
  marginIndicator: 'green',
  floorPct: 0.3,
  client: 'Kimpres Real Estate LLC',
  address: '123 Main St',
  outcome: 'approved',
  sentAt: '2026-04-23T19:00:00.000Z',
  approvedAt: '2026-07-23T19:00:00.000Z',
}
const item = (input: QuoteChecklistInput, key: string) => buildQuoteChecklist(input).find((i) => i.key === key)!

describe('quote checklist', () => {
  it('an approved, complete quote checks every item', () => {
    expect(buildQuoteChecklist(ready).every((i) => i.state === 'done')).toBe(true)
    expect(item(ready, 'outcome').detail).toMatch(/^Approved/)
  })

  it('a new draft: nothing done but customer details', () => {
    const draft = { ...ready, lineCount: 0, total: 0, ceilingFinish: '', wallFinish: '', marginPct: null, marginIndicator: 'neutral', outcome: 'drafted' as const, sentAt: null, approvedAt: null }
    expect(buildQuoteChecklist(draft).map((i) => [i.key, i.state])).toEqual([
      ['lines', 'todo'],
      ['scope', 'todo'],
      ['margin', 'todo'],
      ['customer', 'done'],
      ['sent', 'todo'],
      ['outcome', 'todo'],
    ])
  })

  it('margin follows the floor indicator: red is bad, yellow a warning', () => {
    expect(item({ ...ready, marginIndicator: 'red', marginPct: 0.22 }, 'margin').state).toBe('bad')
    expect(item({ ...ready, marginIndicator: 'yellow', marginPct: 0.31 }, 'margin').state).toBe('warn')
  })

  it('custom scope counts only when written', () => {
    expect(item({ ...ready, useCustomScope: true, customScopeText: '' }, 'scope').state).toBe('todo')
    expect(item({ ...ready, useCustomScope: true, customScopeText: 'Hang and finish' }, 'scope').state).toBe('done')
  })

  it('a missing client or address is named, because it prints on the quote', () => {
    expect(item({ ...ready, address: '' }, 'customer').detail).toContain('address')
  })

  it('after sending, the outcome waits on the customer', () => {
    expect(item({ ...ready, outcome: 'sent', approvedAt: null }, 'outcome').detail).toBe('Waiting on the customer')
  })
})
