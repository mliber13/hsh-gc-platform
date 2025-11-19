// ============================================================================
// Quote Service
// ============================================================================
//
// Service for managing quote requests and submitted quotes
//

import { v4 as uuidv4 } from 'uuid'
import {
  QuoteRequest,
  SubmittedQuote,
  CreateQuoteRequestInput,
  SubmitQuoteInput,
  UpdateQuoteStatusInput,
  QuoteRequestWithQuote,
} from '@/types/quote'
import { supabase, isOnlineMode } from '@/lib/supabase'

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a secure token for quote request access
 */
function generateSecureToken(): string {
  // Generate a cryptographically secure random token
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Calculate expiration date
 */
function calculateExpirationDate(days: number = 30): Date {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date
}

// ============================================================================
// QUOTE REQUEST OPERATIONS
// ============================================================================

/**
 * Create a quote request (localStorage version)
 */
export function createQuoteRequestLS(input: CreateQuoteRequestInput): QuoteRequest[] {
  const now = new Date()
  const expiresAt = calculateExpirationDate(input.expiresInDays || 30)
  
  // Create one request per vendor email
  const requests: QuoteRequest[] = input.vendorEmails.map((email, index) => {
    const token = generateSecureToken()
    const request: QuoteRequest = {
      id: uuidv4(),
      userId: '', // Will be set by caller
      projectId: input.projectId,
      tradeId: input.tradeId,
      vendorEmail: email,
      vendorName: input.vendorNames?.[index],
      token,
      scopeOfWork: input.scopeOfWork,
      drawingsUrl: input.drawingsFile ? `pending-upload-${token}` : undefined,
      projectInfo: input.projectInfo,
      status: 'sent',
      dueDate: input.dueDate,
      sentAt: now,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    }
    
    // Save to localStorage
    const storageKey = `quote_requests_${request.id}`
    localStorage.setItem(storageKey, JSON.stringify(request))
    
    return request
  })
  
  return requests
}

/**
 * Create quote request in database
 */
export async function createQuoteRequestInDB(input: CreateQuoteRequestInput): Promise<QuoteRequest[]> {
  if (!isOnlineMode()) return []

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // Get user's organization
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()

  if (!profile) {
    console.error('User profile not found')
    return []
  }

  // Validate organization_id - must be a valid UUID or null
  const organizationId = profile.organization_id && 
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(profile.organization_id)
    ? profile.organization_id
    : null

  const expiresAt = calculateExpirationDate(input.expiresInDays || 30)
  const requests: QuoteRequest[] = []

  // Create one request per vendor email
  for (let i = 0; i < input.vendorEmails.length; i++) {
    const email = input.vendorEmails[i]
    const token = generateSecureToken()
    
    // Upload drawings if provided
    let drawingsUrl: string | undefined
    if (input.drawingsFile) {
      const fileExt = input.drawingsFile.name.split('.').pop()
      const fileName = `quote-drawings-${token}.${fileExt}`
      // Use organization_id if valid, otherwise use user_id for file path
      const orgPath = organizationId || user.id
      const filePath = `${orgPath}/${input.projectId}/${fileName}`
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('quote-documents')
        .upload(filePath, input.drawingsFile, {
          cacheControl: '3600',
          upsert: false
        })
      
      if (!uploadError && uploadData) {
        const { data: { publicUrl } } = supabase.storage
          .from('quote-documents')
          .getPublicUrl(filePath)
        drawingsUrl = publicUrl
      }
    }

    const { data, error } = await supabase
      .from('quote_requests')
      .insert({
        user_id: user.id,
        organization_id: organizationId,
        project_id: input.projectId,
        trade_id: input.tradeId || null,
        vendor_email: email,
        vendor_name: input.vendorNames?.[i] || null,
        token,
        scope_of_work: input.scopeOfWork,
        drawings_url: drawingsUrl || null,
        project_info: input.projectInfo || null,
        status: 'sent',
        due_date: input.dueDate?.toISOString() || null,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating quote request:', error)
      continue
    }

    requests.push({
      id: data.id,
      userId: data.user_id,
      organizationId: data.organization_id,
      projectId: data.project_id,
      tradeId: data.trade_id,
      vendorEmail: data.vendor_email,
      vendorName: data.vendor_name,
      token: data.token,
      scopeOfWork: data.scope_of_work,
      drawingsUrl: data.drawings_url,
      projectInfo: data.project_info,
      status: data.status,
      dueDate: data.due_date ? new Date(data.due_date) : undefined,
      sentAt: new Date(data.sent_at),
      viewedAt: data.viewed_at ? new Date(data.viewed_at) : undefined,
      expiresAt: new Date(data.expires_at),
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    })
  }

  return requests
}

/**
 * Fetch quote request by token (for vendor portal)
 */
export async function fetchQuoteRequestByToken(token: string): Promise<QuoteRequest | null> {
  if (!isOnlineMode()) return null

  const { data, error } = await supabase
    .from('quote_requests')
    .select('*')
    .eq('token', token)
    .single()

  if (error || !data) {
    console.error('Error fetching quote request:', error)
    return null
  }

  // Update viewed_at if not already set
  if (!data.viewed_at) {
    await supabase
      .from('quote_requests')
      .update({ viewed_at: new Date().toISOString(), status: 'viewed' })
      .eq('id', data.id)
  }

  return {
    id: data.id,
    userId: data.user_id,
    organizationId: data.organization_id,
    projectId: data.project_id,
    tradeId: data.trade_id,
    vendorEmail: data.vendor_email,
    vendorName: data.vendor_name,
    token: data.token,
    scopeOfWork: data.scope_of_work,
    drawingsUrl: data.drawings_url,
    projectInfo: data.project_info,
    status: data.viewed_at ? 'viewed' : 'sent',
    dueDate: data.due_date ? new Date(data.due_date) : undefined,
    sentAt: new Date(data.sent_at),
    viewedAt: data.viewed_at ? new Date(data.viewed_at) : undefined,
    expiresAt: new Date(data.expires_at),
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  }
}

/**
 * Fetch all quote requests for a project
 */
export async function fetchQuoteRequestsForProject(projectId: string): Promise<QuoteRequest[]> {
  if (!isOnlineMode()) return []

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('quote_requests')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching quote requests:', error)
    return []
  }

  return data.map(row => ({
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    tradeId: row.trade_id,
    vendorEmail: row.vendor_email,
    vendorName: row.vendor_name,
    token: row.token,
    scopeOfWork: row.scope_of_work,
    drawingsUrl: row.drawings_url,
    projectInfo: row.project_info,
    status: row.status,
    dueDate: row.due_date ? new Date(row.due_date) : undefined,
    sentAt: new Date(row.sent_at),
    viewedAt: row.viewed_at ? new Date(row.viewed_at) : undefined,
    expiresAt: new Date(row.expires_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }))
}

/**
 * Delete a quote request
 */
export async function deleteQuoteRequest(quoteRequestId: string): Promise<boolean> {
  if (!isOnlineMode()) return false

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  // First check if user owns this quote request
  const { data: request, error: fetchError } = await supabase
    .from('quote_requests')
    .select('id, user_id')
    .eq('id', quoteRequestId)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !request) {
    console.error('Error fetching quote request for deletion:', fetchError)
    return false
  }

  // Delete the quote request (cascade will handle submitted quotes if configured)
  const { error } = await supabase
    .from('quote_requests')
    .delete()
    .eq('id', quoteRequestId)

  if (error) {
    console.error('Error deleting quote request:', error)
    return false
  }

  return true
}

/**
 * Resend a quote request email
 */
export async function resendQuoteRequestEmail(quoteRequest: QuoteRequest, projectName: string, tradeName?: string): Promise<boolean> {
  if (!isOnlineMode()) return false

  // Import here to avoid circular dependency
  const { sendQuoteRequestEmail } = await import('./emailService')

  // Generate the quote link
  const quoteLink = `${window.location.origin}/quote/${quoteRequest.token}`

  // Send the email
  const emailSent = await sendQuoteRequestEmail({
    to: quoteRequest.vendorEmail,
    vendorName: quoteRequest.vendorName,
    projectName,
    tradeName,
    quoteLink,
    scopeOfWork: quoteRequest.scopeOfWork,
    dueDate: quoteRequest.dueDate || null,
    expiresAt: quoteRequest.expiresAt || null,
  })

  if (emailSent) {
    // Update sent_at timestamp
    const { error } = await supabase
      .from('quote_requests')
      .update({ 
        sent_at: new Date().toISOString(),
        status: 'sent',
        updated_at: new Date().toISOString()
      })
      .eq('id', quoteRequest.id)

    if (error) {
      console.error('Error updating quote request sent_at:', error)
      // Email was sent but update failed - still return true
      return true
    }
  }

  return emailSent
}

// ============================================================================
// SUBMITTED QUOTE OPERATIONS
// ============================================================================

/**
 * Submit a quote (vendor side)
 */
export async function submitQuote(input: SubmitQuoteInput): Promise<SubmittedQuote | null> {
  if (!isOnlineMode()) return null

  // First, verify the token and get the quote request
  const quoteRequest = await fetchQuoteRequestByToken(input.token)
  if (!quoteRequest) {
    console.error('Invalid quote request token')
    return null
  }

  // Upload quote document if provided
  let quoteDocumentUrl: string | undefined
  if (input.quoteDocument) {
    const quoteRequestData = await supabase
      .from('quote_requests')
      .select('organization_id, project_id, user_id')
      .eq('token', input.token)
      .single()

    if (quoteRequestData.data) {
      const fileExt = input.quoteDocument.name.split('.').pop()
      const fileName = `quote-${quoteRequest.id}-${Date.now()}.${fileExt}`
      // Use organization_id if valid UUID, otherwise use user_id
      const orgId = quoteRequestData.data.organization_id && 
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quoteRequestData.data.organization_id)
        ? quoteRequestData.data.organization_id
        : quoteRequestData.data.user_id
      const filePath = `${orgId}/${quoteRequestData.data.project_id}/${fileName}`
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('quote-documents')
        .upload(filePath, input.quoteDocument, {
          cacheControl: '3600',
          upsert: false
        })
      
      if (!uploadError && uploadData) {
        const { data: { publicUrl } } = supabase.storage
          .from('quote-documents')
          .getPublicUrl(filePath)
        quoteDocumentUrl = publicUrl
      }
    }
  }

  // Create submitted quote
  const { data, error } = await supabase
    .from('submitted_quotes')
    .insert({
      quote_request_id: quoteRequest.id,
      vendor_name: input.vendorName,
      vendor_email: input.vendorEmail,
      vendor_company: input.vendorCompany || null,
      vendor_phone: input.vendorPhone || null,
      line_items: input.lineItems,
      total_amount: input.totalAmount,
      valid_until: input.validUntil?.toISOString() || null,
      notes: input.notes || null,
      quote_document_url: quoteDocumentUrl || null,
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    console.error('Error submitting quote:', error)
    return null
  }

  // Update quote request status
  await supabase
    .from('quote_requests')
    .update({ status: 'submitted' })
    .eq('id', quoteRequest.id)

  return {
    id: data.id,
    quoteRequestId: data.quote_request_id,
    vendorName: data.vendor_name,
    vendorEmail: data.vendor_email,
    vendorCompany: data.vendor_company,
    vendorPhone: data.vendor_phone,
    lineItems: data.line_items,
    totalAmount: parseFloat(data.total_amount),
    validUntil: data.valid_until ? new Date(data.valid_until) : undefined,
    notes: data.notes,
    quoteDocumentUrl: data.quote_document_url,
    status: data.status,
    reviewedBy: data.reviewed_by,
    reviewedAt: data.reviewed_at ? new Date(data.reviewed_at) : undefined,
    reviewNotes: data.review_notes,
    assignedTradeId: data.assigned_trade_id,
    assignedBy: data.assigned_by,
    assignedAt: data.assigned_at ? new Date(data.assigned_at) : undefined,
    submittedAt: new Date(data.submitted_at),
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  }
}

/**
 * Fetch submitted quotes for a quote request
 */
export async function fetchSubmittedQuotesForRequest(quoteRequestId: string): Promise<SubmittedQuote[]> {
  if (!isOnlineMode()) return []

  const { data, error } = await supabase
    .from('submitted_quotes')
    .select('*')
    .eq('quote_request_id', quoteRequestId)
    .order('submitted_at', { ascending: false })

  if (error) {
    console.error('Error fetching submitted quotes:', error)
    return []
  }

  return data.map(row => ({
    id: row.id,
    quoteRequestId: row.quote_request_id,
    vendorName: row.vendor_name,
    vendorEmail: row.vendor_email,
    vendorCompany: row.vendor_company,
    vendorPhone: row.vendor_phone,
    lineItems: row.line_items,
    totalAmount: parseFloat(row.total_amount),
    validUntil: row.valid_until ? new Date(row.valid_until) : undefined,
    notes: row.notes,
    quoteDocumentUrl: row.quote_document_url,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at) : undefined,
    reviewNotes: row.review_notes,
    assignedTradeId: row.assigned_trade_id,
    assignedBy: row.assigned_by,
    assignedAt: row.assigned_at ? new Date(row.assigned_at) : undefined,
    submittedAt: new Date(row.submitted_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }))
}

/**
 * Update quote status
 */
export async function updateQuoteStatus(input: UpdateQuoteStatusInput): Promise<SubmittedQuote | null> {
  if (!isOnlineMode()) return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const updateData: any = {
    status: input.status,
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  }

  if (input.reviewNotes) {
    updateData.review_notes = input.reviewNotes
  }

  if (input.assignedTradeId) {
    updateData.assigned_trade_id = input.assignedTradeId
    updateData.assigned_by = user.id
    updateData.assigned_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('submitted_quotes')
    .update(updateData)
    .eq('id', input.quoteId)
    .select()
    .single()

  if (error) {
    console.error('Error updating quote status:', error)
    return null
  }

  return {
    id: data.id,
    quoteRequestId: data.quote_request_id,
    vendorName: data.vendor_name,
    vendorEmail: data.vendor_email,
    vendorCompany: data.vendor_company,
    vendorPhone: data.vendor_phone,
    lineItems: data.line_items,
    totalAmount: parseFloat(data.total_amount),
    validUntil: data.valid_until ? new Date(data.valid_until) : undefined,
    notes: data.notes,
    quoteDocumentUrl: data.quote_document_url,
    status: data.status,
    reviewedBy: data.reviewed_by,
    reviewedAt: data.reviewed_at ? new Date(data.reviewed_at) : undefined,
    reviewNotes: data.review_notes,
    assignedTradeId: data.assigned_trade_id,
    assignedBy: data.assigned_by,
    assignedAt: data.assigned_at ? new Date(data.assigned_at) : undefined,
    submittedAt: new Date(data.submitted_at),
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  }
}

