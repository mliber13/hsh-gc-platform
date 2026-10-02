import type { ComponentType } from 'react'
import { AlertsSection } from './AlertsSection'
import { BacklogSection } from './BacklogSection'
import { DivisionMarginSection } from './DivisionMarginSection'
import { EstimatingAccuracySection } from './EstimatingAccuracySection'
import { TakeoffAccuracySection } from './TakeoffAccuracySection'
import { FinancialsSection } from './FinancialsSection'
import { LaborPerformanceSection } from './LaborPerformanceSection'
import { EstimatingSection } from './EstimatingSection'
import { ManpowerSection } from './ManpowerSection'
import { ProductionCapacitySection } from './ProductionCapacitySection'
import { ProjectedBillingsSection } from './ProjectedBillingsSection'
import { RevenuePaceSection } from './RevenuePaceSection'
import type { SectionSummaryProps } from '../ui/KpiTile'
import {
  AlertsSummary,
  BacklogSummary,
  DivisionExecutionSummary,
  EstimatingAccuracySummary,
  EstimatingSummary,
  FinancialsSummary,
  LaborPerformanceSummary,
  ManpowerSummary,
  ProductionCapacitySummary,
  ProjectedBillingsSummary,
  RevenuePaceSummary,
  TakeoffAccuracySummary,
} from './summaries'

export type DashboardSectionGroup = 'alerts' | 'sales' | 'capacity' | 'execution' | 'financials'
export type DashboardSectionSpan = 'compact' | 'wide' | 'full'

export interface DashboardSectionDef {
  id: string
  title: string
  order: number
  group: DashboardSectionGroup
  span: DashboardSectionSpan
  component: ComponentType
  /**
   * The one-glance form shown in the hub grid and the chip strip. Required, so a new
   * section cannot be added that the overview has no way to represent.
   */
  summary: ComponentType<SectionSummaryProps>
  /** When false, the card sizes to its content instead of stretching to match
   *  taller cards in the same row (for lightweight summary cards). Default true. */
  stretch?: boolean
}

export const DASHBOARD_GROUP_ORDER: DashboardSectionGroup[] = [
  'alerts',
  'sales',
  'capacity',
  'execution',
  'financials',
]

export const DASHBOARD_GROUP_LABELS: Record<DashboardSectionGroup, string> = {
  alerts: 'Needs Attention',
  sales: 'Sales & Pace',
  capacity: 'Capacity & Crew',
  execution: 'Execution',
  financials: 'Financials',
}

export const DASHBOARD_SECTION_SPAN_CLASS: Record<DashboardSectionSpan, string> = {
  compact: '',
  wide: 'lg:col-span-2 xl:col-span-2',
  full: 'col-span-full',
}

/**
 * Add a future KPI section: create a component under sections/ and append one entry here.
 * DashboardPage maps over groups — no page rewrite required.
 */
export const DASHBOARD_SECTIONS: DashboardSectionDef[] = [
  {
    id: 'alerts',
    title: 'Alerts',
    order: 1,
    group: 'alerts',
    span: 'full',
    component: AlertsSection,
    summary: AlertsSummary,
  },
  {
    id: 'revenue-pace',
    title: 'Revenue Pace',
    order: 1,
    group: 'sales',
    span: 'compact',
    component: RevenuePaceSection,
    summary: RevenuePaceSummary,
  },
  {
    id: 'estimating',
    title: 'Estimating',
    order: 2,
    group: 'sales',
    span: 'wide',
    stretch: false,
    component: EstimatingSection,
    summary: EstimatingSummary,
  },
  {
    id: 'production-capacity',
    title: 'Production Capacity',
    order: 1,
    group: 'capacity',
    span: 'compact',
    component: ProductionCapacitySection,
    summary: ProductionCapacitySummary,
  },
  {
    id: 'manpower',
    title: 'Manpower',
    order: 2,
    group: 'capacity',
    span: 'compact',
    component: ManpowerSection,
    summary: ManpowerSummary,
  },
  {
    id: 'backlog',
    title: 'Backlog',
    order: 3,
    group: 'capacity',
    span: 'compact',
    component: BacklogSection,
    summary: BacklogSummary,
  },
  {
    id: 'division-execution',
    title: 'Division Execution',
    order: 1,
    group: 'execution',
    span: 'full',
    component: DivisionMarginSection,
    summary: DivisionExecutionSummary,
  },
  {
    id: 'labor-performance',
    title: 'Labor Performance',
    order: 2,
    group: 'execution',
    span: 'full',
    component: LaborPerformanceSection,
    summary: LaborPerformanceSummary,
  },
  {
    id: 'estimating-accuracy',
    title: 'Estimating Accuracy',
    order: 3,
    group: 'execution',
    span: 'full',
    component: EstimatingAccuracySection,
    summary: EstimatingAccuracySummary,
  },
  // Sits directly after Estimating Accuracy because it is the first thing to check when that
  // one goes red: a material overrun on a job that measured bigger than it was quoted is a
  // takeoff problem, not a buying problem.
  {
    id: 'takeoff-accuracy',
    title: 'Takeoff Accuracy',
    order: 4,
    group: 'execution',
    span: 'full',
    component: TakeoffAccuracySection,
    summary: TakeoffAccuracySummary,
  },
  {
    id: 'financials',
    title: 'Financials',
    order: 1,
    group: 'financials',
    span: 'full',
    component: FinancialsSection,
    summary: FinancialsSummary,
  },
  {
    id: 'projected-billings',
    title: 'Projected Billings',
    order: 2,
    group: 'financials',
    span: 'full',
    component: ProjectedBillingsSection,
    summary: ProjectedBillingsSummary,
  },
]

export function sectionsForGroup(group: DashboardSectionGroup): DashboardSectionDef[] {
  return DASHBOARD_SECTIONS.filter((section) => section.group === group).sort(
    (a, b) => a.order - b.order,
  )
}

/** Resolve a :sectionId route param. Returns undefined for an unknown id so the hub can fall back to the overview. */
export function sectionById(id: string | undefined): DashboardSectionDef | undefined {
  if (!id) return undefined
  return DASHBOARD_SECTIONS.find((section) => section.id === id)
}

/** Every section in group order then section order — the order the chip strip reads in. */
export function allSectionsInOrder(): DashboardSectionDef[] {
  return DASHBOARD_GROUP_ORDER.flatMap((group) => sectionsForGroup(group))
}
