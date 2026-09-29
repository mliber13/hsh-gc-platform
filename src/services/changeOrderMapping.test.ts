// T14 — the GC change-order round trip (P0-GC-1).
//
// The mappers are pure and exported precisely so this can run without a Supabase client:
// the bug being fixed was a whole surface writing to localStorage, and a test that needs a
// live database is a test nobody runs.

import { describe, expect, it } from 'vitest'
import {
  changeOrderFromRow,
  changeOrderToRow,
  nextChangeOrderNumber,
} from './changeOrderService'
import type { ChangeOrder } from '@/types'

const PROJECT = '11111111-1111-1111-1111-111111111111'

function co(over: Partial<ChangeOrder> = {}): ChangeOrder {
  return {
    id: '22222222-2222-2222-2222-222222222222',
    projectId: PROJECT,
    changeOrderNumber: 'CO-003',
    title: 'Add bulkhead at reception',
    description: 'Client added a soffit detail after framing',
    status: 'approved',
    requestedBy: 'Architect',
    requestDate: new Date('2026-09-10T00:00:00.000Z'),
    trades: [{ id: 'trade-1', name: 'Drywall' }] as ChangeOrder['trades'],
    costImpact: 4250.75,
    scheduleImpact: 3,
    approvedBy: 'Mark',
    approvalDate: new Date('2026-09-12T00:00:00.000Z'),
    implementedDate: undefined,
    actualCost: undefined,
    notes: 'Billed on the September draw',
    createdAt: new Date('2026-09-10T00:00:00.000Z'),
    updatedAt: new Date('2026-09-12T00:00:00.000Z'),
    ...over,
  }
}

describe('change order round trip', () => {
  it('survives a write and a read unchanged', () => {
    const original = co()
    const row = changeOrderToRow(PROJECT, original)
    const back = changeOrderFromRow({
      ...row,
      id: original.id,
      created_at: original.createdAt.toISOString(),
      updated_at: original.updatedAt.toISOString(),
    } as Parameters<typeof changeOrderFromRow>[0])

    expect(back.changeOrderNumber).toBe('CO-003')
    expect(back.title).toBe(original.title)
    expect(back.description).toBe(original.description)
    expect(back.status).toBe('approved')
    expect(back.requestedBy).toBe('Architect')
    expect(back.costImpact).toBe(4250.75)
    expect(back.scheduleImpact).toBe(3)
    expect(back.approvedBy).toBe('Mark')
    expect(back.notes).toBe(original.notes)
    expect(back.trades).toEqual(original.trades)
    expect(back.requestDate.toISOString()).toBe(original.requestDate.toISOString())
    expect(back.approvalDate?.toISOString()).toBe(original.approvalDate?.toISOString())
  })

  it('carries a negative cost impact — a change order can be a credit', () => {
    const row = changeOrderToRow(PROJECT, co({ costImpact: -1800, scheduleImpact: -2 }))
    expect(row.cost_impact).toBe(-1800)
    expect(row.schedule_impact_days).toBe(-2)
  })

  it('writes absent dates as null, never as an epoch date', () => {
    // `new Date(null)` is 1970-01-01, which would read back as a real approval.
    const row = changeOrderToRow(
      PROJECT,
      co({ approvalDate: undefined, implementedDate: undefined }),
    )
    expect(row.approved_date).toBeNull()
    expect(row.implemented_date).toBeNull()

    const back = changeOrderFromRow({ ...row, id: 'x' } as Parameters<
      typeof changeOrderFromRow
    >[0])
    expect(back.approvalDate).toBeUndefined()
    expect(back.implementedDate).toBeUndefined()
  })

  it('never writes an empty string where the unique index expects null', () => {
    // Two change orders with number '' would collide on (project_id, change_order_number).
    const row = changeOrderToRow(PROJECT, co({ changeOrderNumber: '   ' }))
    expect(row.change_order_number).toBeNull()
  })

  it('falls back to draft for a status the app does not model', () => {
    // The column defaulted to 'pending' before the CHECK constraint landed.
    const back = changeOrderFromRow({
      id: 'x',
      project_id: PROJECT,
      status: 'pending',
    } as Parameters<typeof changeOrderFromRow>[0])
    expect(back.status).toBe('draft')
  })

  it('reads a missing title and trades as empty rather than throwing', () => {
    const back = changeOrderFromRow({
      id: 'x',
      project_id: PROJECT,
      affected_trades: null,
    } as Parameters<typeof changeOrderFromRow>[0])
    expect(back.title).toBe('')
    expect(back.trades).toEqual([])
    expect(back.costImpact).toBe(0)
  })
})

describe('nextChangeOrderNumber', () => {
  it('starts at CO-001', () => {
    expect(nextChangeOrderNumber([])).toBe('CO-001')
  })

  it('takes the highest number in use, not the count', () => {
    // The old form used `length + 1`. Delete CO-002 of three and it proposes CO-003 again,
    // which the unique index now refuses.
    const existing = [co({ changeOrderNumber: 'CO-001' }), co({ changeOrderNumber: 'CO-003' })]
    expect(nextChangeOrderNumber(existing)).toBe('CO-004')
  })

  it('ignores numbers it cannot parse', () => {
    const existing = [co({ changeOrderNumber: 'rev A' }), co({ changeOrderNumber: 'CO-007' })]
    expect(nextChangeOrderNumber(existing)).toBe('CO-008')
  })

  it('pads past nine', () => {
    expect(nextChangeOrderNumber([co({ changeOrderNumber: 'CO-009' })])).toBe('CO-010')
  })
})
