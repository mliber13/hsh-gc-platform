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
  /** Subcontractor/vendor who provided this rate (e.g. Tapco) */
  rateSourceName?: string | null
  /** Date the rate was provided or last updated */
  rateSourceDate?: string | null
  /** Optional notes (e.g. Per email; includes XYZ) */
  rateSourceNotes?: string | null
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
  rateSourceName?: string | null
  rateSourceDate?: string | null
  rateSourceNotes?: string | null
}

