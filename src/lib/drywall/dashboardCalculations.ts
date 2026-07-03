import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfYear,
  isWeekend,
  parseISO,
  startOfMonth,
  startOfYear,
} from 'date-fns'
import { finisherCapacityTier, specialtyFromPositionName } from '@/lib/drywall/crewSpecialty'
import type { DashboardTargets } from '@/lib/drywall/dashboardTargets'
import { isArchivedMember } from '@/lib/hrTeamUtils'
import type { CrossProjectScheduleItem } from '@/services/drywallScheduleAggregateService'
import type { DrywallProjectListItem, DrywallProjectStatus } from '@/types/drywall'
import { normalizeDrywallProjectStatus } from '@/types/drywall'
import type { OrgTeamPayload } from '@/types/hr'

/** Approved-quote projects in these statuses count toward backlog (work remaining). */
export const DASHBOARD_BACKLOG_STATUSES: readonly DrywallProjectStatus[] = [
  'field-measurement',
  'order',
  'production',
] as const

export type KpiStatus = 'green' | 'yellow' | 'red'

export function paceStatus(pctOfRequired: number): KpiStatus {
  if (pctOfRequired >= 0.95) return 'green'
  if (pctOfRequired >= 0.8) return 'yellow'
  return 'red'
}

export function backlogStatus(current: number, goal: number): KpiStatus {
  if (goal <= 0) return current > 0 ? 'green' : 'yellow'
  const pct = current / goal
  if (pct >= 1) return 'green'
  if (pct >= 0.8) return 'yellow'
  return 'red'
}

export function formatDashboardCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDashboardPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

export interface DerivedRevenueGoals {
  monthly: number
  weekly: number
  daily: number
}

export function deriveRevenueGoals(targets: DashboardTargets): DerivedRevenueGoals {
  const { annualRevenueGoal, workingDaysPerMonth } = targets
  return {
    monthly: annualRevenueGoal / 12,
    weekly: annualRevenueGoal / 52,
    daily: annualRevenueGoal / (workingDaysPerMonth * 12),
  }
}

export interface CrewCounts {
  activeHangers: number
  activeFinishers: number
  productionFinishers: number
  apprenticeFinishers: number
  pointupFinishers: number
  hangerCrews: number
  subbedHangerCrews: number
  w2Hangers: number
}

function tallyFinisherMember(
  positionName: string | undefined,
  specialty: ReturnType<typeof specialtyFromPositionName>,
  tallies: Pick<
    CrewCounts,
    'productionFinishers' | 'apprenticeFinishers' | 'pointupFinishers' | 'activeFinishers'
  >,
): void {
  const tier = finisherCapacityTier(positionName)
  if (tier === 'pointup') {
    tallies.pointupFinishers += 1
    return
  }
  if (specialty !== 'finisher' && specialty !== 'both') return

  if (tier === 'apprentice') {
    tallies.apprenticeFinishers += 1
    tallies.activeFinishers += 1
  } else {
    tallies.productionFinishers += 1
    tallies.activeFinishers += 1
  }
}

export function countActiveCrew(team: OrgTeamPayload, hangersPerCrew: number): CrewCounts {
  const positionNameById = new Map(team.positions.map((p) => [p.id, p.name]))
  const positionNameOf = (m: { positionId?: string | null }) =>
    m.positionId ? positionNameById.get(m.positionId) : undefined
  const specialtyOf = (m: { positionId?: string | null }) =>
    specialtyFromPositionName(positionNameOf(m))

  const employees = team.employees.filter((m) => !isArchivedMember(m))
  const contractors = team.contractors1099.filter((m) => !isArchivedMember(m))

  let w2Hangers = 0
  let subbedHangerCrews = 0
  const finisherTallies = {
    productionFinishers: 0,
    apprenticeFinishers: 0,
    pointupFinishers: 0,
    activeFinishers: 0,
  }

  for (const m of employees) {
    const s = specialtyOf(m)
    if (s === 'hanger' || s === 'both') w2Hangers += 1
    tallyFinisherMember(positionNameOf(m), s, finisherTallies)
  }
  for (const m of contractors) {
    const s = specialtyOf(m)
    if (s === 'hanger' || s === 'both') subbedHangerCrews += 1
    tallyFinisherMember(positionNameOf(m), s, finisherTallies)
  }

  const perCrew = Math.max(1, hangersPerCrew)
  const hangerCrews = subbedHangerCrews + Math.floor(w2Hangers / perCrew)

  return {
    activeHangers: w2Hangers + subbedHangerCrews,
    activeFinishers: finisherTallies.activeFinishers,
    productionFinishers: finisherTallies.productionFinishers,
    apprenticeFinishers: finisherTallies.apprenticeFinishers,
    pointupFinishers: finisherTallies.pointupFinishers,
    hangerCrews,
    subbedHangerCrews,
    w2Hangers,
  }
}

export function deriveRevenuePerSqft(
  projects: DrywallProjectListItem[],
  override: number | null,
): number | null {
  if (override != null && override > 0) return override

  let sumRevenue = 0
  let sumSqft = 0
  for (const p of projects) {
    if (p.quoteOutcome !== 'approved') continue
    const rev = p.drywallScopeRevenue
    const sqft = p.sqft
    if (rev != null && rev > 0 && sqft != null && sqft > 0) {
      sumRevenue += rev
      sumSqft += sqft
    }
  }
  return sumSqft > 0 ? sumRevenue / sumSqft : null
}

export interface CapacityMetrics {
  hangerCrews: number
  finishers: number
  hangerSqftMo: number
  finisherSqftMo: number
  throughputSqft: number
  revenuePerSqft: number | null
  monthlyCapacity: number
  weeklyCapacity: number
  requiredMonthly: number
  pctOfRequired: number
  capacityGap: number
  bottleneck: 'hanging' | 'finishing'
  status: KpiStatus
}

export function computeCapacityMetrics(
  crew: CrewCounts,
  targets: DashboardTargets,
  revenuePerSqft: number | null,
): CapacityMetrics {
  const { capacity, workingDaysPerMonth } = targets
  const hangerSqftMo =
    crew.hangerCrews * capacity.hangerCrewSqftPerDay * workingDaysPerMonth
  const finisherSqftMo =
    crew.productionFinishers * capacity.finisherSqftPerDay * workingDaysPerMonth +
    crew.apprenticeFinishers * capacity.finisherApprenticeSqftPerDay * workingDaysPerMonth
  const throughputSqft = Math.min(hangerSqftMo, finisherSqftMo)
  const revPerSqft = revenuePerSqft ?? 0
  const monthlyCapacity = throughputSqft * revPerSqft
  const weeklyCapacity = monthlyCapacity / 4.33
  const requiredMonthly = targets.annualRevenueGoal / 12
  const pctOfRequired = requiredMonthly > 0 ? monthlyCapacity / requiredMonthly : 0
  const capacityGap = monthlyCapacity - requiredMonthly
  const bottleneck: 'hanging' | 'finishing' =
    hangerSqftMo < finisherSqftMo ? 'hanging' : 'finishing'

  return {
    hangerCrews: crew.hangerCrews,
    finishers: crew.activeFinishers,
    hangerSqftMo,
    finisherSqftMo,
    throughputSqft,
    revenuePerSqft,
    monthlyCapacity,
    weeklyCapacity,
    requiredMonthly,
    pctOfRequired,
    capacityGap,
    bottleneck,
    status: paceStatus(pctOfRequired),
  }
}

export interface ManpowerRow {
  label: string
  current: number
  target: number
  gap: number
  status: KpiStatus
}

export interface ManpowerMetrics {
  finishers: ManpowerRow
  hangerCrews: ManpowerRow
  fillPct: number
}

export function computeManpowerMetrics(crew: CrewCounts, targets: DashboardTargets): ManpowerMetrics {
  const finisherTarget = targets.manpowerTargets.finishers
  const hangerCrewTarget = targets.manpowerTargets.hangerCrews
  const finisherGap = finisherTarget - crew.activeFinishers
  const hangerCrewGap = hangerCrewTarget - crew.hangerCrews

  const finisherFill = finisherTarget > 0 ? crew.activeFinishers / finisherTarget : 1
  const hangerCrewFill = hangerCrewTarget > 0 ? crew.hangerCrews / hangerCrewTarget : 1
  const fillPct = Math.min(finisherFill, hangerCrewFill)

  const rowStatus = (gap: number): KpiStatus => (gap <= 0 ? 'green' : 'red')

  return {
    finishers: {
      label: 'Finishers',
      current: crew.activeFinishers,
      target: finisherTarget,
      gap: finisherGap,
      status: rowStatus(finisherGap),
    },
    hangerCrews: {
      label: 'Hanger Crews',
      current: crew.hangerCrews,
      target: hangerCrewTarget,
      gap: hangerCrewGap,
      status: rowStatus(hangerCrewGap),
    },
    fillPct,
  }
}

/** Accepted QB invoice rows fed into dashboard metrics (QB.2). */
export interface DashboardQbInvoiceInput {
  totalAmt: number
  balance: number
  txnDate: string | null
  matchedProjectId: string | null
}

export interface QbRevenueMetrics {
  billingsYtd: number
  billingsThisMonth: number
  ar: number
  hasBillings: boolean
  invoiceCount: number
}

export interface RevenuePaceMetrics {
  monthlyGoal: number
  billingsThisMonth: number
  pctOfGoal: number
  workDaysRemaining: number
  projectedEom: number
  variance: number
  ar: number
  hasBillings: boolean
  status: KpiStatus
}

export interface NorthStarMetrics {
  annualGoal: number
  awardedInSystem: number
  awardedBaseline: number
  awardedYtd: number
  billingsYtd: number
  paceSource: 'billings' | 'awarded'
  currentPace: number
  pctOfRequired: number
  revenueGap: number
  status: KpiStatus
  biggestConstraint: string
}

export interface BacklogMetrics {
  currentBacklog: number
  goalBacklog: number
  monthsRemaining: number | null
  pctOfGoal: number
  status: KpiStatus
  upcomingStarts: CrossProjectScheduleItem[]
  upcomingCompletions: CrossProjectScheduleItem[]
}

function isApprovedInCalendarYear(project: DrywallProjectListItem, year: number): boolean {
  if (project.quoteOutcome !== 'approved' || !project.quoteApprovedAt) return false
  try {
    const d = parseISO(project.quoteApprovedAt)
    return d.getFullYear() === year
  } catch {
    return false
  }
}

function isBacklogProject(project: DrywallProjectListItem): boolean {
  if (project.quoteOutcome !== 'approved') return false
  const status = normalizeDrywallProjectStatus(project.status)
  return (DASHBOARD_BACKLOG_STATUSES as readonly string[]).includes(status)
}

function parseTxnDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  try {
    const d = parseISO(iso)
    return Number.isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

/** Count Mon–Fri days in [start, end] inclusive (weekends excluded). */
function countWorkDays(start: Date, end: Date): number {
  if (end < start) return 0
  return eachDayOfInterval({ start, end }).filter((d) => !isWeekend(d)).length
}

export function computeQbRevenueMetrics(
  qbInvoices: DashboardQbInvoiceInput[],
  now = new Date(),
): QbRevenueMetrics {
  const year = now.getFullYear()
  let billingsYtd = 0
  let billingsThisMonth = 0
  let ar = 0

  for (const inv of qbInvoices) {
    ar += inv.balance
    const txn = parseTxnDate(inv.txnDate)
    if (!txn) continue
    if (txn.getFullYear() === year) {
      billingsYtd += inv.totalAmt
    }
    if (isInCurrentCalendarMonth(txn, now)) {
      billingsThisMonth += inv.totalAmt
    }
  }

  return {
    billingsYtd,
    billingsThisMonth,
    ar,
    hasBillings: billingsYtd > 0,
    invoiceCount: qbInvoices.length,
  }
}

export function computeRevenuePaceMetrics(
  qbRevenue: QbRevenueMetrics,
  monthlyGoal: number,
  now = new Date(),
): RevenuePaceMetrics {
  if (!qbRevenue.hasBillings) {
    return {
      monthlyGoal,
      billingsThisMonth: 0,
      pctOfGoal: 0,
      workDaysRemaining: 0,
      projectedEom: 0,
      variance: -monthlyGoal,
      ar: qbRevenue.ar,
      hasBillings: false,
      status: 'red',
    }
  }

  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)
  const workDaysInMonth = countWorkDays(monthStart, monthEnd)
  const workDaysElapsed = Math.max(1, countWorkDays(monthStart, now))
  const workDaysRemaining = Math.max(0, workDaysInMonth - workDaysElapsed)
  const projectedEom = (qbRevenue.billingsThisMonth / workDaysElapsed) * workDaysInMonth
  const pctOfGoal = monthlyGoal > 0 ? qbRevenue.billingsThisMonth / monthlyGoal : 0
  const variance = projectedEom - monthlyGoal

  return {
    monthlyGoal,
    billingsThisMonth: qbRevenue.billingsThisMonth,
    pctOfGoal,
    workDaysRemaining,
    projectedEom,
    variance,
    ar: qbRevenue.ar,
    hasBillings: true,
    status: paceStatus(pctOfGoal),
  }
}

export function computeNorthStarMetrics(
  projects: DrywallProjectListItem[],
  targets: DashboardTargets,
  capacity: CapacityMetrics,
  manpower: ManpowerMetrics,
  backlog: BacklogMetrics,
  qbRevenue: QbRevenueMetrics,
  now = new Date(),
): NorthStarMetrics {
  const year = now.getFullYear()
  const yearStart = startOfYear(now)
  const yearEnd = endOfYear(now)
  const daysElapsed = Math.max(1, differenceInCalendarDays(now, yearStart) + 1)
  const daysInYear = differenceInCalendarDays(yearEnd, yearStart) + 1

  const awardedInSystem = projects
    .filter((p) => isApprovedInCalendarYear(p, year))
    .reduce((sum, p) => sum + (p.quoteTotal ?? 0), 0)

  const baselineApplies =
    targets.offSystemAwardedYtdYear == null || targets.offSystemAwardedYtdYear === year
  const awardedBaseline = baselineApplies ? Math.max(0, targets.offSystemAwardedYtd || 0) : 0

  const awardedYtd = awardedInSystem + awardedBaseline
  const billingsYtd = qbRevenue.billingsYtd
  const paceSource: 'billings' | 'awarded' = qbRevenue.hasBillings ? 'billings' : 'awarded'
  const paceNumerator = paceSource === 'billings' ? billingsYtd : awardedYtd

  const annualGoal = targets.annualRevenueGoal
  const currentPace = paceNumerator / (daysElapsed / daysInYear)
  const pctOfRequired = annualGoal > 0 ? currentPace / annualGoal : 0
  const revenueGap = currentPace - annualGoal

  const capacityPct = capacity.pctOfRequired
  const manpowerPct = manpower.fillPct
  const backlogPct = backlog.pctOfGoal
  const pacePct = pctOfRequired

  const dimensions: { key: string; pct: number; label: string }[] = [
    {
      key: 'capacity',
      pct: capacityPct,
      label:
        capacity.bottleneck === 'hanging'
          ? 'Production Capacity — need more hanging crews'
          : 'Production Capacity — need more finishers',
    },
    {
      key: 'manpower',
      pct: manpowerPct,
      label:
        manpower.hangerCrews.gap > manpower.finishers.gap
          ? 'Manpower — need more hanger crews'
          : 'Manpower — need more finishers',
    },
    {
      key: 'backlog',
      pct: backlogPct,
      label: 'Backlog — pipeline too thin',
    },
    {
      key: 'pace',
      pct: pacePct,
      label: 'Revenue Pace — awards behind target',
    },
  ]

  const lowest = dimensions.reduce((min, d) => (d.pct < min.pct ? d : min), dimensions[0])

  return {
    annualGoal,
    awardedInSystem,
    awardedBaseline,
    awardedYtd,
    billingsYtd,
    paceSource,
    currentPace,
    pctOfRequired,
    revenueGap,
    status: paceStatus(pctOfRequired),
    biggestConstraint: lowest.label,
  }
}

export function computeBacklogMetrics(
  projects: DrywallProjectListItem[],
  scheduleItems: CrossProjectScheduleItem[],
  targets: DashboardTargets,
  capacity: CapacityMetrics,
  now = new Date(),
): BacklogMetrics {
  const currentBacklog = projects
    .filter(isBacklogProject)
    .reduce((sum, p) => sum + (p.quoteTotal ?? 0), 0)

  const goalBacklog = targets.backlogGoal
  const pctOfGoal = goalBacklog > 0 ? currentBacklog / goalBacklog : 0

  const monthlyDivisor =
    capacity.monthlyCapacity > 0 ? capacity.monthlyCapacity : capacity.requiredMonthly
  const monthsRemaining =
    monthlyDivisor > 0 ? currentBacklog / monthlyDivisor : null

  const windowEnd = addDays(now, 30)
  const upcomingStarts = scheduleItems.filter((item) => {
    if (item.status !== 'not-started') return false
    try {
      const start = parseISO(item.startDate)
      return start >= now && start <= windowEnd
    } catch {
      return false
    }
  })

  const upcomingCompletions = scheduleItems.filter((item) => {
    try {
      const end = parseISO(item.endDate)
      return end >= now && end <= windowEnd
    } catch {
      return false
    }
  })

  return {
    currentBacklog,
    goalBacklog,
    monthsRemaining,
    pctOfGoal,
    status: backlogStatus(currentBacklog, goalBacklog),
    upcomingStarts,
    upcomingCompletions,
  }
}

export interface EstimatingMetrics {
  bidVolumeCount: number
  bidVolumeValue: number
  awardedCount: number
  awardedValue: number
  hitRateMonth: number | null
  hitRateTrailing90: number | null
  pendingCount: number
  pendingValue: number
  avgMargin: number | null
  avgJobSize: number | null
}

function parseQuoteTimestamp(iso: string | null | undefined): Date | null {
  if (!iso) return null
  try {
    const d = parseISO(iso)
    return Number.isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

export function isInCurrentCalendarMonth(date: Date, now: Date): boolean {
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
}

export function isWithinTrailingDays(date: Date, days: number, now: Date): boolean {
  const start = addDays(now, -days)
  return date >= start && date <= now
}

function hasValidQuoteTotal(project: DrywallProjectListItem): boolean {
  return project.quoteTotal != null && project.quoteTotal > 0
}

function isSentOrDecidedQuote(project: DrywallProjectListItem): boolean {
  return project.quoteOutcome != null && project.quoteOutcome !== 'drafted'
}

export function computeEstimatingMetrics(
  projects: DrywallProjectListItem[],
  now = new Date(),
): EstimatingMetrics {
  let bidVolumeCount = 0
  let bidVolumeValue = 0
  let awardedCount = 0
  let awardedValue = 0
  let monthApproved = 0
  let monthLost = 0
  let trailing90Approved = 0
  let trailing90Lost = 0
  let pendingCount = 0
  let pendingValue = 0
  const marginRatios: number[] = []
  const awardedTotals: number[] = []

  for (const p of projects) {
    if (!hasValidQuoteTotal(p) || !isSentOrDecidedQuote(p)) continue

    const total = p.quoteTotal!
    const sentAt = parseQuoteTimestamp(p.quoteSentAt)
    const approvedAt = parseQuoteTimestamp(p.quoteApprovedAt)
    const lostAt = parseQuoteTimestamp(p.quoteLostAt)

    if (sentAt && isInCurrentCalendarMonth(sentAt, now)) {
      bidVolumeCount += 1
      bidVolumeValue += total

      const overhead = p.quoteOverheadAmount
      const profit = p.quoteProfitAmount
      if (overhead != null && profit != null) {
        marginRatios.push((overhead + profit) / total)
      }
    }

    if (p.quoteOutcome === 'approved' && approvedAt && isInCurrentCalendarMonth(approvedAt, now)) {
      awardedCount += 1
      awardedValue += total
      awardedTotals.push(total)
      monthApproved += 1
    }

    if (p.quoteOutcome === 'lost' && lostAt && isInCurrentCalendarMonth(lostAt, now)) {
      monthLost += 1
    }

    if (p.quoteOutcome === 'approved' && approvedAt && isWithinTrailingDays(approvedAt, 90, now)) {
      trailing90Approved += 1
    }

    if (p.quoteOutcome === 'lost' && lostAt && isWithinTrailingDays(lostAt, 90, now)) {
      trailing90Lost += 1
    }

    if (p.quoteOutcome === 'sent') {
      pendingCount += 1
      pendingValue += total
    }
  }

  const monthDecided = monthApproved + monthLost
  const hitRateMonth = monthDecided > 0 ? monthApproved / monthDecided : null

  const trailing90Decided = trailing90Approved + trailing90Lost
  const hitRateTrailing90 =
    trailing90Decided > 0 ? trailing90Approved / trailing90Decided : null

  const avgMargin =
    marginRatios.length > 0
      ? marginRatios.reduce((sum, r) => sum + r, 0) / marginRatios.length
      : null

  const avgJobSize =
    awardedTotals.length > 0
      ? awardedTotals.reduce((sum, t) => sum + t, 0) / awardedTotals.length
      : null

  return {
    bidVolumeCount,
    bidVolumeValue,
    awardedCount,
    awardedValue,
    hitRateMonth,
    hitRateTrailing90,
    pendingCount,
    pendingValue,
    avgMargin,
    avgJobSize,
  }
}

export interface DashboardMetrics {
  revenueGoals: DerivedRevenueGoals
  crew: CrewCounts
  revenuePerSqft: number | null
  capacity: CapacityMetrics
  manpower: ManpowerMetrics
  backlog: BacklogMetrics
  estimating: EstimatingMetrics
  qbRevenue: QbRevenueMetrics
  revenuePace: RevenuePaceMetrics
  northStar: NorthStarMetrics
}

export function computeDashboardMetrics(
  projects: DrywallProjectListItem[],
  scheduleItems: CrossProjectScheduleItem[],
  team: OrgTeamPayload,
  targets: DashboardTargets,
  qbInvoices: DashboardQbInvoiceInput[] = [],
  now = new Date(),
): DashboardMetrics {
  const revenueGoals = deriveRevenueGoals(targets)
  const crew = countActiveCrew(team, targets.capacity.hangersPerCrew)
  const revenuePerSqft = deriveRevenuePerSqft(projects, targets.capacity.revenuePerSqftOverride)
  const capacity = computeCapacityMetrics(crew, targets, revenuePerSqft)
  const manpower = computeManpowerMetrics(crew, targets)
  const backlog = computeBacklogMetrics(projects, scheduleItems, targets, capacity, now)
  const estimating = computeEstimatingMetrics(projects, now)
  const qbRevenue = computeQbRevenueMetrics(qbInvoices, now)
  const revenuePace = computeRevenuePaceMetrics(qbRevenue, revenueGoals.monthly, now)
  const northStar = computeNorthStarMetrics(
    projects,
    targets,
    capacity,
    manpower,
    backlog,
    qbRevenue,
    now,
  )

  return {
    revenueGoals,
    crew,
    revenuePerSqft,
    capacity,
    manpower,
    backlog,
    estimating,
    qbRevenue,
    revenuePace,
    northStar,
  }
}
