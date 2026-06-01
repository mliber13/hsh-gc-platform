// ============================================================================
// Payroll math — pure functions (matches Drywall Payroll.jsx formulas)
// ============================================================================

import { addDays, endOfWeek, format, parseISO, startOfWeek, subDays } from 'date-fns'
import type {
  PayPeriod,
  PayrollEntry,
  PayrollHourEntry,
  PayrollPieceEntry,
} from '@/types/payroll'
import type { Employee, Contractor1099 } from '@/types/hr'
import { generateHrId, isArchivedMember } from '@/lib/hrTeamUtils'

/** First N hours per employee per run at 1× before OT multiplier applies. */
export const REGULAR_HOURS_CAP = 40

export const PAYROLL_WORK_TYPES = [
  { value: 'hang', label: 'Hang', rateKey: 'hangerRate', defaultPhases: 1 },
  { value: 'finisher', label: 'Finisher', rateKey: 'finisherRate', defaultPhases: 5 },
  { value: 'prepClean', label: 'Prep / Clean', rateKey: 'prepCleanRate', defaultPhases: 1 },
  { value: 'carpenter', label: 'Carpenter (Grid)', rateKey: 'carpenterRate', defaultPhases: 1 },
  { value: 'rcChannel', label: 'RC Channel', rateKey: 'rcChannelLaborRate', defaultPhases: 1 },
  { value: 'other', label: 'Other', rateKey: null, defaultPhases: 1 },
] as const

export type PayrollPersonProfile = Pick<
  Employee,
  | 'id'
  | 'name'
  | 'payType'
  | 'hourlyRate'
  | 'salaryAmount'
  | 'ownersDraw'
  | 'gasAllowance'
  | 'toolRepayments'
  | 'status'
>

export interface PayrollRowPerson extends PayrollPersonProfile {
  personType: 'w2' | '1099'
  personKey: string
  active?: boolean
}

export function personKey(personId: string, personType: string): string {
  return personType === 'w2' ? `w2-${personId}` : `c-${personId}`
}

export function parsePersonKey(key: string): { personId: string; personType: 'w2' | '1099' } {
  if (key.startsWith('w2-')) return { personId: key.slice(3), personType: 'w2' }
  if (key.startsWith('c-')) return { personId: key.slice(2), personType: '1099' }
  return { personId: key, personType: 'w2' }
}

export function getToolDeductionThisWeek(
  person: Pick<PayrollPersonProfile, 'toolRepayments'>,
): number {
  const reps = person.toolRepayments || []
  if (!Array.isArray(reps)) return 0
  return reps.reduce((sum, r) => {
    const total = parseFloat(String(r.totalAmount ?? r.amount ?? '')) || 0
    const paid = parseFloat(String(r.amountPaid ?? '')) || 0
    if (total > 0 && paid >= total) return sum
    return sum + (parseFloat(String(r.weeklyAmount ?? '')) || 0)
  }, 0)
}

export function getRateFromJob(
  project: { quote?: Record<string, unknown> } | null | undefined,
  workTypeValue: string,
): number | null {
  const wt = PAYROLL_WORK_TYPES.find((p) => p.value === workTypeValue)
  if (!wt?.rateKey) return null
  const q = project?.quote || {}
  const val = q[wt.rateKey]
  if (val == null || val === '') return null
  const n = parseFloat(String(val))
  return Number.isNaN(n) ? null : n
}

export function normalizeJobName(name: string | undefined | null): string {
  return String(name || '').trim().toLowerCase()
}

export function jobsMatch(
  aJobId: string | undefined,
  aJobName: string | undefined,
  bJobId: string | undefined,
  bJobName: string | undefined,
): boolean {
  const aId = String(aJobId || '').trim()
  const bId = String(bJobId || '').trim()
  const aName = normalizeJobName(aJobName)
  const bName = normalizeJobName(bJobName)

  if (!aId || !bId) {
    return !!(aName && bName && aName === bName)
  }

  if (aId === 'unassigned' || bId === 'unassigned') return false
  if (aId === bId) return true

  return !!(aName && bName && aName === bName)
}

export function calculatePieceTotal(pieceEntries: PayrollPieceEntry[] | undefined): number {
  const entries = Array.isArray(pieceEntries) ? pieceEntries : []
  return entries.reduce((sum, e) => sum + (parseFloat(String(e.amount)) || 0), 0)
}

export function getHelperDeductionForJob(
  allEntries: Record<string, PayrollEntry>,
  fromPersonKey: string,
  jobId: string,
  jobName: string,
): number {
  let total = 0
  for (const e of Object.values(allEntries)) {
    const helperPay = (e as PayrollEntry & { helperPayReceived?: { fromPersonId?: string; jobId?: string; jobName?: string; amount?: number | string }[] }).helperPayReceived || []
    for (const h of helperPay) {
      if (h.fromPersonId !== fromPersonKey) continue
      if (jobsMatch(h.jobId, h.jobName, jobId, jobName)) {
        total += parseFloat(String(h.amount)) || 0
      }
    }
    const hourEntries = e.hourEntries || []
    for (const he of hourEntries) {
      if (he.assignToPersonId !== fromPersonKey) continue
      if (jobsMatch(he.jobId, he.jobName, jobId, jobName)) {
        const rate = parseFloat(String(he.assignRate))
        if (!Number.isNaN(rate) && rate > 0) {
          total += (parseFloat(String(he.hours)) || 0) * rate
        } else {
          total += parseFloat(String(he.assignAmount)) || 0
        }
      }
    }
  }
  return total
}

export function getNetPieceTotal(
  pieceEntries: PayrollPieceEntry[] | undefined,
  allEntries: Record<string, PayrollEntry>,
  personKey: string,
): number {
  const entries = Array.isArray(pieceEntries) ? pieceEntries : []
  const byJob = new Map<string, { raw: number; jobId?: string; jobName?: string }>()
  for (const pe of entries) {
    const key = `${pe.jobId || ''}::${pe.jobName || ''}`
    const raw = parseFloat(String(pe.amount)) || 0
    const prev = byJob.get(key) || { raw: 0, jobId: pe.jobId, jobName: pe.jobName }
    prev.raw += raw
    byJob.set(key, prev)
  }
  let total = 0
  for (const item of byJob.values()) {
    const deduction = getHelperDeductionForJob(
      allEntries,
      personKey,
      item.jobId || '',
      item.jobName || '',
    )
    total += Math.max(0, item.raw - deduction)
  }
  return total
}

export function calculateHoursTotal(
  hourEntries: PayrollHourEntry[] | undefined,
  legacyHours?: number | string,
): number {
  const entries = Array.isArray(hourEntries) ? hourEntries : []
  if (entries.length > 0) {
    return entries.reduce((sum, e) => sum + (parseFloat(String(e.hours)) || 0), 0)
  }
  return parseFloat(String(legacyHours)) || 0
}

export function getRateForHourEntry(
  he: PayrollHourEntry | undefined,
  profileRate: number | string | null | undefined,
): number {
  const override = parseFloat(String(he?.rateOverride))
  if (!Number.isNaN(override) && override > 0) return override
  return parseFloat(String(profileRate)) || 0
}

export function getOvertimeMultiplier(he: PayrollHourEntry | undefined): number {
  const ot = he?.overtimeType || 'regular'
  if (ot === '1.5') return 1.5
  if (ot === '2') return 2
  return 1
}

export interface HourlyPayBreakdown {
  hourlyBase: number
  otPremium: number
  entryPayments: (PayrollHourEntry & {
    rate: number
    pay: number
    asRegular: number
    asOT: number
  })[]
}

export function calculateHourlyPayWithOvertimeCap(
  entry: PayrollEntry | undefined,
  profileRate: number | string | null | undefined,
  regularCap = REGULAR_HOURS_CAP,
): HourlyPayBreakdown {
  const hourEntries = entry?.hourEntries || []
  const profile = parseFloat(String(profileRate)) || 0
  if (hourEntries.length === 0) {
    const legacyHrs = parseFloat(String(entry?.hours)) || 0
    return { hourlyBase: legacyHrs * profile, otPremium: 0, entryPayments: [] }
  }
  let regularConsumed = 0
  let hourlyBase = 0
  let otPremium = 0
  const entryPayments: HourlyPayBreakdown['entryPayments'] = []
  for (const he of hourEntries) {
    const hrs = parseFloat(String(he.hours)) || 0
    const rate = getRateForHourEntry(he, profile)
    const mult = getOvertimeMultiplier(he)
    const remainingRegular = Math.max(0, regularCap - regularConsumed)
    const asRegular = Math.min(hrs, remainingRegular)
    const asOT = hrs - asRegular
    const pay = asRegular * rate + asOT * rate * mult
    hourlyBase += pay
    if (mult > 1 && asOT > 0) otPremium += asOT * rate * (mult - 1)
    regularConsumed += asRegular
    entryPayments.push({ ...he, rate, pay, asRegular, asOT })
  }
  return { hourlyBase, otPremium, entryPayments }
}

export function calculateHourlyBase(
  entry: PayrollEntry | undefined,
  profileRate: number | string | null | undefined,
): number {
  return calculateHourlyPayWithOvertimeCap(entry, profileRate).hourlyBase
}

export function calculateGross(
  person: PayrollPersonProfile,
  entry: PayrollEntry | undefined,
  is1099: boolean,
  allEntries: Record<string, PayrollEntry> = {},
  personKeyForPiece?: string,
): number {
  const pk = personKeyForPiece ?? personKey(person.id, is1099 ? '1099' : 'w2')
  let base = 0
  if (person.payType === 'salary') {
    base = parseFloat(String(person.salaryAmount)) || 0
  } else {
    let hourlyBase = calculateHourlyBase(entry, person.hourlyRate)
    const hoursTotal = calculateHoursTotal(entry?.hourEntries, entry?.hours)
    const hoursToBank = parseFloat(String(entry?.hoursToBank)) || 0
    if (hoursTotal > 0 && hoursToBank > 0) {
      const paidHours = Math.max(0, hoursTotal - hoursToBank)
      hourlyBase = hourlyBase * (paidHours / hoursTotal)
    }
    base = hourlyBase
  }
  const draw = parseFloat(String(person.ownersDraw)) || 0
  const gas = parseFloat(String(person.gasAllowance)) || 0
  const netPiece = getNetPieceTotal(entry?.pieceEntries, allEntries, pk)
  const perDiem = parseFloat(String(entry?.perDiem)) || 0
  const reimbursement = parseFloat(String(entry?.reimbursement)) || 0
  const toolDeduction = is1099 ? 0 : getToolDeductionThisWeek(person)
  const bankedHoursUsed = parseFloat(String(entry?.bankedHoursUsed)) || 0
  const bankedPayout = bankedHoursUsed * (parseFloat(String(person.hourlyRate)) || 0)
  return Math.max(
    0,
    base + draw + gas + netPiece + perDiem + reimbursement + bankedPayout - toolDeduction,
  )
}

export function recalcPieceEntryAmount(pe: PayrollPieceEntry): number {
  const total = Math.max(1, parseFloat(String(pe.totalPhases)) || 1)
  const done = parseFloat(String(pe.phasesCompleted)) || 0
  const sqft = parseFloat(String(pe.jobTotalSqft)) || 0
  const rate = parseFloat(String(pe.rate)) || 0
  return (done / total) * sqft * rate
}

export function entriesWithPay(entries: PayrollEntry[] | undefined): PayrollEntry[] {
  return (entries || []).filter((e) => (parseFloat(String(e.gross)) || 0) > 0)
}

export function aggregateRunTotalGross(entries: PayrollEntry[]): number {
  return entries.reduce((s, e) => s + (parseFloat(String(e.gross)) || 0), 0)
}

export interface PayrollCalculationDetail {
  name: string
  personType: string
  payType?: string | null
  salaryAmount: number
  hoursBreakdown: {
    jobName: string
    hours: number
    asRegular: number
    asOT: number
    rate: number
    pay: number
  }[]
  pieceBreakdown: {
    jobId?: string
    jobName: string
    workType: string
    phasesCompleted: number
    totalPhases: number
    jobTotalSqft: number
    rate: number
    amount: number
  }[]
  pieceDeductionTotal: number
  pieceNetTotal: number
  addons: { draw: number; perDiem: number; reimbursement: number; gas: number }
  bankedHoursUsed: number
  bankedPayout: number
  hoursToBank: number
  toolDeduction: number
  gross: number
}

export function getCalculationDetail(
  run: { entries?: PayrollEntry[] },
  employees: Employee[],
  contractors: Contractor1099[],
): PayrollCalculationDetail[] {
  const personById = (id: string, type: string) => {
    if (type === 'w2') return employees.find((p) => p.id === id)
    return contractors.find((p) => p.id === id)
  }
  const runEntriesById: Record<string, PayrollEntry> = {}
  ;(run.entries || []).forEach((e) => {
    const pid = personKey(e.personId, e.personType)
    runEntriesById[pid] = e
  })
  const getHelperDeduction = (fromPid: string, jobId: string, jobName: string) => {
    let total = 0
    for (const ent of Object.values(runEntriesById)) {
      for (const he of ent.hourEntries || []) {
        if (he.assignToPersonId !== fromPid) continue
        if (jobsMatch(he.jobId, he.jobName, jobId, jobName)) {
          const rate = parseFloat(String(he.assignRate))
          if (!Number.isNaN(rate) && rate > 0) {
            total += (parseFloat(String(he.hours)) || 0) * rate
          } else {
            total += parseFloat(String(he.assignAmount)) || 0
          }
        }
      }
    }
    return total
  }

  const details: PayrollCalculationDetail[] = []
  ;(run.entries || []).forEach((e) => {
    const person = personById(e.personId, e.personType)
    const pid = personKey(e.personId, e.personType)
    const profileRate = parseFloat(String(person?.hourlyRate)) || 0

    const { entryPayments } = calculateHourlyPayWithOvertimeCap(e, profileRate)
    const hoursBreakdown = entryPayments.map((h) => ({
      jobName: h.jobName || '—',
      hours: parseFloat(String(h.hours)) || 0,
      asRegular: h.asRegular ?? 0,
      asOT: h.asOT ?? 0,
      rate: h.rate ?? 0,
      pay: h.pay ?? 0,
    }))

    const pieceEntriesDetail = (e.pieceEntries || []).map((p) => ({
      jobId: p.jobId,
      jobName: p.jobName || 'Job',
      workType: p.workType || p.phase || '—',
      phasesCompleted: parseFloat(String(p.phasesCompleted)) || 0,
      totalPhases: Math.max(1, parseFloat(String(p.totalPhases)) || 1),
      jobTotalSqft: parseFloat(String(p.jobTotalSqft)) || 0,
      rate: parseFloat(String(p.rate)) || 0,
      amount: parseFloat(String(p.amount)) || 0,
    }))
    const pieceByJob = new Map<string, { jobId?: string; jobName: string; raw: number }>()
    pieceEntriesDetail.forEach((p) => {
      const jk = `${p.jobId || ''}::${p.jobName}`
      const prev = pieceByJob.get(jk) || { jobId: p.jobId, jobName: p.jobName, raw: 0 }
      prev.raw += p.amount
      pieceByJob.set(jk, prev)
    })
    let pieceDeductionTotal = 0
    pieceByJob.forEach((item) => {
      pieceDeductionTotal += getHelperDeduction(pid, item.jobId || '', item.jobName || '')
    })
    const pieceRawTotal = pieceEntriesDetail.reduce((s, p) => s + p.amount, 0)
    const pieceNetTotal = Math.max(0, pieceRawTotal - pieceDeductionTotal)

    const draw = parseFloat(String(person?.ownersDraw)) || 0
    const perDiem = parseFloat(String(e.perDiem)) || 0
    const reimbursement = parseFloat(String(e.reimbursement)) || 0
    const gas = parseFloat(String(person?.gasAllowance)) || 0
    const bankedHoursUsed = parseFloat(String(e.bankedHoursUsed)) || 0
    const bankedPayout = bankedHoursUsed * (parseFloat(String(person?.hourlyRate)) || 0)
    const hoursToBank = parseFloat(String(e.hoursToBank)) || 0
    const toolDeduction = e.personType === 'w2' ? getToolDeductionThisWeek(person || {}) : 0
    const gross = parseFloat(String(e.gross)) || 0

    details.push({
      name: e.personName || '—',
      personType: e.personType,
      payType: person?.payType,
      salaryAmount: person?.payType === 'salary' ? parseFloat(String(person.salaryAmount)) || 0 : 0,
      hoursBreakdown,
      pieceBreakdown: pieceEntriesDetail,
      pieceDeductionTotal,
      pieceNetTotal,
      addons: { draw, perDiem, reimbursement, gas },
      bankedHoursUsed,
      bankedPayout,
      hoursToBank,
      toolDeduction,
      gross,
    })
  })
  return details
}

export function buildPayrollPeople(
  employees: Employee[],
  contractors: Contractor1099[],
  includeArchived = false,
): PayrollRowPerson[] {
  const rows: PayrollRowPerson[] = []
  for (const e of employees) {
    if (!includeArchived && isArchivedMember(e)) continue
    rows.push({
      ...e,
      personType: 'w2',
      personKey: personKey(e.id, 'w2'),
    })
  }
  for (const c of contractors) {
    if (!includeArchived && isArchivedMember(c)) continue
    rows.push({
      ...c,
      personType: '1099',
      personKey: personKey(c.id, '1099'),
    })
  }
  return rows.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

export function quoteFromProjectMetadata(metadata: unknown): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined
  const meta = metadata as Record<string, unknown>
  if (meta.quote && typeof meta.quote === 'object') return meta.quote as Record<string, unknown>
  const legacy = meta.legacy
  if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
    const q = (legacy as Record<string, unknown>).quote
    if (q && typeof q === 'object') return q as Record<string, unknown>
  }
  return undefined
}

// ============================================================================
// Draft helpers (start-next-period, empty-state, row visibility)
// ============================================================================

export type PayrollDraftEntries = Record<string, PayrollEntry>

export function getPieceEntriesFromRunEntry(e: PayrollEntry | undefined): PayrollPieceEntry[] {
  const raw = e?.pieceEntries
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') {
    return Object.values(raw as Record<string, PayrollPieceEntry>)
  }
  return []
}

export function entryHasNonZeroAdjustments(entry: PayrollEntry | undefined): boolean {
  if (!entry) return false
  for (const field of ['perDiem', 'reimbursement', 'bankedHoursUsed', 'hoursToBank'] as const) {
    const n = parseFloat(String(entry[field] ?? ''))
    if (!Number.isNaN(n) && n !== 0) return true
  }
  return false
}

export function entryHasHourOrPieceRows(entry: PayrollEntry | undefined): boolean {
  return (
    (entry?.hourEntries?.length ?? 0) > 0 || getPieceEntriesFromRunEntry(entry).length > 0
  )
}

export function isPayrollDraftEmpty(entries: PayrollDraftEntries): boolean {
  const keys = Object.keys(entries)
  if (keys.length === 0) return true
  return keys.every(
    (k) => !entryHasHourOrPieceRows(entries[k]) && !entryHasNonZeroAdjustments(entries[k]),
  )
}

export function payrollRowVisibleWhenHidingEmpty(
  gross: number,
  entry: PayrollEntry | undefined,
): boolean {
  if (gross > 0) return true
  if (!entry) return false
  if (entryHasNonZeroAdjustments(entry)) return true
  return entryHasHourOrPieceRows(entry)
}

export function payrollWeekRangeContaining(date: Date): { start: string; end: string } {
  return {
    start: format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    end: format(endOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  }
}

export function payrollThisWeekRange(): { start: string; end: string } {
  return payrollWeekRangeContaining(new Date())
}

export function payrollLastWeekRange(): { start: string; end: string } {
  const prevMon = subDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 7)
  return payrollWeekRangeContaining(prevMon)
}

export function nextPeriodDateRangeFromRun(run: PayPeriod): { start: string; end: string } {
  const lastEnd = parseISO(run.endDate)
  const nextStart = addDays(lastEnd, 1)
  const nextEnd = endOfWeek(nextStart, { weekStartsOn: 1 })
  return {
    start: format(nextStart, 'yyyy-MM-dd'),
    end: format(nextEnd, 'yyyy-MM-dd'),
  }
}

/**
 * Copy last run's people + hour/piece row structure for the next pay period;
 * zero hours, phases completed, and adjustment fields (matches Drywall start-next-period).
 *
 * Archived members never enter new drafts — they may still appear in historical saved runs
 * from periods when they were active.
 */
export function buildDraftFromPreviousRun(
  previousRun: PayPeriod,
  currentPeople: PayrollRowPerson[],
): PayrollDraftEntries {
  const runEntriesByPid: Record<string, PayrollEntry> = {}
  for (const e of previousRun.entries || []) {
    runEntriesByPid[personKey(e.personId, e.personType)] = e
  }

  const loaded: PayrollDraftEntries = {}
  for (const person of currentPeople) {
    if (isArchivedMember(person)) continue
    const pk = person.personKey
    const e = runEntriesByPid[pk]
    const pieceList = getPieceEntriesFromRunEntry(e)

    loaded[pk] = {
      personId: person.id,
      personType: person.personType === 'w2' ? 'w2' : '1099',
      personName: person.name,
      hourEntries: (e?.hourEntries || []).map((he) => ({
        ...he,
        id: he.id || generateHrId(),
        hours: '',
        overtimeType: he.overtimeType || 'regular',
      })),
      pieceEntries: pieceList.map((pe) => {
        const src = pe && typeof pe === 'object' ? pe : ({} as PayrollPieceEntry)
        return {
          id: generateHrId(),
          jobId: src.jobId ?? '',
          jobName: src.jobName ?? '',
          workType: src.workType ?? src.phase ?? 'finisher',
          totalPhases: src.totalPhases ?? 1,
          phasesCompleted: '',
          jobTotalSqft: src.jobTotalSqft ?? '',
          rate: src.rate ?? '',
          amount: 0,
        }
      }),
      reimbursement: '',
      perDiem: '',
      bankedHoursUsed: '',
      hoursToBank: '',
      done: false,
    }
  }
  return loaded
}
