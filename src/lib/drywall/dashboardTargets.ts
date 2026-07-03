export interface DashboardCapacityTargets {
  hangerCrewSqftPerDay: number
  finisherSqftPerDay: number
  finisherApprenticeSqftPerDay: number
  hangersPerCrew: number
  revenuePerSqftOverride: number | null
}

export interface DashboardManpowerTargets {
  finishers: number
  hangerCrews: number
}

export interface DashboardTargets {
  annualRevenueGoal: number
  backlogGoal: number
  workingDaysPerMonth: number
  /** $ awarded this calendar year on jobs not tracked as HSH quotes. */
  offSystemAwardedYtd: number
  /** Calendar year offSystemAwardedYtd applies to; null = current year. */
  offSystemAwardedYtdYear: number | null
  capacity: DashboardCapacityTargets
  manpowerTargets: DashboardManpowerTargets
}

export const DEFAULT_DASHBOARD_TARGETS: DashboardTargets = {
  annualRevenueGoal: 6_500_000,
  backlogGoal: 1_250_000,
  workingDaysPerMonth: 21,
  offSystemAwardedYtd: 0,
  offSystemAwardedYtdYear: null,
  capacity: {
    hangerCrewSqftPerDay: 4800,
    finisherSqftPerDay: 2400,
    finisherApprenticeSqftPerDay: 1200,
    hangersPerCrew: 3,
    revenuePerSqftOverride: null,
  },
  manpowerTargets: {
    finishers: 8,
    hangerCrews: 2,
  },
}

function toNum(v: unknown, fallback: number): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : fallback
}

function toNullableNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return Number.isFinite(n) ? n : null
}

export function parseDashboardTargets(raw: unknown): DashboardTargets {
  const d = DEFAULT_DASHBOARD_TARGETS
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d
  const o = raw as Record<string, unknown>
  const cap =
    o.capacity && typeof o.capacity === 'object' && !Array.isArray(o.capacity)
      ? (o.capacity as Record<string, unknown>)
      : {}
  const mp =
    o.manpowerTargets &&
    typeof o.manpowerTargets === 'object' &&
    !Array.isArray(o.manpowerTargets)
      ? (o.manpowerTargets as Record<string, unknown>)
      : {}

  return {
    annualRevenueGoal: toNum(o.annualRevenueGoal, d.annualRevenueGoal),
    backlogGoal: toNum(o.backlogGoal, d.backlogGoal),
    workingDaysPerMonth: toNum(o.workingDaysPerMonth, d.workingDaysPerMonth),
    offSystemAwardedYtd: toNum(o.offSystemAwardedYtd, d.offSystemAwardedYtd),
    offSystemAwardedYtdYear: toNullableNum(o.offSystemAwardedYtdYear),
    capacity: {
      hangerCrewSqftPerDay: toNum(cap.hangerCrewSqftPerDay, d.capacity.hangerCrewSqftPerDay),
      finisherSqftPerDay: toNum(cap.finisherSqftPerDay, d.capacity.finisherSqftPerDay),
      finisherApprenticeSqftPerDay: toNum(
        cap.finisherApprenticeSqftPerDay,
        d.capacity.finisherApprenticeSqftPerDay,
      ),
      hangersPerCrew: toNum(cap.hangersPerCrew, d.capacity.hangersPerCrew),
      revenuePerSqftOverride: toNullableNum(cap.revenuePerSqftOverride),
    },
    manpowerTargets: {
      finishers: toNum(mp.finishers, d.manpowerTargets.finishers),
      hangerCrews: toNum(mp.hangerCrews, d.manpowerTargets.hangerCrews),
    },
  }
}
