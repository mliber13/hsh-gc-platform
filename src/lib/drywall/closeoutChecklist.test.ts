import { describe, expect, it } from 'vitest'
import { buildCloseoutChecklist, openCloseoutItems, type CloseoutInput } from './closeoutChecklist'

const ready: CloseoutInput = {
  productionComplete: true,
  materialPending: 0,
  materialAccepted: 4,
  afterProductionCost: 0,
  openChangeOrders: 0,
  invoicePending: 0,
  billedToDate: 24850,
  remainingToBill: 0,
  overbilledAmount: 0,
  sharedWithGc: false,
}
const state = (input: CloseoutInput, key: string) =>
  buildCloseoutChecklist(input).find((i) => i.key === key)?.state

describe('close-out checklist', () => {
  it('a finished, fully billed job has nothing open', () => {
    expect(openCloseoutItems(buildCloseoutChecklist(ready))).toEqual([])
  })

  it('pending QuickBooks bills or invoices are open — review them before closing', () => {
    expect(state({ ...ready, materialPending: 2 }, 'material')).toBe('open')
    expect(state({ ...ready, invoicePending: 1 }, 'billing')).toBe('open')
  })

  /** 4 of the 30 complete jobs on 2026-10-14: possible, but worth a look — not a blocker. */
  it('no material bill at all is a heads-up, not open', () => {
    expect(state({ ...ready, materialAccepted: 0 }, 'material')).toBe('heads_up')
  })

  it('a change order waiting on an answer is open', () => {
    expect(state({ ...ready, openChangeOrders: 1 }, 'change_orders')).toBe('open')
  })

  it('billing: left to bill is open; within a dollar is done; over is a heads-up', () => {
    expect(state({ ...ready, remainingToBill: 1850 }, 'billing')).toBe('open')
    expect(state({ ...ready, remainingToBill: 0.6 }, 'billing')).toBe('done')
    expect(state({ ...ready, overbilledAmount: 400 }, 'billing')).toBe('heads_up')
    expect(state({ ...ready, billedToDate: 0 }, 'billing')).toBe('open')
  })

  it('late costs show only once production is complete', () => {
    expect(state({ ...ready, afterProductionCost: 312 }, 'after_production')).toBe('heads_up')
    expect(state({ ...ready, productionComplete: false, afterProductionCost: null }, 'after_production')).toBeUndefined()
  })

  it('a shared GC job adds the payroll split reminder', () => {
    expect(state({ ...ready, sharedWithGc: true }, 'shared_labor')).toBe('heads_up')
    expect(state(ready, 'shared_labor')).toBeUndefined()
  })

  it('production not complete is open', () => {
    expect(state({ ...ready, productionComplete: false }, 'production')).toBe('open')
  })
})
