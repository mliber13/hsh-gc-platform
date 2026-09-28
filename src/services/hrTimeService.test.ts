import { describe, expect, it } from 'vitest'
import type { TimeEntry } from '@/types/hr'
import { groupPunchesForImport, LONG_PUNCH_REVIEW_HOURS } from '@/services/hrTimeService'

function entry(partial: Partial<TimeEntry> & Pick<TimeEntry, 'clock_in'>): TimeEntry {
  return {
    id: partial.id ?? 'e1',
    organization_id: 'org',
    person_type: partial.person_type ?? 'w2',
    person_id: partial.person_id ?? 'p1',
    person_name: partial.person_name ?? 'Ada',
    project_id: partial.project_id ?? 'job',
    project_name: partial.project_name ?? 'Job',
    clock_in: partial.clock_in,
    clock_out: partial.clock_out,
  }
}

function hoursLater(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000).toISOString()
}

describe('groupPunchesForImport (T10)', () => {
  it('rounds to the quarter hour and sums a person on one job', () => {
    // 1h 8m → 1.25. 2h exactly stays 2. Together 3.25.
    const start = '2026-09-22T14:00:00.000Z'
    const rows = groupPunchesForImport(
      [
        entry({ id: 'a', clock_in: start, clock_out: hoursLater(start, 1 + 8 / 60) }),
        entry({ id: 'b', clock_in: hoursLater(start, 5), clock_out: hoursLater(start, 7) }),
      ],
      '2026-09-21',
      '2026-09-27',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].hours).toBe(3.25)
    expect(rows[0].needsReview).toBe(false)
  })

  it('excludes an open punch', () => {
    const rows = groupPunchesForImport(
      [entry({ clock_in: '2026-09-22T14:00:00.000Z', clock_out: null })],
      '2026-09-21',
      '2026-09-27',
    )
    expect(rows).toEqual([])
  })

  it('flags a 60-hour punch and keeps all 60 hours', () => {
    const start = '2026-09-25T12:00:00.000Z'
    const rows = groupPunchesForImport(
      [entry({ clock_in: start, clock_out: hoursLater(start, 60) })],
      '2026-09-21',
      '2026-09-27',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].hours).toBe(60)
    expect(rows[0].hours).not.toBe(LONG_PUNCH_REVIEW_HOURS)
    expect(rows[0].needsReview).toBe(true)
  })

  it('does not flag a 16-hour day, and does not trim one minute past it', () => {
    const start = '2026-09-22T11:00:00.000Z'
    const exact = groupPunchesForImport(
      [entry({ clock_in: start, clock_out: hoursLater(start, 16) })],
      '2026-09-21',
      '2026-09-27',
    )
    expect(exact[0].needsReview).toBe(false)
    expect(exact[0].hours).toBe(16)

    const over = groupPunchesForImport(
      [entry({ clock_in: start, clock_out: hoursLater(start, 16 + 1 / 60) })],
      '2026-09-21',
      '2026-09-27',
    )
    expect(over[0].needsReview).toBe(true)
    expect(over[0].hours).toBe(16)
  })

  it('puts a Sunday 8:30pm Eastern punch in that week, not the next', () => {
    // 2026-09-27 20:30 EDT = 2026-09-28 00:30 UTC.
    const punch = entry({
      clock_in: '2026-09-28T00:30:00.000Z',
      clock_out: '2026-09-28T04:30:00.000Z',
    })
    const thisWeek = groupPunchesForImport([punch], '2026-09-21', '2026-09-27')
    const nextWeek = groupPunchesForImport([punch], '2026-09-28', '2026-10-04')
    expect(thisWeek).toHaveLength(1)
    expect(thisWeek[0].hours).toBe(4)
    expect(nextWeek).toEqual([])
  })
})
