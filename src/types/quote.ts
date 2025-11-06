// ============================================================================
// Quote Request & Submission Types
// ============================================================================

export type QuoteRequestStatus = 'sent' | 'viewed' | 'submitted' | 'expired'
export type SubmittedQuoteStatus = 'pending' | 'accepted' | 'rejected' | 'waiting-for-more' | 'revision-requested'

// ----------------------------------------------------------------------------
// Quote Request Line Item (for structured entry)
// ----------------------------------------------------------------------------

export interface QuoteLineItem {
  description: string
  quantity: number
  unit: string
  price: number
  notes?: string
}

// ----------------------------------------------------------------------------
// Quote Request
// ----------------------------------------------------------------------------

export interface QuoteRequest {
  id: string
  userId: string
  organizationId?: string
  projectId: string
  tradeId?: string | null
  
  // Vendor information
  vendorEmail: string
  vendorName?: string
  
  // Request details
  token: string
  scopeOfWork: string
  drawingsUrl?: string
  projectInfo?: {
    projectName: string
    address?: string
    specs?: {
      livingSquareFootage?: number
      bedrooms?: number
      bathrooms?: number
      foundationType?: string
      roofType?: string
      // Other relevant specs
    }
  }
  
  // Status tracking
  status: QuoteRequestStatus
  dueDate?: Date
  
  // Metadata
  sentAt: Date
  viewedAt?: Date
  expiresAt?: Date
  
  createdAt: Date
  updatedAt: Date
}

// ----------------------------------------------------------------------------
// Create Quote Request Input
// ----------------------------------------------------------------------------

export interface CreateQuoteRequestInput {
  projectId: string
  tradeId?: string
  vendorEmails: string[] // Support multiple vendors
  vendorNames?: string[]
  scopeOfWork: string
  drawingsFile?: File // Will be uploaded to storage
  projectInfo?: QuoteRequest['projectInfo']
  dueDate?: Date
  expiresInDays?: number // Default 30
}

// ----------------------------------------------------------------------------
// Submitted Quote
// ----------------------------------------------------------------------------

export interface SubmittedQuote {
  id: string
  quoteRequestId: string
  
  // Vendor information
  vendorName: string
  vendorEmail: string
  vendorCompany?: string
  vendorPhone?: string
  
  // Quote details
  lineItems: QuoteLineItem[]
  totalAmount: number
  validUntil?: Date
  notes?: string
  quoteDocumentUrl?: string // Vendor's uploaded document
  
  // Status
  status: SubmittedQuoteStatus
  reviewedBy?: string
  reviewedAt?: Date
  reviewNotes?: string
  
  // Assignment
  assignedTradeId?: string | null
  assignedBy?: string
  assignedAt?: Date
  
  submittedAt: Date
  createdAt: Date
  updatedAt: Date
}

// ----------------------------------------------------------------------------
// Submit Quote Input (from vendor)
// ----------------------------------------------------------------------------

export interface SubmitQuoteInput {
  token: string // Quote request token
  vendorName: string
  vendorEmail: string
  vendorCompany?: string
  vendorPhone?: string
  lineItems: QuoteLineItem[]
  totalAmount: number
  validUntil?: Date
  notes?: string
  quoteDocument?: File // Vendor's own quote document
}

// ----------------------------------------------------------------------------
// Update Quote Status Input
// ----------------------------------------------------------------------------

export interface UpdateQuoteStatusInput {
  quoteId: string
  status: SubmittedQuoteStatus
  reviewNotes?: string
  assignedTradeId?: string
}

// ----------------------------------------------------------------------------
// Quote Request with Submitted Quote
// ----------------------------------------------------------------------------

export interface QuoteRequestWithQuote extends QuoteRequest {
  submittedQuote?: SubmittedQuote
}

