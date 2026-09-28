import { describe, expect, it } from 'vitest'
import { toDateKey } from '@/lib/dateFormat'
import { cascadeSchedule } from '@/lib/scheduleDateMath'
import type { ScheduleItem } from '@/types'
import {
  changedItemsFromCascade,
  scheduleItemDateColumns,
  writeCascadedDateRows,
} from '@/services/scheduleService'

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

function makeItem(overrides: Partial<ScheduleItem> & { id: string; name: string }): ScheduleItem {
  return {
    id: overrides.id,
    scheduleId: overrides.scheduleId ?? 's1',
    type: overrides.type ?? 'field',
    name: overrides.name,
    startDate: overrides.startDate ?? d('2026-05-04'),
    endDate: overrides.endDate ?? d('2026-05-04'),
    duration: overrides.duration ?? 1,
    predecessorIds: overrides.predecessorIds ?? [],
    predecessors: overrides.predecessors ?? [],
    status: overrides.status ?? 'not-started',
    percentComplete: overrides.percentComplete ?? 0,
    confirmation_status: overrides.confirmation_status ?? 'unsent',
    assignedCompanyId: overrides.assignedCompanyId ?? null,
    assignedTo: overrides.assignedTo ?? [],
  }
}

describe('schedule cascade persist (T8)', () => {
  it('round-trips a local-midnight date key in this process zone', () => {
    const date = d('2026-05-08')
    expect(scheduleItemDateColumns({ startDate: date, endDate: date, duration: 1 })).toEqual({
      start_date: '2026-05-08',
      end_date: '2026-05-08',
      duration: 1,
    })
    expect(toDateKey(date)).toBe('2026-05-08')
    expect(toDateKey(d(toDateKey(date)))).toBe('2026-05-08')
  })

  it('writes only the rows the cascade moved', async () => {
    const a = makeItem({
      id: 'a',
      name: 'A',
      startDate: d('2026-05-04'),
      endDate: d('2026-05-06'),
      duration: 3,
    })
    const b = makeItem({
      id: 'b',
      name: 'B',
      startDate: d('2026-05-04'),
      endDate: d('2026-05-04'),
      duration: 1,
      predecessors: [{ predecessorId: 'a', lagDays: 0 }],
      predecessorIds: ['a'],
    })
    const result = cascadeSchedule([a, b])
    const rows = changedItemsFromCascade(result)
    expect(rows.map((row) => row.id)).toEqual(['b'])
    expect(toDateKey(rows[0].startDate)).toBe('2026-05-07')

    const written: string[] = []
    await writeCascadedDateRows(rows, async (id, patch) => {
      written.push(id)
      expect(patch.start_date).toBe('2026-05-07')
      expect(patch.end_date).toBe(toDateKey(rows[0].endDate))
      return { error: null }
    })
    expect(written).toEqual(['b'])
  })

  it('surfaces an update error and writes nothing when there are no changes', async () => {
    const item = makeItem({ id: 'a', name: 'A' })
    await expect(
      writeCascadedDateRows([item], async () => ({ error: { message: 'permission denied' } })),
    ).rejects.toThrow(/permission denied/)

    let called = false
    await writeCascadedDateRows([], async () => {
      called = true
      return { error: null }
    })
    expect(called).toBe(false)
  })
})
