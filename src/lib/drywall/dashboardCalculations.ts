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
import type {
  DivisionExecutionJob,
  DivisionLaborPerformance,
  EstimatingAccuracy,
} from '@/services/drywallDivisionAggregateService'
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

export interface FinancialsPeriod {
  revenue: number
  cogsMaterial: number
  cogsLabor: number
  cogsSub: number
  cogsTotal: number
  grossProfit: number
  grossMarginPct: number | null
  jobCount: number
  excludedNoRevenue: number
}

export interface ArAgingBucket {
  label: string
  amount: number
  count: number
}

export interface FinancialsMetrics {
  ytd: FinancialsPeriod
  mtd: FinancialsPeriod
  arTotal: number
  arAging: ArAgingBucket[]
  arAgingComplete: boolean
  monthlyTrend: Array<{
    month: string
    monthIndex: number
    revenue: number
    grossProfit: number
    grossMarginPct: number | null
  }>
  status: KpiStatus
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

function emptyFinancialsPeriod(): FinancialsPeriod {
  return {
    revenue: 0,
    cogsMaterial: 0,
    cogsLabor: 0,
    cogsSub: 0,
    cogsTotal: 0,
    grossProfit: 0,
    grossMarginPct: null,
    jobCount: 0,
    excludedNoRevenue: 0,
  }
}

function finalizeFinancialsPeriod(period: FinancialsPeriod): FinancialsPeriod {
  period.cogsTotal = period.cogsMaterial + period.cogsLabor + period.cogsSub
  period.grossMarginPct = period.revenue > 0 ? period.grossProfit / period.revenue : null
  return period
}

function financialsStatus(grossMarginPct: number | null, jobCount: number): KpiStatus {
  if (jobCount === 0) return 'green'
  if (grossMarginPct == null) return 'red'
  if (grossMarginPct >= 0.3) return 'green'
  if (grossMarginPct >= 0.25) return 'yellow'
  return 'red'
}

function parseCompletedAt(iso: string | null): Date | null {
  if (!iso) return null
  try {
    const d = parseISO(iso)
    return Number.isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

function accumulateJobRevenue(
  period: FinancialsPeriod,
  job: DivisionExecutionJob,
  revenue: number,
): void {
  period.jobCount += 1
  period.revenue += revenue
  period.cogsMaterial += job.actualMaterial
  period.cogsLabor += job.actualLabor
  period.cogsSub += job.actualSub
  period.grossProfit += revenue - job.totalActual
}

function jobRevenue(
  job: DivisionExecutionJob,
  billingsByProject: Map<string, number>,
): number {
  const billed = billingsByProject.get(job.projectId) ?? 0
  return billed > 0 ? billed : (job.bid ?? 0)
}

export function computeFinancialsMetrics(
  jobs: DivisionExecutionJob[],
  qbInvoices: DashboardQbInvoiceInput[],
  now = new Date(),
): FinancialsMetrics {
  const year = now.getFullYear()
  const currentMonthIndex = now.getMonth()

  const billingsByProject = new Map<string, number>()
  for (const inv of qbInvoices) {
    if (!inv.matchedProjectId) continue
    billingsByProject.set(
      inv.matchedProjectId,
      (billingsByProject.get(inv.matchedProjectId) ?? 0) + inv.totalAmt,
    )
  }

  const ytd = emptyFinancialsPeriod()
  const mtd = emptyFinancialsPeriod()
  const monthBuckets = Array.from({ length: currentMonthIndex + 1 }, (_, monthIndex) => ({
    month: MONTH_LABELS[monthIndex],
    monthIndex,
    revenue: 0,
    grossProfit: 0,
    grossMarginPct: null as number | null,
  }))

  const completedJobs = jobs.filter((job) => job.completedAt && !job.inProgress)

  for (const job of completedJobs) {
    const completedAt = parseCompletedAt(job.completedAt)
    if (!completedAt) continue

    const revenue = jobRevenue(job, billingsByProject)
    const inYtd = completedAt.getFullYear() === year
    const inMtd =
      completedAt.getFullYear() === year && completedAt.getMonth() === currentMonthIndex

    if (!inYtd) continue

    if (revenue <= 0) {
      ytd.excludedNoRevenue += 1
      if (inMtd) mtd.excludedNoRevenue += 1
      continue
    }

    accumulateJobRevenue(ytd, job, revenue)
    if (inMtd) {
      accumulateJobRevenue(mtd, job, revenue)
    }

    const monthIndex = completedAt.getMonth()
    if (monthIndex <= currentMonthIndex) {
      const bucket = monthBuckets[monthIndex]
      bucket.revenue += revenue
      bucket.grossProfit += revenue - job.totalActual
      bucket.grossMarginPct =
        bucket.revenue > 0 ? bucket.grossProfit / bucket.revenue : null
    }
  }

  finalizeFinancialsPeriod(ytd)
  finalizeFinancialsPeriod(mtd)

  const openInvoices = qbInvoices.filter((inv) => inv.balance > 0)
  const arTotal = openInvoices.reduce((sum, inv) => sum + inv.balance, 0)

  const arAging: ArAgingBucket[] = [
    { label: '0–30 days', amount: 0, count: 0 },
    { label: '31–60 days', amount: 0, count: 0 },
    { label: '61–90 days', amount: 0, count: 0 },
    { label: '90+ days', amount: 0, count: 0 },
  ]

  let arAgingComplete = true
  for (const inv of openInvoices) {
    const txn = parseTxnDate(inv.txnDate)
    if (!txn) {
      arAgingComplete = false
      continue
    }
    const days = differenceInCalendarDays(now, txn)
    let bucketIndex = 3
    if (days <= 30) bucketIndex = 0
    else if (days <= 60) bucketIndex = 1
    else if (days <= 90) bucketIndex = 2
    arAging[bucketIndex].amount += inv.balance
    arAging[bucketIndex].count += 1
  }

  return {
    ytd,
    mtd,
    arTotal,
    arAging,
    arAgingComplete,
    monthlyTrend: monthBuckets,
    status: financialsStatus(ytd.grossMarginPct, ytd.jobCount),
  }
}

// ---------------------------------------------------------------------------
// Projected billings (schedule draws × contract value vs QB actuals + goal)
// ---------------------------------------------------------------------------

export interface ProjectedBillingsMonthRow {
  month: string
  label: string
  projected: number
  actual: number
  goal: number
  cumulativeBillings: number
  cumulativeGoal: number
}

export interface ProjectedBillingsMetrics {
  rows: ProjectedBillingsMonthRow[]
  billedYtd: number
  scheduledRestOfYear: number
  projectedYearEndTotal: number
  gapToGoal: number
  unpricedProjectCount: number
  /** Projects with scheduled billing draws but no contract total — excluded from the forecast. */
  unpricedProjects: { id: string; name: string }[]
  status: KpiStatus
}

type BillingPctParse =
  | { kind: 'percent'; pct: number }
  | { kind: 'remainder' }

function parseBillingDrawName(name: string): BillingPctParse | null {
  const trimmed = name.trim()
  if (!/^bill\b/i.test(trimmed)) return null
  const pctMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*%/)
  if (pctMatch) {
    const pct = Number(pctMatch[1])
    return Number.isFinite(pct) ? { kind: 'percent', pct } : null
  }
  if (/complete|final|remain|balance/i.test(trimmed)) return { kind: 'remainder' }
  return null
}

function projectedBillingsStatus(projectedVsGoalGap: number, annualGoal: number): KpiStatus {
  if (projectedVsGoalGap >= 0) return 'green'
  if (annualGoal <= 0) return 'yellow'
  const shortfallRatio = -projectedVsGoalGap / annualGoal
  if (shortfallRatio <= 0.1) return 'yellow'
  return 'red'
}

/**
 * Forecast scheduled billing draws against QB actuals and the flat monthly revenue goal.
 * Standalone (not wired into computeDashboardMetrics).
 */
export function computeProjectedBillings(
  projects: DrywallProjectListItem[],
  scheduleItems: CrossProjectScheduleItem[],
  qbInvoices: DashboardQbInvoiceInput[],
  targets: DashboardTargets,
  now = new Date(),
): ProjectedBillingsMetrics {
  const year = now.getFullYear()
  const currentMonthIndex = now.getMonth()
  const monthlyGoal = deriveRevenueGoals(targets).monthly
  const annualGoal = targets.annualRevenueGoal

  // Contract value for the forecast: finalized quote total when set, else the quote-derived
  // drywall scope revenue (available pre-order once a quote exists) — quotes rarely change,
  // and change orders/revisions update this. Only projects with neither are excluded.
  const quoteByProjectId = new Map(
    projects.map((p) => [p.id, p.quoteTotal ?? p.drywallScopeRevenue] as const),
  )
  const nameByProjectId = new Map(projects.map((p) => [p.id, p.name] as const))

  type Milestone = { projectId: string; startDate: Date; parse: BillingPctParse }
  const milestonesByProject = new Map<string, Milestone[]>()

  for (const item of scheduleItems) {
    const parse = parseBillingDrawName(item.name)
    if (!parse) continue
    const startDate = parseTxnDate(item.startDate)
    if (!startDate || startDate.getFullYear() !== year) continue
    const list = milestonesByProject.get(item.projectId) ?? []
    list.push({ projectId: item.projectId, startDate, parse })
    milestonesByProject.set(item.projectId, list)
  }

  const projectedByMonth = Array.from({ length: 12 }, () => 0)
  let projectedRestOfYear = 0
  const unpricedProjects: { id: string; name: string }[] = []

  for (const [projectId, milestones] of milestonesByProject) {
    const quoteTotal = quoteByProjectId.get(projectId)
    if (quoteTotal == null || quoteTotal <= 0) {
      unpricedProjects.push({ id: projectId, name: nameByProjectId.get(projectId) ?? projectId })
      continue
    }

    const sumPartials = milestones.reduce(
      (sum, m) => (m.parse.kind === 'percent' ? sum + m.parse.pct : sum),
      0,
    )
    const remainderCount = milestones.filter((m) => m.parse.kind === 'remainder').length
    const remainderPctEach =
      remainderCount > 0 ? Math.max(0, 100 - sumPartials) / remainderCount : 0

    for (const m of milestones) {
      const pct = m.parse.kind === 'percent' ? m.parse.pct : remainderPctEach
      const amount = (pct / 100) * quoteTotal
      const monthIndex = m.startDate.getMonth()
      projectedByMonth[monthIndex] += amount
      if (m.startDate.getTime() > now.getTime()) {
        projectedRestOfYear += amount
      }
    }
  }

  const actualByMonth = Array.from({ length: 12 }, () => 0)
  for (const inv of qbInvoices) {
    const txn = parseTxnDate(inv.txnDate)
    if (!txn || txn.getFullYear() !== year) continue
    actualByMonth[txn.getMonth()] += inv.totalAmt
  }

  const rows: ProjectedBillingsMonthRow[] = []
  let cumulativeBillings = 0
  let cumulativeGoal = 0
  for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
    const projected = projectedByMonth[monthIndex]
    const actual = actualByMonth[monthIndex]
    const goal = monthlyGoal
    cumulativeGoal += goal
    // Realistic running revenue: actual through current month, projected thereafter.
    cumulativeBillings += monthIndex <= currentMonthIndex ? actual : projected
    const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`
    rows.push({
      month: monthKey,
      label: MONTH_LABELS[monthIndex],
      projected,
      actual,
      goal,
      cumulativeBillings,
      cumulativeGoal,
    })
  }

  // Actual billed year-to-date (future months have no actuals). "Rest of year" is the
  // scheduled backlog dated after today — real revenue only, no unsold future work.
  const billedYtd = actualByMonth.reduce((sum, v) => sum + v, 0)
  const projectedYearEndTotal = billedYtd + projectedRestOfYear
  const gapToGoal = projectedYearEndTotal - annualGoal

  return {
    rows,
    billedYtd,
    scheduledRestOfYear: projectedRestOfYear,
    projectedYearEndTotal,
    gapToGoal,
    unpricedProjectCount: unpricedProjects.length,
    unpricedProjects,
    status: projectedBillingsStatus(gapToGoal, annualGoal),
  }
}

// ---------------------------------------------------------------------------
// Alerts — prioritized rules over already-computed dashboard metrics
// ---------------------------------------------------------------------------

export type DashboardAlertSeverity = 'critical' | 'warning' | 'info'

export interface DashboardAlert {
  id: string
  severity: DashboardAlertSeverity
  title: string
  detail: string
  href?: string
}

export interface DashboardAlertsExecution {
  jobs: DivisionExecutionJob[]
  laborPerformance: DivisionLaborPerformance
  accuracy: EstimatingAccuracy
}

export interface DashboardAlertsContext {
  projects: DrywallProjectListItem[]
  scheduleItems: CrossProjectScheduleItem[]
  qbInvoices: DashboardQbInvoiceInput[]
  targets: DashboardTargets
}

/** Soft floor for estimating hit-rate alerts (no target field on DashboardTargets yet). */
export const DEFAULT_ESTIMATING_HIT_RATE_TARGET = 0.35

const ALERT_SEVERITY_ORDER: Record<DashboardAlertSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

function severityFromKpi(status: KpiStatus): DashboardAlertSeverity | null {
  if (status === 'red') return 'critical'
  if (status === 'yellow') return 'warning'
  return null
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * Prioritized attention list derived from existing KPI Hub metrics + division execution.
 * Pure — no fetches. Call from AlertsSection with useDashboardData + useDivisionExecution.
 */
export function computeDashboardAlerts(
  metrics: DashboardMetrics,
  execution: DashboardAlertsExecution,
  context: DashboardAlertsContext,
  now = new Date(),
): DashboardAlert[] {
  const alerts: DashboardAlert[] = []
  const { revenuePace, northStar, capacity, manpower, backlog, estimating } = metrics

  // Revenue pace behind
  if (revenuePace.hasBillings) {
    const paceSeverity = severityFromKpi(revenuePace.status)
    if (paceSeverity) {
      alerts.push({
        id: 'revenue-pace-behind',
        severity: paceSeverity,
        title: 'Billings pace behind goal',
        detail: `Projected EOM ${formatDashboardCurrency(revenuePace.projectedEom)} vs goal ${formatDashboardCurrency(revenuePace.monthlyGoal)} · variance ${formatDashboardCurrency(revenuePace.variance)}`,
        href: '/drywall/settings/quickbooks',
      })
    }
  }

  // Behind annual goal (North Star)
  if (northStar.revenueGap < 0 && northStar.annualGoal > 0) {
    const nsSeverity = severityFromKpi(northStar.status)
    if (nsSeverity) {
      alerts.push({
        id: 'behind-annual-goal',
        severity: nsSeverity,
        title: `Behind annual goal by ${formatDashboardCurrency(Math.abs(northStar.revenueGap))}`,
        detail: `${formatDashboardPercent(northStar.pctOfRequired)} of required pace`,
      })
    }
  }

  // Capacity bottleneck
  {
    const capSeverity = severityFromKpi(capacity.status)
    if (capSeverity) {
      const trade = capacity.bottleneck === 'hanging' ? 'Hanging' : 'Finishing'
      alerts.push({
        id: 'capacity-bottleneck',
        severity: capSeverity,
        title: `${trade} is the constraint`,
        detail: northStar.biggestConstraint,
      })
    }
  }

  // Understaffed — each manpower role with a positive gap
  for (const row of [manpower.finishers, manpower.hangerCrews]) {
    if (row.gap <= 0) continue
    const large =
      row.gap >= 2 || (row.target > 0 && row.gap / row.target >= 0.5)
    const roleLabel = row.label.toLowerCase()
    alerts.push({
      id: `understaffed-${row.label.toLowerCase().replace(/\s+/g, '-')}`,
      severity: large ? 'critical' : 'warning',
      title: `Need ${row.gap} more ${roleLabel}`,
      detail: `${row.current} of ${row.target} target`,
    })
  }

  // Backlog thin
  {
    const thinByStatus = severityFromKpi(backlog.status)
    const thinByMonths =
      backlog.monthsRemaining != null && backlog.monthsRemaining < 2
    if (thinByStatus || thinByMonths) {
      const monthsLabel =
        backlog.monthsRemaining != null
          ? `${backlog.monthsRemaining.toFixed(1)} months`
          : 'limited months'
      alerts.push({
        id: 'backlog-thin',
        severity: thinByStatus ?? 'warning',
        title: `Backlog thin — ${monthsLabel} of approved work.`,
        detail: `Current ${formatDashboardCurrency(backlog.currentBacklog)} vs goal ${formatDashboardCurrency(backlog.goalBacklog)}`,
      })
    }
  }

  // AR aging 90+
  {
    const financials = computeFinancialsMetrics(execution.jobs, context.qbInvoices, now)
    const aging90 = financials.arAging.find((b) => b.label.startsWith('90'))
    if (aging90 && aging90.amount > 0) {
      alerts.push({
        id: 'ar-aging-90',
        severity: aging90.amount >= 25_000 ? 'critical' : 'warning',
        title: `${formatDashboardCurrency(aging90.amount)} in receivables 90+ days`,
        detail: `${aging90.count} open invoice${aging90.count === 1 ? '' : 's'}`,
        href: '/drywall/settings/quickbooks',
      })
    }
  }

  // Estimating hit rate below target
  {
    const hitRate = estimating.hitRateMonth ?? estimating.hitRateTrailing90
    if (hitRate != null && hitRate < DEFAULT_ESTIMATING_HIT_RATE_TARGET) {
      const pctPoints = Math.round((DEFAULT_ESTIMATING_HIT_RATE_TARGET - hitRate) * 100)
      alerts.push({
        id: 'hit-rate-below-target',
        severity: hitRate < DEFAULT_ESTIMATING_HIT_RATE_TARGET * 0.7 ? 'critical' : 'warning',
        title: `Hit rate ${pctPoints}% below target`,
        detail: `Current ${formatDashboardPercent(hitRate)} vs ${formatDashboardPercent(DEFAULT_ESTIMATING_HIT_RATE_TARGET)} target`,
      })
    }
  }

  // Jobs >15% off estimate
  {
    const offJobs = execution.jobs.filter((job) => {
      if (job.inProgress) return false
      const est = job.estMaterial + job.estLabor
      if (est <= 0) return false
      const actual = job.actualMaterial + job.actualLabor
      return Math.abs(actual - est) / est > 0.15
    })
    if (offJobs.length > 0) {
      alerts.push({
        id: 'jobs-off-estimate',
        severity: offJobs.length >= 3 ? 'critical' : 'warning',
        title: `${offJobs.length} job${offJobs.length === 1 ? '' : 's'} >15% off estimate.`,
        detail:
          execution.accuracy.mostOff.length > 0
            ? `Worst: ${execution.accuracy.mostOff[0].projectName}`
            : 'Review estimating accuracy',
        href: offJobs[0]
          ? `/drywall/projects/${offJobs[0].projectId}/production`
          : undefined,
      })
    }
  }

  // Data hygiene — unpriced projected billings
  {
    const pb = computeProjectedBillings(
      context.projects,
      context.scheduleItems,
      context.qbInvoices,
      context.targets,
      now,
    )
    if (pb.unpricedProjectCount > 0) {
      const names = pb.unpricedProjects
        .slice(0, 4)
        .map((p) => p.name)
        .join(', ')
      const more =
        pb.unpricedProjectCount > 4 ? ` (+${pb.unpricedProjectCount - 4} more)` : ''
      alerts.push({
        id: 'unpriced-billing-plan',
        severity: 'info',
        title: `${pb.unpricedProjectCount} job${pb.unpricedProjectCount === 1 ? '' : 's'} have a billing plan but no contract total: ${names}${more}`,
        detail: 'Excluded from projected billings until a quote/contract total exists',
        href: pb.unpricedProjects[0]
          ? `/drywall/projects/${pb.unpricedProjects[0].id}/info`
          : undefined,
      })
    }
  }

  // Data hygiene — many jobs completed "today" (pile-up / missing backdates)
  {
    const completedToday = execution.jobs.filter((job) => {
      if (!job.completedAt || job.inProgress) return false
      const d = parseCompletedAt(job.completedAt)
      return d != null && isSameCalendarDay(d, now)
    })
    if (completedToday.length >= 3) {
      alerts.push({
        id: 'completions-pile-today',
        severity: 'info',
        title: `${completedToday.length} jobs completed 'today' — backdate for accurate trends`,
        detail: 'Financials Gross Profit Trend buckets by completion date',
      })
    }
  }

  // Data hygiene — large unmapped labor
  {
    const unmapped = execution.laborPerformance.unmappedActual.total
    const actualLabor = execution.laborPerformance.totalActualLabor
    const large =
      unmapped >= 1_000 || (actualLabor > 0 && unmapped / actualLabor >= 0.05)
    if (unmapped > 0 && large) {
      alerts.push({
        id: 'unmapped-labor',
        severity: 'info',
        title: `Unattributed labor ${formatDashboardCurrency(unmapped)} — review payroll tagging.`,
        detail: 'Legacy / hourly / other buckets not mapped to hanger, finisher, components, or prep',
      })
    }
  }

  return alerts.sort(
    (a, b) => ALERT_SEVERITY_ORDER[a.severity] - ALERT_SEVERITY_ORDER[b.severity],
  )
}
