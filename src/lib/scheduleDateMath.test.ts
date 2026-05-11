import { describe, expect, it } from 'vitest'
import type { ScheduleItem } from '@/types'
import {
  addWorkdays,
  cascadeSchedule,
  isWorkday,
  nextWorkday,
  workdaysBetween,
} from './scheduleDateMath'

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
    description: overrides.description,
    trade: overrides.trade,
    estimateTradeId: overrides.estimateTradeId,
    actualStartDate: overrides.actualStartDate,
    actualEndDate: overrides.actualEndDate,
    notes: overrides.notes,
  }
}

describe('scheduleDateMath', () => {
  it('isWorkday supports weekdays, holidays, and company unavailability', () => {
    expect(isWorkday(d('2026-05-04'))).toBe(true)
    expect(isWorkday(d('2026-05-09'))).toBe(false)
    expect(isWorkday(d('2026-05-10'))).toBe(false)
    expect(isWorkday(d('2026-05-06'), { holidays: ['2026-05-06'] })).toBe(false)
    const options = { unavailability: [{ companyId: 'c1', start: '2026-05-06', end: '2026-05-07' }] }
    expect(isWorkday(d('2026-05-06'), options, 'c1')).toBe(false)
    expect(isWorkday(d('2026-05-06'), options, 'c2')).toBe(true)
  })

  it('nextWorkday snaps to current-or-next workday', () => {
    expect(nextWorkday(d('2026-05-08')).toISOString().slice(0, 10)).toBe('2026-05-08')
    expect(nextWorkday(d('2026-05-09')).toISOString().slice(0, 10)).toBe('2026-05-11')
    expect(nextWorkday(d('2026-05-10')).toISOString().slice(0, 10)).toBe('2026-05-11')
    expect(nextWorkday(d('2026-05-11')).toISOString().slice(0, 10)).toBe('2026-05-11')
  })

  it('addWorkdays handles positive, negative, zero and holidays', () => {
    expect(addWorkdays(d('2026-05-04'), 0).toISOString().slice(0, 10)).toBe('2026-05-04')
    expect(addWorkdays(d('2026-05-04'), 1).toISOString().slice(0, 10)).toBe('2026-05-05')
    expect(addWorkdays(d('2026-05-04'), 5).toISOString().slice(0, 10)).toBe('2026-05-11')
    expect(addWorkdays(d('2026-05-08'), 1).toISOString().slice(0, 10)).toBe('2026-05-11')
    expect(addWorkdays(d('2026-05-04'), -1).toISOString().slice(0, 10)).toBe('2026-05-01')
    expect(addWorkdays(d('2026-05-04'), 3, { holidays: ['2026-05-06'] }).toISOString().slice(0, 10)).toBe('2026-05-08')
  })

  it('workdaysBetween counts inclusive and supports reverse order', () => {
    expect(workdaysBetween(d('2026-05-04'), d('2026-05-08'))).toBe(5)
    expect(workdaysBetween(d('2026-05-04'), d('2026-05-11'))).toBe(6)
    expect(workdaysBetween(d('2026-05-04'), d('2026-05-04'))).toBe(1)
    expect(workdaysBetween(d('2026-05-08'), d('2026-05-04'))).toBe(-5)
  })

  it('cascadeSchedule handles empty and anchored items', () => {
    expect(cascadeSchedule([])).toEqual({ items: [], changes: [] })
    const anchored = makeItem({ id: 'a', name: 'A', startDate: d('2026-05-04'), endDate: d('2026-05-06'), duration: 3 })
    const result = cascadeSchedule([anchored])
    expect(result.changes).toHaveLength(0)
    expect(result.items[0].startDate.toISOString().slice(0, 10)).toBe('2026-05-04')
    expect(result.items[0].endDate.toISOString().slice(0, 10)).toBe('2026-05-06')
  })

  it('cascadeSchedule applies linear and multi-predecessor rules', () => {
    const a = makeItem({ id: 'a', name: 'A', startDate: d('2026-05-04'), endDate: d('2026-05-06'), duration: 3 })
    const c = makeItem({ id: 'c', name: 'C', startDate: d('2026-05-04'), endDate: d('2026-05-08'), duration: 5 })
    const b = makeItem({
      id: 'b',
      name: 'B',
      startDate: d('2026-05-04'),
      endDate: d('2026-05-04'),
      duration: 1,
      predecessors: [
        { predecessorId: 'a', lagDays: 0 },
        { predecessorId: 'c', lagDays: 0 },
      ],
      predecessorIds: ['a', 'c'],
    })
    const result = cascadeSchedule([a, b, c])
    const movedB = result.items.find((item) => item.id === 'b') as ScheduleItem
    expect(movedB.startDate.toISOString().slice(0, 10)).toBe('2026-05-11')
  })

  it('cascadeSchedule respects lag and weekend skip', () => {
    const a = makeItem({ id: 'a', name: 'A', startDate: d('2026-05-04'), endDate: d('2026-05-06'), duration: 3 })
    const b = makeItem({
      id: 'b',
      name: 'B',
      startDate: d('2026-05-04'),
      endDate: d('2026-05-04'),
      duration: 1,
      predecessors: [{ predecessorId: 'a', lagDays: 2 }],
      predecessorIds: ['a'],
    })
    const result = cascadeSchedule([a, b])
    const movedB = result.items.find((item) => item.id === 'b') as ScheduleItem
    expect(movedB.startDate.toISOString().slice(0, 10)).toBe('2026-05-11')

    const friday = makeItem({ id: 'f', name: 'F', startDate: d('2026-05-08'), endDate: d('2026-05-08'), duration: 1 })
    const mondayDep = makeItem({
      id: 'm',
      name: 'M',
      startDate: d('2026-05-08'),
      endDate: d('2026-05-08'),
      duration: 1,
      predecessors: [{ predecessorId: 'f', lagDays: 0 }],
      predecessorIds: ['f'],
    })
    const weekendResult = cascadeSchedule([friday, mondayDep])
    const movedM = weekendResult.items.find((item) => item.id === 'm') as ScheduleItem
    expect(movedM.startDate.toISOString().slice(0, 10)).toBe('2026-05-11')
  })

  it('cascadeSchedule handles diamond dependencies and cycles', () => {
    const a = makeItem({ id: 'a', name: 'A', startDate: d('2026-05-04'), endDate: d('2026-05-04'), duration: 1 })
    const b = makeItem({
      id: 'b',
      name: 'B',
      startDate: d('2026-05-04'),
      endDate: d('2026-05-04'),
      duration: 1,
      predecessors: [{ predecessorId: 'a', lagDays: 0 }],
      predecessorIds: ['a'],
    })
    const c = makeItem({
      id: 'c',
      name: 'C',
      startDate: d('2026-05-04'),
      endDate: d('2026-05-06'),
      duration: 3,
      predecessors: [{ predecessorId: 'a', lagDays: 0 }],
      predecessorIds: ['a'],
    })
    const dItem = makeItem({
      id: 'd',
      name: 'D',
      startDate: d('2026-05-04'),
      endDate: d('2026-05-04'),
      duration: 1,
      predecessors: [
        { predecessorId: 'b', lagDays: 0 },
        { predecessorId: 'c', lagDays: 0 },
      ],
      predecessorIds: ['b', 'c'],
    })
    const diamond = cascadeSchedule([a, b, c, dItem])
    const movedD = diamond.items.find((item) => item.id === 'd') as ScheduleItem
    expect(movedD.startDate.toISOString().slice(0, 10)).toBe('2026-05-08')

    const cycleA = makeItem({
      id: 'x',
      name: 'X',
      predecessors: [{ predecessorId: 'y', lagDays: 0 }],
      predecessorIds: ['y'],
    })
    const cycleB = makeItem({
      id: 'y',
      name: 'Y',
      predecessors: [{ predecessorId: 'x', lagDays: 0 }],
      predecessorIds: ['x'],
    })
    const cycleResult = cascadeSchedule([cycleA, cycleB])
    expect(cycleResult.changes).toHaveLength(0)
    expect(cycleResult.cycle).toBeDefined()
  })
})
