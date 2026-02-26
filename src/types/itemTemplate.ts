// ============================================================================
// Item Template Types
// ============================================================================
//
// Types for managing default item templates and rates
//

import { TradeCategory, CategoryGroup, UnitType } from './index'

export interface ItemTemplate {
  id: string
  category: TradeCategory
  group?: CategoryGroup     // High-level grouping for rollup reporting
  name: string
  description?: string
  defaultUnit: UnitType
  defaultMaterialRate?: number
  defaultLaborRate?: number
  defaultSubcontractorRate?: number   // Per-unit cost (like material/labor)
  defaultSubcontractorCost?: number  // Lump sum (optional)
  isSubcontracted: boolean
  defaultWasteFactor?: number
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export interface ItemTemplateInput {
  category: TradeCategory
  name: string
  description?: string
  defaultUnit: UnitType
  defaultMaterialRate?: number
  defaultLaborRate?: number
  defaultSubcontractorRate?: number
  defaultSubcontractorCost?: number
  isSubcontracted: boolean
  defaultWasteFactor?: number
  notes?: string
}

