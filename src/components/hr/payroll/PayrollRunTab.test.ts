import { describe, expect, it } from 'vitest'
import { personKey } from '@/lib/payrollMath'
import type { PayPeriod } from '@/types/payroll'
import type { Contractor1099, Employee } from '@/types/hr'
import { buildRunPayloadFromDraft, entriesFromRun } from './PayrollRunTab'

describe('buildRunPayloadFromDraft', () => {
  const activeEmployee: Employee = {
    id: 'emp-active',
    name: 'Active Worker',
    status: 'active',
    payType: 'hourly',
    hourlyRate: 25,
  }

  const archivedContractor: Contractor1099 = {
    id: 'sub-archived',
    name: 'GM Drywall and Remodeling LLC',
    status: 'archived',
    payType: 'piece',
    company: 'GM Drywall',
  }

  const existing: PayPeriod = {
    id: 'pp-feb-08',
    startDate: '2026-02-02',
    endDate: '2026-02-08',
    locked: true,
    entries: [
      {
        personId: 'emp-active',
        personType: 'w2',
        personName: 'Active Worker',
        hourEntries: [{ id: 'h1', jobId: 'job-1', hours: 8, overtimeType: 'regular' }],
        gross: 200,
      },
      {
        personId: 'sub-archived',
        personType: '1099',
        personName: 'GM Drywall and Remodeling LLC',
        pieceEntries: [
          {
            id: 'p1',
            jobId: 'job-2',
            jobName: 'Chardon-Clark',
            piece_key: 'drywall_hanging',
            amount: 1500,
          },
        ],
        gross: 1500,
      },
    ],
    totalGross: 1700,
  }

  it('preserves off-roster archived entries from existing period on save', () => {
    const draft = entriesFromRun(existing)
    const payload = buildRunPayloadFromDraft(
      existing.startDate,
      existing.endDate,
      draft,
      [activeEmployee],
      [archivedContractor],
      existing,
    )

    const keys = new Set(payload.entries.map((e) => personKey(e.personId, e.personType)))
    expect(keys.has(personKey('emp-active', 'w2'))).toBe(true)
    expect(keys.has(personKey('sub-archived', '1099'))).toBe(true)

    const archived = payload.entries.find(
      (e) => e.personId === 'sub-archived' && e.personType === '1099',
    )
    expect(archived?.personName).toBe('GM Drywall and Remodeling LLC')
    expect(archived?.pieceEntries).toHaveLength(1)
    expect(archived?.pieceEntries?.[0].amount).toBe(1500)
    expect(payload.totalGross).toBe(1700)

    for (const prev of existing.entries) {
      expect(keys.has(personKey(prev.personId, prev.personType))).toBe(true)
    }
  })

  it('preserves archived entry even when draft omits them from active roster filter', () => {
    const draft = entriesFromRun({
      ...existing,
      entries: [existing.entries[0]],
    })

    const payload = buildRunPayloadFromDraft(
      existing.startDate,
      existing.endDate,
      draft,
      [activeEmployee],
      [],
      existing,
    )

    const archived = payload.entries.find((e) => e.personId === 'sub-archived')
    expect(archived).toBeDefined()
    expect(archived?.gross).toBe(1500)
    expect(payload.totalGross).toBe(1700)
  })
})
