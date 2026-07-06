import type { ComponentType } from 'react'
import { BacklogSection } from './BacklogSection'
import { DivisionMarginSection } from './DivisionMarginSection'
import { EstimatingSection } from './EstimatingSection'
import { ManpowerSection } from './ManpowerSection'
import { ProductionCapacitySection } from './ProductionCapacitySection'
import { RevenuePaceSection } from './RevenuePaceSection'

export type DashboardSectionGroup = 'sales' | 'capacity' | 'execution'
export type DashboardSectionSpan = 'compact' | 'wide' | 'full'

export interface DashboardSectionDef {
  id: string
  title: string
  order: number
  group: DashboardSectionGroup
  span: DashboardSectionSpan
  component: ComponentType
}

export const DASHBOARD_GROUP_ORDER: DashboardSectionGroup[] = ['sales', 'capacity', 'execution']

export const DASHBOARD_GROUP_LABELS: Record<DashboardSectionGroup, string> = {
  sales: 'Sales & Pace',
  capacity: 'Capacity & Crew',
  execution: 'Execution',
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
]

export function sectionsForGroup(group: DashboardSectionGroup): DashboardSectionDef[] {
  return DASHBOARD_SECTIONS.filter((section) => section.group === group).sort(
    (a, b) => a.order - b.order,
  )
}
