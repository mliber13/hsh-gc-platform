// ============================================================================
// Purchase Order Types (Option A: snapshot estimate lines, assign to sub)
// ============================================================================

export type POStatus = 'draft' | 'issued'

export interface POHeader {
  id: string
  projectId: string
  subcontractorId: string
  poNumber: string | null
  status: POStatus
  issuedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface POLine {
  id: string
  poId: string
  sortOrder: number
  description: string
  quantity: number
  unit: string
  unitPrice: number
  amount: number
  sourceTradeId: string | null
  sourceSubItemId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface POHeaderWithLines extends POHeader {
  lines: POLine[]
}

/** Input when creating a PO from selected estimate lines */
export interface CreatePOInput {
  projectId: string
  subcontractorId: string
  /** Snapshot of lines (from estimate); amount = subcontractor cost per line */
  lines: {
    description: string
    quantity: number
    unit: string
    unitPrice: number
    amount: number
    sourceTradeId?: string | null
    sourceSubItemId?: string | null
  }[]
}

/** Input when issuing a PO (set number and date) */
export interface IssuePOInput {
  poNumber: string
  issuedAt: Date
}
