// ============================================================================
// Item Template Types
// ============================================================================
//
// Types for managing default item templates and rates
//

import { TradeCategory, CategoryGroup, UnitType } from './index'

// Lightweight sub-item shape for item templates (no ids or trade links)
export interface ItemSubItemTemplate {
  name: string
  description?: string
  quantity: number
  unit: UnitType
  laborRate?: number
  materialRate?: number
  subcontractorRate?: number
  laborCost?: number
  materialCost?: number
  subcontractorCost?: number
  isSubcontracted?: boolean
  wasteFactor?: number
  markupPercent?: number
  sortOrder?: number
}

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
  /** Optional default sub-items (e.g. material + labor breakdown) */
  defaultSubItems?: ItemSubItemTemplate[]
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
  /** Optional default sub-items (e.g. material + labor breakdown) */
  defaultSubItems?: ItemSubItemTemplate[]
  rateSourceName?: string | null
  rateSourceDate?: string | null
  rateSourceNotes?: string | null
}

