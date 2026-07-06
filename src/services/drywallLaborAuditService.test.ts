import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PayPeriod } from '@/types/payroll'
import { DEFAULT_DASHBOARD_TARGETS } from '@/lib/drywall/dashboardTargets'
import type { OrgDrywallCatalogs } from '@/types/drywallCatalogs'

const mockFetchPayPeriodsForDrywallLabor = vi.fn()
const mockFetchDrywallProjects = vi.fn()
const mockFetchOrgDrywallCatalogs = vi.fn()
const mockFetchPayPeriods = vi.fn()
const mockSavePayPeriod = vi.fn()
const mockRequireUserOrgId = vi.fn()
const mockSupabaseSelect = vi.fn()

vi.mock('@/lib/supabase', () => ({
  isOnlineMode: () => true,
  supabase: {
    from: () => ({
      select: mockSupabaseSelect,
    }),
  },
}))

vi.mock('@/services/userService', () => ({
  requireUserOrgId: () => mockRequireUserOrgId(),
}))

vi.mock('@/services/drywallLaborService', () => ({
  fetchPayPeriodsForDrywallLabor: () => mockFetchPayPeriodsForDrywallLabor(),
}))

vi.mock('@/services/drywallProjectsService', () => ({
  fetchDrywallProjects: () => mockFetchDrywallProjects(),
}))

vi.mock('@/services/drywallCatalogsService', () => ({
  fetchOrgDrywallCatalogs: () => mockFetchOrgDrywallCatalogs(),
}))

vi.mock('@/services/hrPayrollService', () => ({
  fetchPayPeriods: () => mockFetchPayPeriods(),
  savePayPeriod: (...args: unknown[]) => mockSavePayPeriod(...args),
  HrPayrollPermissionError: class HrPayrollPermissionError extends Error {},
}))

import {
  assignLaborEntriesToProject,
  fetchDrywallLaborAudit,
  markLaborEntriesOffSystem,
  markLaborEntryOffSystem,
  retagLaborEntryType,
  type MislabeledLaborEntry,
} from '@/services/drywallLaborAuditService'

const DRYWALL_PROJECT_ID = 'drywall-proj-1'
const GC_PROJECT_ID = 'gc-proj-1'
const PERIOD_ID = 'period-1'

const emptyCatalogs: OrgDrywallCatalogs = {
  boards: [],
  finish_scopes: [
    {
      id: 'level_4',
      display_name: 'Level 4',
      applies_to_locations: ['wall', 'ceiling'],
      finisher_rate: 0.45,
      accessories_applied: {
        joint_compound: true,
        tape: true,
        screws: true,
        corner_bead: true,
      },
      payroll_piece_key: 'level_4',
    },
  ],
  accessories: [],
  rc_channel: [],
  suspended_grid: [],
  insulation: [],
  acoustic: [],
  metal_stud: [],
  frp: [],
  marginFloorTarget: 0.3,
  poEstimatedCostPerSqft: 2.5,
  dashboardTargets: DEFAULT_DASHBOARD_TARGETS,
}

function makePeriod(entries: PayPeriod['entries']): PayPeriod {
  return {
    id: PERIOD_ID,
    startDate: '2026-05-01',
    endDate: '2026-05-07',
    locked: false,
    entries,
  }
}

function pieceRow(overrides: Partial<MislabeledLaborEntry> = {}): MislabeledLaborEntry {
  return {
    payPeriodId: PERIOD_ID,
    periodLabel: 'May 1 – May 7, 2026',
    periodLocked: false,
    personId: 'person-1',
    personType: '1099',
    personName: 'Alex',
    entryType: 'piece',
    entryIndex: 0,
    pieces: 1000,
    amount: 500,
    jobId: DRYWALL_PROJECT_ID,
    jobName: 'Drywall Job',
    pieceKeyOrWorkType: 'bogus_piece_key',
    category: 'other',
    problem: 'unknown_type',
    ...overrides,
  }
}

describe('fetchDrywallLaborAudit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireUserOrgId.mockResolvedValue('org-1')
    mockSupabaseSelect.mockResolvedValue({
      data: [
        { id: DRYWALL_PROJECT_ID, name: 'Drywall Job', metadata: {} },
        { id: GC_PROJECT_ID, name: 'GC Job', metadata: {} },
      ],
      error: null,
    })
    mockFetchDrywallProjects.mockResolvedValue([
      { id: DRYWALL_PROJECT_ID, name: 'Drywall Job', status: 'production' },
    ])
    mockFetchOrgDrywallCatalogs.mockResolvedValue(emptyCatalogs)
  })

  it("scope:'all' surfaces a non-drywall-signal unassigned hour entry", async () => {
    mockFetchPayPeriodsForDrywallLabor.mockResolvedValue([
      makePeriod([
        {
          personId: 'p1',
          personType: 'w2',
          personName: 'Sam',
          hourEntries: [{ jobId: '', jobName: '', hours: 8 }],
          pieceEntries: [],
        },
      ]),
    ])

    const signalRows = await fetchDrywallLaborAudit({ scope: 'signal' })
    expect(signalRows).toHaveLength(0)

    const allRows = await fetchDrywallLaborAudit({ scope: 'all' })
    expect(allRows).toHaveLength(1)
    expect(allRows[0].problem).toBe('no_job')
    expect(allRows[0].entryType).toBe('hour')
  })

  it("flags on-drywall piece with category 'other' as unknown_type", async () => {
    mockFetchPayPeriodsForDrywallLabor.mockResolvedValue([
      makePeriod([
        {
          personId: 'p1',
          personType: '1099',
          personName: 'Alex',
          hourEntries: [],
          pieceEntries: [
            {
              jobId: DRYWALL_PROJECT_ID,
              jobName: 'Drywall Job',
              piece_key: 'bogus_piece_key',
              workType: 'bogus_piece_key',
              catalog_source: 'v3_drywall',
              totalPhases: 1,
              phasesCompleted: 1000,
              jobTotalSqft: 1000,
              rate: 0.5,
              amount: 500,
            },
          ],
        },
      ]),
    ])

    const rows = await fetchDrywallLaborAudit({ scope: 'signal' })
    const typeRows = rows.filter((r) => r.problem === 'unknown_type')
    expect(typeRows).toHaveLength(1)
    expect(typeRows[0].category).toBe('other')
    expect(typeRows[0].jobId).toBe(DRYWALL_PROJECT_ID)
  })

  it('skips off-system entries from the main audit list', async () => {
    mockFetchPayPeriodsForDrywallLabor.mockResolvedValue([
      makePeriod([
        {
          personId: 'p1',
          personType: 'w2',
          personName: 'Sam',
          hourEntries: [{ jobId: 'off-system', jobName: 'Off-system / Pre-app', hours: 4 }],
          pieceEntries: [],
        },
      ]),
    ])

    const rows = await fetchDrywallLaborAudit({ scope: 'all' })
    expect(rows).toHaveLength(0)
  })
})

describe('retagLaborEntryType', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireUserOrgId.mockResolvedValue('org-1')
    mockSavePayPeriod.mockResolvedValue({ ok: true })
  })

  it('changes only type keys and leaves amount unchanged', async () => {
    mockSupabaseSelect.mockResolvedValue({
      data: [{ id: DRYWALL_PROJECT_ID, name: 'Drywall Job', metadata: {} }],
      error: null,
    })
    mockFetchDrywallProjects.mockResolvedValue([
      { id: DRYWALL_PROJECT_ID, name: 'Drywall Job', status: 'production' },
    ])
    mockFetchOrgDrywallCatalogs.mockResolvedValue(emptyCatalogs)

    const period = makePeriod([
      {
        personId: 'person-1',
        personType: '1099',
        personName: 'Alex',
        hourEntries: [],
        pieceEntries: [
          {
            jobId: DRYWALL_PROJECT_ID,
            jobName: 'Drywall Job',
            piece_key: 'bogus_piece_key',
            workType: 'bogus_piece_key',
            catalog_source: 'v3_drywall',
            totalPhases: 1,
            phasesCompleted: 1000,
            jobTotalSqft: 1000,
            rate: 0.5,
            amount: 500,
          },
        ],
      },
    ])

    mockFetchPayPeriodsForDrywallLabor.mockResolvedValue([period])
    mockFetchPayPeriods.mockResolvedValue([period])

    const auditRows = await fetchDrywallLaborAudit({ scope: 'signal' })
    const row = auditRows.find((r) => r.problem === 'unknown_type')
    expect(row).toBeDefined()

    await retagLaborEntryType(row!, {
      piece_key: 'drywall_hanging',
      workType: 'drywall_hanging',
      catalog_source: 'v3_drywall',
    })

    const saved = mockSavePayPeriod.mock.calls[0][0] as PayPeriod
    const pe = saved.entries[0].pieceEntries![0]
    expect(pe.piece_key).toBe('drywall_hanging')
    expect(pe.workType).toBe('drywall_hanging')
    expect(pe.catalog_source).toBe('v3_drywall')
    expect(pe.amount).toBe(500)
    expect(pe.totalPhases).toBe(1)
    expect(pe.phasesCompleted).toBe(1000)
    expect(pe.jobTotalSqft).toBe(1000)
    expect(pe.rate).toBe(0.5)
  })
})

describe('markLaborEntryOffSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireUserOrgId.mockResolvedValue('org-1')
    mockSavePayPeriod.mockResolvedValue({ ok: true })
  })

  it('sets off-system sentinel on the entry', async () => {
    const period = makePeriod([
      {
        personId: 'person-1',
        personType: '1099',
        personName: 'Alex',
        hourEntries: [],
        pieceEntries: [
          {
            jobId: '',
            jobName: '',
            workType: 'finisher',
            totalPhases: 1,
            phasesCompleted: 500,
            jobTotalSqft: 1,
            rate: 0.5,
            amount: 250,
          },
        ],
      },
    ])

    mockFetchPayPeriods.mockResolvedValue([period])

    const row: MislabeledLaborEntry = {
      payPeriodId: PERIOD_ID,
      periodLabel: 'May 1 – May 7, 2026',
      periodLocked: false,
      personId: 'person-1',
      personType: '1099',
      personName: 'Alex',
      entryType: 'piece',
      entryIndex: 0,
      pieces: 500,
      amount: 250,
      jobId: null,
      jobName: null,
      pieceKeyOrWorkType: 'finisher',
      problem: 'no_job',
    }

    await markLaborEntryOffSystem(row)

    const saved = mockSavePayPeriod.mock.calls[0][0] as PayPeriod
    const pe = saved.entries[0].pieceEntries![0]
    expect(pe.jobId).toBe('off-system')
    expect(pe.jobName).toBe('Off-system / Pre-app')
  })

  it('removes entry from main audit after marking off-system', async () => {
    mockSupabaseSelect.mockResolvedValue({
      data: [{ id: DRYWALL_PROJECT_ID, name: 'Drywall Job', metadata: {} }],
      error: null,
    })
    mockFetchDrywallProjects.mockResolvedValue([
      { id: DRYWALL_PROJECT_ID, name: 'Drywall Job', status: 'production' },
    ])
    mockFetchOrgDrywallCatalogs.mockResolvedValue(emptyCatalogs)

    const period = makePeriod([
      {
        personId: 'person-1',
        personType: '1099',
        personName: 'Alex',
        hourEntries: [],
          pieceEntries: [
            {
              jobId: '',
              jobName: 'Drywall Job',
              workType: 'finisher',
              catalog_source: 'legacy',
              totalPhases: 1,
              phasesCompleted: 500,
              jobTotalSqft: 1,
              rate: 0.5,
              amount: 250,
            },
          ],
      },
    ])

    mockFetchPayPeriodsForDrywallLabor.mockResolvedValue([period])
    mockFetchPayPeriods.mockResolvedValue([period])

    const before = await fetchDrywallLaborAudit({ scope: 'signal' })
    expect(before.length).toBeGreaterThan(0)

    await markLaborEntryOffSystem(before[0])
    period.entries[0].pieceEntries![0].jobId = 'off-system'
    period.entries[0].pieceEntries![0].jobName = 'Off-system / Pre-app'

    const after = await fetchDrywallLaborAudit({ scope: 'signal' })
    expect(after).toHaveLength(0)
  })
})

describe('markLaborEntriesOffSystem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireUserOrgId.mockResolvedValue('org-1')
    mockSavePayPeriod.mockResolvedValue({ ok: true })
  })

  function jobProblemRow(entryIndex: number, personId: string): MislabeledLaborEntry {
    return {
      payPeriodId: PERIOD_ID,
      periodLabel: 'May 1 – May 7, 2026',
      periodLocked: false,
      personId,
      personType: '1099',
      personName: personId,
      entryType: 'piece',
      entryIndex,
      pieces: 500,
      amount: 250,
      jobId: null,
      jobName: 'Drywall Job',
      pieceKeyOrWorkType: 'finisher',
      problem: 'no_job',
    }
  }

  it('batches many rows into one fetch and one save per pay period', async () => {
    const period = makePeriod([
      {
        personId: 'p0',
        personType: '1099',
        personName: 'p0',
        hourEntries: [],
        pieceEntries: Array.from({ length: 10 }, () => ({
          jobId: '',
          jobName: 'Drywall Job',
          workType: 'finisher',
          catalog_source: 'legacy' as const,
          totalPhases: 1,
          phasesCompleted: 500,
          jobTotalSqft: 1,
          rate: 0.5,
          amount: 250,
        })),
      },
    ])

    mockFetchPayPeriods.mockResolvedValue([period])

    const rows = Array.from({ length: 10 }, (_, i) => jobProblemRow(i, 'p0'))
    const result = await markLaborEntriesOffSystem(rows)

    expect(result.done).toBe(10)
    expect(result.skippedLocked).toBe(0)
    expect(result.failed).toBe(0)
    expect(mockFetchPayPeriods).toHaveBeenCalledTimes(1)
    expect(mockSavePayPeriod).toHaveBeenCalledTimes(1)

    const saved = mockSavePayPeriod.mock.calls[0][0] as PayPeriod
    for (const pe of saved.entries[0].pieceEntries ?? []) {
      expect(pe.jobId).toBe('off-system')
    }
  })

  it('skips locked periods and reports them', async () => {
    const rows = [
      jobProblemRow(0, 'p0'),
      { ...jobProblemRow(1, 'p0'), periodLocked: true },
    ]

    const period = makePeriod([
      {
        personId: 'p0',
        personType: '1099',
        personName: 'p0',
        hourEntries: [],
        pieceEntries: [
          {
            jobId: '',
            jobName: 'Drywall Job',
            workType: 'finisher',
            totalPhases: 1,
            phasesCompleted: 500,
            jobTotalSqft: 1,
            rate: 0.5,
            amount: 250,
          },
          {
            jobId: '',
            jobName: 'Drywall Job',
            workType: 'finisher',
            totalPhases: 1,
            phasesCompleted: 500,
            jobTotalSqft: 1,
            rate: 0.5,
            amount: 250,
          },
        ],
      },
    ])

    mockFetchPayPeriods.mockResolvedValue([period])

    const result = await markLaborEntriesOffSystem(rows)
    expect(result.done).toBe(1)
    expect(result.skippedLocked).toBe(1)
    expect(mockSavePayPeriod).toHaveBeenCalledTimes(1)
  })
})

describe('assignLaborEntriesToProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireUserOrgId.mockResolvedValue('org-1')
    mockSavePayPeriod.mockResolvedValue({ ok: true })
  })

  it('assigns multiple rows to one project in a single save', async () => {
    const period = makePeriod([
      {
        personId: 'p0',
        personType: '1099',
        personName: 'p0',
        hourEntries: [],
        pieceEntries: [
          {
            jobId: '',
            jobName: '',
            workType: 'finisher',
            totalPhases: 1,
            phasesCompleted: 500,
            jobTotalSqft: 1,
            rate: 0.5,
            amount: 250,
          },
          {
            jobId: 'unassigned',
            jobName: '',
            workType: 'hang',
            totalPhases: 1,
            phasesCompleted: 200,
            jobTotalSqft: 1,
            rate: 0.5,
            amount: 100,
          },
        ],
      },
    ])

    mockFetchPayPeriods.mockResolvedValue([period])

    const rows: MislabeledLaborEntry[] = [
      {
        payPeriodId: PERIOD_ID,
        periodLabel: 'May 1 – May 7, 2026',
        periodLocked: false,
        personId: 'p0',
        personType: '1099',
        personName: 'p0',
        entryType: 'piece',
        entryIndex: 0,
        pieces: 500,
        amount: 250,
        jobId: null,
        jobName: null,
        pieceKeyOrWorkType: 'finisher',
        problem: 'no_job',
      },
      {
        payPeriodId: PERIOD_ID,
        periodLabel: 'May 1 – May 7, 2026',
        periodLocked: false,
        personId: 'p0',
        personType: '1099',
        personName: 'p0',
        entryType: 'piece',
        entryIndex: 1,
        pieces: 200,
        amount: 100,
        jobId: 'unassigned',
        jobName: null,
        pieceKeyOrWorkType: 'hang',
        problem: 'unassigned',
      },
    ]

    const result = await assignLaborEntriesToProject(rows, DRYWALL_PROJECT_ID, 'Drywall Job')
    expect(result.done).toBe(2)
    expect(mockSavePayPeriod).toHaveBeenCalledTimes(1)

    const saved = mockSavePayPeriod.mock.calls[0][0] as PayPeriod
    expect(saved.entries[0].pieceEntries?.[0].jobId).toBe(DRYWALL_PROJECT_ID)
    expect(saved.entries[0].pieceEntries?.[1].jobId).toBe(DRYWALL_PROJECT_ID)
  })
})
