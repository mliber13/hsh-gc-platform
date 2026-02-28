// ============================================================================
// Trade categories (DB-backed; system = locked, custom = editable in-app)
// ============================================================================

export interface TradeCategoryRecord {
  id: string
  key: string
  label: string
  icon: string
  sortOrder: number
  isSystem: boolean
  createdAt?: Date
  updatedAt?: Date
}

export interface TradeCategoryInput {
  key: string
  label: string
  icon?: string
  sortOrder?: number
}

// Category display: labels only. Visual pop via @/lib/categoryAccent (left border color per category key).
