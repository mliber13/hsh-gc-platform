import type { ComponentType } from 'react'
import { AlertsSection } from './AlertsSection'
import { BacklogSection } from './BacklogSection'
import { DivisionMarginSection } from './DivisionMarginSection'
import { EstimatingAccuracySection } from './EstimatingAccuracySection'
import { FinancialsSection } from './FinancialsSection'
import { LaborPerformanceSection } from './LaborPerformanceSection'
import { EstimatingSection } from './EstimatingSection'
import { ManpowerSection } from './ManpowerSection'
import { ProductionCapacitySection } from './ProductionCapacitySection'
import { ProjectedBillingsSection } from './ProjectedBillingsSection'
import { RevenuePaceSection } from './RevenuePaceSection'

export type DashboardSectionGroup = 'alerts' | 'sales' | 'capacity' | 'execution' | 'financials'
export type DashboardSectionSpan = 'compact' | 'wide' | 'full'

export interface DashboardSectionDef {
  id: string
  title: string
  order: number
  group: DashboardSectionGroup
  span: DashboardSectionSpan
  component: ComponentType
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
  },
  {
    id: 'revenue-pace',
    title: 'Revenue Pace',
    order: 1,
    group: 'sales',
    span: 'compact',
    component: RevenuePaceSection,
  },
  {
    id: 'estimating',
    title: 'Estimating',
    order: 2,
    group: 'sales',
    span: 'wide',
    stretch: false,
    component: EstimatingSection,
  },
  {
    id: 'production-capacity',
    title: 'Production Capacity',
    order: 1,
    group: 'capacity',
    span: 'compact',
    component: ProductionCapacitySection,
  },
  {
    id: 'manpower',
    title: 'Manpower',
    order: 2,
    group: 'capacity',
    span: 'compact',
    component: ManpowerSection,
  },
  {
    id: 'backlog',
    title: 'Backlog',
    order: 3,
    group: 'capacity',
    span: 'compact',
    component: BacklogSection,
  },
  {
    id: 'division-execution',
    title: 'Division Execution',
    order: 1,
    group: 'execution',
    span: 'full',
    component: DivisionMarginSection,
  },
  {
    id: 'labor-performance',
    title: 'Labor Performance',
    order: 2,
    group: 'execution',
    span: 'full',
    component: LaborPerformanceSection,
  },
  {
    id: 'estimating-accuracy',
    title: 'Estimating Accuracy',
    order: 3,
    group: 'execution',
    span: 'full',
    component: EstimatingAccuracySection,
  },
  {
    id: 'financials',
    title: 'Financials',
    order: 1,
    group: 'financials',
    span: 'full',
    component: FinancialsSection,
  },
  {
    id: 'projected-billings',
    title: 'Projected Billings',
    order: 2,
    group: 'financials',
    span: 'full',
    component: ProjectedBillingsSection,
  },
]

export function sectionsForGroup(group: DashboardSectionGroup): DashboardSectionDef[] {
  return DASHBOARD_SECTIONS.filter((section) => section.group === group).sort(
    (a, b) => a.order - b.order,
  )
}
