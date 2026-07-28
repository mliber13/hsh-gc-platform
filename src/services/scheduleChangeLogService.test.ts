import { describe, expect, it } from 'vitest'
import {
  formatScheduleChange,
  formatScheduleChangeGroup,
  groupByTxid,
  type ScheduleChangeEntry,
} from './scheduleChangeLogService'

function entry(partial: Partial<ScheduleChangeEntry> & Pick<ScheduleChangeEntry, 'id' | 'txid'>): ScheduleChangeEntry {
  return {
    scheduleItemId: 'si-1',
    projectId: 'proj-1',
    organizationId: 'org-1',
    changedBy: 'user-1',
    changedByName: 'Jeremy',
    changedAt: '2026-07-28T15:00:00.000Z',
    action: 'updated',
    itemName: 'Hang',
    changes: {},
    ...partial,
  }
}

describe('formatScheduleChange', () => {
  it('formats a date move with day delta', () => {
    const text = formatScheduleChange(
      entry({
        id: '1',
        txid: 1,
        changes: {
          start_date: { old: '2026-07-28', new: '2026-07-30' },
          end_date: { old: '2026-07-28', new: '2026-07-30' },
        },
      }),
    )
    expect(text).toContain('moved Jul 28 → Jul 30')
    expect(text).toContain('2 days later')
  })

  it('formats reassignment with person names', () => {
    const names = new Map([
      ['doug', 'Doug'],
      ['sam', 'Sam'],
    ])
    const text = formatScheduleChange(
      entry({
        id: '2',
        txid: 2,
        changes: {
          assigned_persons: { old: ['sam'], new: ['doug'] },
        },
      }),
      { personNames: names },
    )
    expect(text).toBe('reassigned: +Doug, −Sam')
  })

  it('formats created and deleted', () => {
    expect(
      formatScheduleChange(
        entry({ id: '3', txid: 3, action: 'created', itemName: 'Stock', changes: {} }),
      ),
    ).toBe('created “Stock”')
    expect(
      formatScheduleChange(
        entry({ id: '4', txid: 4, action: 'deleted', itemName: 'Stock', changes: {} }),
      ),
    ).toBe('deleted “Stock”')
  })

  it('formats status change', () => {
    const text = formatScheduleChange(
      entry({
        id: '5',
        txid: 5,
        changes: {
          status: { old: 'not-started', new: 'in-progress' },
        },
      }),
    )
    expect(text).toBe('status: Not started → In progress')
  })
})

describe('groupByTxid', () => {
  it('groups cascade rows and picks date-move primary', () => {
    const hang = entry({
      id: 'a',
      txid: 99,
      itemName: 'Hang',
      scheduleItemId: 'hang',
      changes: {
        start_date: { old: '2026-07-28', new: '2026-07-30' },
        end_date: { old: '2026-07-28', new: '2026-07-30' },
      },
    })
    const finish = entry({
      id: 'b',
      txid: 99,
      itemName: 'Finish',
      scheduleItemId: 'finish',
      changes: {
        start_date: { old: '2026-07-31', new: '2026-08-02' },
      },
    })
    const clean = entry({
      id: 'c',
      txid: 99,
      itemName: 'Cleanout',
      scheduleItemId: 'clean',
      changes: {
        start_date: { old: '2026-08-03', new: '2026-08-05' },
      },
    })
    const groups = groupByTxid([finish, hang, clean])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.primary.itemName).toBe('Hang')
    expect(groups[0]!.dependentsCount).toBe(2)

    const headline = formatScheduleChangeGroup(groups[0]!)
    expect(headline).toContain('Jeremy')
    expect(headline).toContain('Hang')
    expect(headline).toContain('+2 dependents shifted')
  })

  it('keeps separate txids as separate groups', () => {
    const groups = groupByTxid([
      entry({ id: '1', txid: 1, changedAt: '2026-07-28T16:00:00.000Z' }),
      entry({ id: '2', txid: 2, changedAt: '2026-07-28T15:00:00.000Z' }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0]!.txid).toBe(1)
  })
})
