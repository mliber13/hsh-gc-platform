// ============================================================================
// Selection Schedule Types
// ============================================================================

export type SelectionScheduleType =
  | 'interior-paint'
  | 'exterior-finishes'
  | 'flooring'
  | 'tiling'
  | 'lighting-electrical'
  | 'cabinetry-millwork'
  | 'countertops-slab'
  | 'plumbing-fixtures-hardware'
  | 'doors-windows-trim'
  | 'appliances'
  | 'other'

export type SelectionScheduleSourceType = 'trade' | 'sub-item'

export type SelectionScheduleRowStatus = 'flagged' | 'scheduled' | 'approved'

export interface SelectionScheduleRow {
  id: string
  scheduleType: SelectionScheduleType
  roomAreaType: 'room' | 'whole-home' | 'exterior' | 'site' | 'custom'
  roomAreaLabel?: string
  sourceType: SelectionScheduleSourceType
  sourceId: string
  sourceName: string
  itemName: string
  productName?: string
  specFinish?: string
  quantity?: number
  quantityUnit?: string
  supplierLink?: string
  leadTime?: string
  notes?: string
  /** Display URL (signed URL or external https link) */
  imageUrl?: string
  /** Storage path in `selection-images` when uploaded from the app (for replace/remove) */
  imageStoragePath?: string
  status: SelectionScheduleRowStatus
}

export interface SelectionScheduleDocument {
  projectName?: string
  preparedDate?: string
  versionLabel?: string
  rows: SelectionScheduleRow[]
}

export interface SelectionScheduleVersion {
  id: string
  projectId: string
  organizationId: string
  versionNumber: number
  versionLabel?: string
  isDraft: boolean
  data: SelectionScheduleDocument
  createdAt: string
  updatedAt: string
  createdBy?: string
}
