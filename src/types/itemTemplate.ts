// ============================================================================
// Item Template Types
// ============================================================================
//
// Types for managing default item templates and rates
//

import { TradeCategory, UnitType } from './index'

export interface ItemTemplate {
  id: string
  category: TradeCategory
  name: string
  description?: string
  defaultUnit: UnitType
  defaultMaterialRate?: number
  defaultLaborRate?: number
  defaultSubcontractorCost?: number
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
  defaultSubcontractorCost?: number
  isSubcontracted: boolean
  defaultWasteFactor?: number
  notes?: string
}

