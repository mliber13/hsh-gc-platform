import type { ComponentType } from 'react'
import { BacklogSection } from './BacklogSection'
import { EstimatingSection } from './EstimatingSection'
import { ManpowerSection } from './ManpowerSection'
import { ProductionCapacitySection } from './ProductionCapacitySection'
import { RevenuePaceSection } from './RevenuePaceSection'

export interface DashboardSectionDef {
  id: string
  title: string
  order: number
  component: ComponentType
}

/**
 * Add a future KPI section: create a component under sections/ and append one entry here.
 * DashboardPage maps over this array — no page rewrite required.
 */
export const DASHBOARD_SECTIONS: DashboardSectionDef[] = [
  {
    id: 'revenue-pace',
    title: 'Revenue Pace',
    order: 1,
    component: RevenuePaceSection,
  },
  {
    id: 'production-capacity',
    title: 'Production Capacity',
    order: 2,
    component: ProductionCapacitySection,
  },
  {
    id: 'manpower',
    title: 'Manpower',
    order: 3,
    component: ManpowerSection,
  },
  {
    id: 'backlog',
    title: 'Backlog',
    order: 4,
    component: BacklogSection,
  },
  {
    id: 'estimating',
    title: 'Estimating',
    order: 5,
    component: EstimatingSection,
  },
].sort((a, b) => a.order - b.order)
