// ============================================================================
// Quote Review Dashboard
// ============================================================================
//
// Dashboard for reviewing and managing submitted quotes
//

import React, { useState, useEffect, useMemo } from 'react'
import { Project, Trade } from '@/types'
import { QuoteRequest, SubmittedQuote, UpdateQuoteStatusInput } from '@/types/quote'
import { TRADE_CATEGORIES } from '@/types/constants'
import {
  fetchQuoteRequestsForProject_Hybrid,
  fetchSubmittedQuotesForRequest_Hybrid,
  updateQuoteStatus_Hybrid,
  getTradesForEstimate_Hybrid,
  updateTrade_Hybrid,
  deleteQuoteRequest_Hybrid,
  resendQuoteRequestEmail_Hybrid,
} from '@/services/hybridService'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { 
  Mail, 
  FileText, 
  CheckCircle, 
  XCircle, 
  Clock, 
  DollarSign,
  Building2,
  Calendar,
  User,
  ArrowLeft,
  Eye,
  Link as LinkIcon,
  RefreshCw,
  X
} from 'lucide-react'
import hshLogo from '/HSH Contractor Logo - Color.png'

interface QuoteReviewDashboardProps {
  project: Project
  onBack: () => void
}

export function QuoteReviewDashboard({ project, onBack }: QuoteReviewDashboardProps) {
  const [quoteRequests, setQuoteRequests] = useState<QuoteRequest[]>([])
  const [submittedQuotes, setSubmittedQuotes] = useState<Map<string, SubmittedQuote[]>>(new Map())
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedQuote, setSelectedQuote] = useState<SubmittedQuote | null>(null)
  const [selectedTradeId, setSelectedTradeId] = useState<string>('')
  const [reviewNotes, setReviewNotes] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showQuoteDetails, setShowQuoteDetails] = useState(false)
  const [quoteDetails, setQuoteDetails] = useState<{ quote: SubmittedQuote; request: QuoteRequest } | null>(null)
  const [activeTab, setActiveTab] = useState<'requests' | 'quotes'>('quotes') // 'requests' for quote requests, 'quotes' for submitted quotes
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [quoteRequestToDelete, setQuoteRequestToDelete] = useState<string | null>(null)

  const requestMap = useMemo(() => {
    const map = new Map<string, QuoteRequest>()
    quoteRequests.forEach(request => map.set(request.id, request))
    return map
  }, [quoteRequests])

  const getVendorTypeForQuote = (quote: SubmittedQuote) =>
    requestMap.get(quote.quoteRequestId)?.vendorType || 'subcontractor'

  // Load quote requests and submitted quotes
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        // Load quote requests
        const requests = await fetchQuoteRequestsForProject_Hybrid(project.id)
        setQuoteRequests(requests)

        // Load submitted quotes for each request
        const quotesMap = new Map<string, SubmittedQuote[]>()
        for (const request of requests) {
          const quotes = await fetchSubmittedQuotesForRequest_Hybrid(request.id)
          quotesMap.set(request.id, quotes)
        }
        setSubmittedQuotes(quotesMap)

        // Load trades for assignment
        const projectTrades = await getTradesForEstimate_Hybrid(project.estimate.id)
        setTrades(projectTrades)
      } catch (error) {
        console.error('Error loading quotes:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [project.id, project.estimate.id])

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const handleDeleteQuoteRequest = (requestId: string) => {
    console.log('handleDeleteQuoteRequest called with requestId:', requestId)
    setQuoteRequestToDelete(requestId)
    setDeleteDialogOpen(true)
  }

  const confirmDeleteQuoteRequest = async () => {
    if (!quoteRequestToDelete) return

    console.log('User confirmed delete, proceeding with:', quoteRequestToDelete)

    try {
      console.log('Calling deleteQuoteRequest_Hybrid...')
      const deleted = await deleteQuoteRequest_Hybrid(quoteRequestToDelete)
      console.log('deleteQuoteRequest_Hybrid returned:', deleted)
      
      if (deleted) {
        // Remove from state
        setQuoteRequests(prev => prev.filter(r => r.id !== quoteRequestToDelete))
        // Remove submitted quotes for this request
        setSubmittedQuotes(prev => {
          const newMap = new Map(prev)
          newMap.delete(quoteRequestToDelete)
          return newMap
        })
        alert('Quote request deleted successfully')
        setDeleteDialogOpen(false)
        setQuoteRequestToDelete(null)
      } else {
        console.error('deleteQuoteRequest_Hybrid returned false')
        alert('Failed to delete quote request')
      }
    } catch (error) {
      console.error('Error deleting quote request:', error)
      alert('Failed to delete quote request: ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  const handleResendQuoteRequest = async (request: QuoteRequest) => {
    try {
      const trade = request.tradeId ? trades.find(t => t.id === request.tradeId) : undefined
      const tradeCategoryLabel = trade?.category ? TRADE_CATEGORIES[trade.category]?.label : undefined
      const resent = await resendQuoteRequestEmail_Hybrid(request, project.name, tradeCategoryLabel)
      
      if (resent) {
        // Reload quote requests to get updated sent_at timestamp
        const requests = await fetchQuoteRequestsForProject_Hybrid(project.id)
        setQuoteRequests(requests)
        alert('Quote request email resent successfully!')
      } else {
        alert('Failed to resend quote request email. Please check:\n1. Edge Function is deployed\n2. RESEND_API_KEY is configured\n3. FROM_EMAIL is verified\n\nCheck console for more details.')
      }
    } catch (error) {
      console.error('Error resending quote request:', error)
      alert(`Failed to resend quote request email: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  const getRequestStatusBadge = (status: QuoteRequest['status'], expiresAt?: Date) => {
    const isExpired = expiresAt && new Date(expiresAt) < new Date()
    
    if (isExpired) {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
          Expired
        </span>
      )
    }

    const badges = {
      sent: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Sent' },
      viewed: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Viewed' },
      submitted: { bg: 'bg-green-100', text: 'text-green-800', label: 'Quote Submitted' },
      expired: { bg: 'bg-red-100', text: 'text-red-800', label: 'Expired' },
    }
    const badge = badges[status] || badges.sent
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    )
  }

  const applyQuoteToTrade = async (quote: SubmittedQuote, tradeId: string) => {
    try {
      const tradeToUpdate = trades.find(t => t.id === tradeId)
      if (tradeToUpdate) {
        const vendorType = getVendorTypeForQuote(quote)
        // When applying a quote, clear conflicting costs:
        // - Supplier quote: set materialCost, clear subcontractorCost (keep laborCost)
        // - Subcontractor quote: set subcontractorCost, clear laborCost (keep materialCost)
        const updates =
          vendorType === 'supplier'
            ? { 
                materialCost: quote.totalAmount, 
                subcontractorCost: 0, // Clear sub cost when using supplier
                isSubcontracted: false 
              }
            : { 
                subcontractorCost: quote.totalAmount, 
                laborCost: 0, // Clear labor cost when using subcontractor
                isSubcontracted: true 
              }

        await updateTrade_Hybrid(tradeId, updates)
        const costLabel = vendorType === 'supplier' ? 'material' : 'subcontractor'
        const clearedLabel = vendorType === 'supplier' ? 'subcontractor' : 'labor'
        console.log(`✅ Applied ${costLabel} quote amount ${formatCurrency(quote.totalAmount)} to trade ${tradeId} (cleared ${clearedLabel} cost)`)
        alert(`Quote amount ${formatCurrency(quote.totalAmount)} applied to ${costLabel} cost. ${clearedLabel.charAt(0).toUpperCase() + clearedLabel.slice(1)} cost cleared.`)
        return true
      } else {
        console.warn(`Trade ${tradeId} not found`)
        alert('Trade not found')
        return false
      }
    } catch (tradeError) {
      console.error('Error applying quote to trade:', tradeError)
      alert('Failed to apply quote to trade')
      return false
    }
  }

  const handleViewDetails = (quote: SubmittedQuote) => {
    const request = quoteRequests.find(r => {
      const quotes = submittedQuotes.get(r.id) || []
      return quotes.some(q => q.id === quote.id)
    })
    if (request) {
      setQuoteDetails({ quote, request })
      setShowQuoteDetails(true)
    }
  }

  const handleUpdateStatus = async (quote: SubmittedQuote, status: SubmittedQuote['status']) => {
    // Find the request for this quote to get the original tradeId
    const request = quoteRequests.find(r => {
      const quotes = submittedQuotes.get(r.id) || []
      return quotes.some(q => q.id === quote.id)
    })
    
    // Use the selected quote's values if this is the selected quote, otherwise use quote's existing values or request's tradeId
    const tradeId = selectedQuote?.id === quote.id 
      ? selectedTradeId 
      : (quote.assignedTradeId || request?.tradeId || '')
    const notes = selectedQuote?.id === quote.id ? reviewNotes : ''

    const input: UpdateQuoteStatusInput = {
      quoteId: quote.id,
      status,
      reviewNotes: notes || undefined,
      assignedTradeId: tradeId && tradeId !== '__none__' ? tradeId : undefined,
    }

    try {
      const updated = await updateQuoteStatus_Hybrid(input)
      if (updated) {
        // If quote is accepted and assigned to a trade, update the trade's cost
        // Clear conflicting costs: supplier quotes clear sub costs, sub quotes clear labor costs
        if (status === 'accepted' && input.assignedTradeId) {
          try {
            const tradeToUpdate = trades.find(t => t.id === input.assignedTradeId)
            if (tradeToUpdate) {
              const vendorType = getVendorTypeForQuote(quote)
              // When accepting a quote, clear conflicting costs:
              // - Supplier quote: set materialCost, clear subcontractorCost (keep laborCost)
              // - Subcontractor quote: set subcontractorCost, clear laborCost (keep materialCost)
              const updates =
                vendorType === 'supplier'
                  ? { 
                      materialCost: quote.totalAmount, 
                      subcontractorCost: 0, // Clear sub cost when using supplier
                      isSubcontracted: false 
                    }
                  : { 
                      subcontractorCost: quote.totalAmount, 
                      laborCost: 0, // Clear labor cost when using subcontractor
                      isSubcontracted: true 
                    }

              await updateTrade_Hybrid(input.assignedTradeId, updates)
              const clearedLabel = vendorType === 'supplier' ? 'subcontractor' : 'labor'
              console.log(
                `✅ Updated trade ${input.assignedTradeId} with ${vendorType} quote amount: $${quote.totalAmount} (cleared ${clearedLabel} cost)`
              )
            } else {
              console.warn(`Trade ${input.assignedTradeId} not found`)
            }
          } catch (tradeError) {
            console.error('Error updating trade with quote amount:', tradeError)
            // Don't fail the whole operation if trade update fails
          }
        }

        // Refresh quotes
        const quotes = await fetchSubmittedQuotesForRequest_Hybrid(quote.quoteRequestId)
        setSubmittedQuotes(prev => {
          const newMap = new Map(prev)
          newMap.set(quote.quoteRequestId, quotes)
          return newMap
        })
        setSelectedQuote(null)
        setSelectedTradeId('')
        setReviewNotes('')
        
        const appliedCostLabel = getVendorTypeForQuote(quote) === 'supplier' ? 'material' : 'subcontractor'
        const message = status === 'accepted' && input.assignedTradeId
          ? `Quote accepted and applied to ${appliedCostLabel} cost! Amount: ${formatCurrency(quote.totalAmount)}`
          : `Quote ${status === 'accepted' ? 'accepted' : status === 'rejected' ? 'rejected' : 'status updated'} successfully!`
        alert(message)
      }
    } catch (error) {
      console.error('Error updating quote status:', error)
      alert('Failed to update quote status')
    }
  }

  const getStatusBadge = (status: SubmittedQuote['status']) => {
    const badges = {
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending Review' },
      accepted: { bg: 'bg-green-100', text: 'text-green-800', label: 'Accepted' },
      rejected: { bg: 'bg-red-100', text: 'text-red-800', label: 'Rejected' },
      'waiting-for-more': { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Waiting for More' },
      'revision-requested': { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Revision Requested' },
    }
    const badge = badges[status] || badges.pending
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    )
  }

  // Get all submitted quotes flattened
  const allQuotes: Array<{ quote: SubmittedQuote; request: QuoteRequest }> = []
  quoteRequests.forEach(request => {
    const quotes = submittedQuotes.get(request.id) || []
    quotes.forEach(quote => {
      allQuotes.push({ quote, request })
    })
  })

  // Filter quotes by status
  const filteredQuotes = filterStatus === 'all' 
    ? allQuotes 
    : allQuotes.filter(({ quote }) => quote.status === filterStatus)

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0E79C9] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading quotes...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pb-20 sm:pb-0">
      {/* Header */}
      <header className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <img src={hshLogo} alt="HSH Contractor" className="h-12 w-auto" />
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{project.name}</h1>
                <p className="text-sm text-gray-600 mt-1">Quote Review Dashboard</p>
              </div>
            </div>
            <Button onClick={onBack} variant="outline" className="border-[#0E79C9] text-[#0E79C9] hover:bg-[#0E79C9] hover:text-white">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Project
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Stats Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-[#0E79C9] to-[#0A5A96] text-white border-none">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm opacity-90">Total Requests</p>
                <p className="text-3xl font-bold">{quoteRequests.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-[#213069] to-[#1a2550] text-white border-none">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm opacity-90">Submitted Quotes</p>
                <p className="text-3xl font-bold">{allQuotes.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-[#D95C00] to-[#B34C00] text-white border-none">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm opacity-90">Pending Review</p>
                <p className="text-3xl font-bold">
                  {allQuotes.filter(({ quote }) => quote.status === 'pending').length}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-[#8B5CF6] to-[#7C3AED] text-white border-none">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm opacity-90">Accepted</p>
                <p className="text-3xl font-bold">
                  {allQuotes.filter(({ quote }) => quote.status === 'accepted').length}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('requests')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'requests'
                  ? 'border-[#0E79C9] text-[#0E79C9]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Quote Requests ({quoteRequests.length})
            </button>
            <button
              onClick={() => setActiveTab('quotes')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'quotes'
                  ? 'border-[#0E79C9] text-[#0E79C9]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Submitted Quotes ({allQuotes.length})
            </button>
          </nav>
        </div>

        {/* Quote Requests Tab */}
        {activeTab === 'requests' && (
          <>
            {quoteRequests.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center py-12">
                  <Mail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No quote requests found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {quoteRequests.map((request) => {
                  const submittedQuotesForRequest = submittedQuotes.get(request.id) || []
                  const trade = request.tradeId ? trades.find(t => t.id === request.tradeId) : undefined
                  const tradeCategoryLabel = trade?.category ? TRADE_CATEGORIES[trade.category]?.label : undefined
                  
                  return (
                    <Card key={request.id} className="hover:shadow-lg transition-shadow border border-gray-200">
                      <CardHeader>
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <CardTitle className="text-lg">{request.vendorName || request.vendorEmail}</CardTitle>
                              {getRequestStatusBadge(request.status, request.expiresAt)}
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                {request.vendorType === 'supplier' ? 'Supplier Request' : 'Subcontractor Request'}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                              <div className="flex items-center gap-1">
                                <Mail className="w-4 h-4" />
                                {request.vendorEmail}
                              </div>
                              {tradeCategoryLabel && (
                                <div className="flex items-center gap-1">
                                  <LinkIcon className="w-4 h-4" />
                                  Trade: {tradeCategoryLabel}
                                </div>
                              )}
                              <div className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                Sent: {new Date(request.sentAt).toLocaleDateString()}
                              </div>
                              {request.viewedAt && (
                                <div className="flex items-center gap-1">
                                  <Eye className="w-4 h-4" />
                                  Viewed: {new Date(request.viewedAt).toLocaleDateString()}
                                </div>
                              )}
                              {request.expiresAt && (
                                <div className="flex items-center gap-1">
                                  <Clock className="w-4 h-4" />
                                  Expires: {new Date(request.expiresAt).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-semibold text-gray-700">
                              {submittedQuotesForRequest.length} {submittedQuotesForRequest.length === 1 ? 'Quote' : 'Quotes'}
                            </p>
                            {request.dueDate && (
                              <p className="text-xs text-gray-500">
                                Due: {new Date(request.dueDate).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {/* Scope of Work Preview */}
                        <div className="mb-4">
                          <p className="text-sm font-medium text-gray-700 mb-1">Scope of Work:</p>
                          <p className="text-sm text-gray-600 bg-gray-50 rounded p-2 line-clamp-3">
                            {request.scopeOfWork}
                          </p>
                        </div>

                        {/* Submitted Quotes */}
                        {submittedQuotesForRequest.length > 0 && (
                          <div className="mb-4">
                            <p className="text-sm font-medium text-gray-700 mb-2">Submitted Quotes:</p>
                            <div className="space-y-2">
                              {submittedQuotesForRequest.map((quote) => (
                                <div key={quote.id} className="bg-blue-50 rounded p-2 flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">{quote.vendorName}</p>
                                    <p className="text-xs text-gray-600">Submitted: {new Date(quote.submittedAt).toLocaleDateString()}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-bold text-[#0E79C9]">{formatCurrency(quote.totalAmount)}</p>
                                    {getStatusBadge(quote.status)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
                          <Button
                            onClick={() => handleResendQuoteRequest(request)}
                            variant="outline"
                            size="sm"
                            className="border-[#0E79C9] text-[#0E79C9] hover:bg-[#0E79C9] hover:text-white"
                          >
                            <Mail className="w-4 h-4 mr-2" />
                            Resend Email
                          </Button>
                          <Button
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              console.log('Delete button clicked for request:', request.id)
                              handleDeleteQuoteRequest(request.id)
                            }}
                            variant="destructive"
                            size="sm"
                            type="button"
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            Delete
                          </Button>
                          {request.drawingsUrl && (
                            <a
                              href={request.drawingsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors border border-gray-300 bg-white hover:bg-gray-50 h-9 px-4 py-2"
                            >
                              <FileText className="w-4 h-4 mr-2" />
                              View Drawings
                            </a>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* Submitted Quotes Tab */}
        {activeTab === 'quotes' && (
          <>
            {/* Filter */}
            <div className="mb-6">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Quotes</SelectItem>
                  <SelectItem value="pending">Pending Review</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="waiting-for-more">Waiting for More</SelectItem>
                  <SelectItem value="revision-requested">Revision Requested</SelectItem>
                </SelectContent>
              </Select>
            </div>

        {/* Quotes List */}
        {filteredQuotes.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center py-12">
              <Mail className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No quotes found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredQuotes.map(({ quote, request }) => {
              const requestTrade = request.tradeId ? trades.find(t => t.id === request.tradeId) : undefined
              const requestTradeCategoryLabel = requestTrade?.category ? TRADE_CATEGORIES[requestTrade.category]?.label : undefined
              
              return (
              <Card key={quote.id} className="hover:shadow-lg transition-shadow border border-gray-200">
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-lg">{quote.vendorName}</CardTitle>
                        {getStatusBadge(quote.status)}
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {request.vendorType === 'supplier' ? 'Supplier Quote' : 'Subcontractor Quote'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Mail className="w-4 h-4" />
                          {quote.vendorEmail}
                        </div>
                        {quote.vendorCompany && (
                          <div className="flex items-center gap-1">
                            <Building2 className="w-4 h-4" />
                            {quote.vendorCompany}
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          Submitted: {new Date(quote.submittedAt).toLocaleDateString()}
                        </div>
                        {requestTradeCategoryLabel && (
                          <div className="flex items-center gap-1">
                            <LinkIcon className="w-4 h-4" />
                            Trade: {requestTradeCategoryLabel}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-[#0E79C9]">{formatCurrency(quote.totalAmount)}</p>
                      {quote.validUntil && (
                        <p className="text-xs text-gray-500">
                          Valid until: {new Date(quote.validUntil).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Line Items */}
                  {quote.lineItems && quote.lineItems.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">Line Items:</p>
                      <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                        {quote.lineItems.map((item, index) => (
                          <div key={index} className="flex justify-between text-sm">
                            <span className="text-gray-700">
                              {item.quantity} {item.unit} - {item.description}
                            </span>
                            <span className="font-medium">{formatCurrency(item.price * item.quantity)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {quote.notes && (
                    <div className="mb-4">
                      <p className="text-sm font-medium text-gray-700 mb-1">Vendor Notes:</p>
                      <p className="text-sm text-gray-600 bg-gray-50 rounded p-2">{quote.notes}</p>
                    </div>
                  )}

                  {/* Quote Document */}
                  {quote.quoteDocumentUrl && (
                    <div className="mb-4">
                      <a
                        href={quote.quoteDocumentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#0E79C9] hover:underline flex items-center gap-2 text-sm"
                      >
                        <FileText className="w-4 h-4" />
                        View Quote Document
                      </a>
                    </div>
                  )}

                  {/* Assignment Info */}
                  {quote.assignedTradeId && (
                    <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-blue-900">
                          Assigned to: {trades.find(t => t.id === quote.assignedTradeId)?.name || 'Unknown Trade'}
                        </p>
                        {quote.status === 'accepted' && (
                          <Button
                            onClick={() => applyQuoteToTrade(quote, quote.assignedTradeId!)}
                            size="sm"
                            variant="outline"
                            className="border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white"
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Apply to Trade
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Review Notes */}
                  {quote.reviewNotes && (
                    <div className="mb-4">
                      <p className="text-sm font-medium text-gray-700 mb-1">Review Notes:</p>
                      <p className="text-sm text-gray-600 bg-gray-50 rounded p-2">{quote.reviewNotes}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
                    {quote.status === 'pending' && (
                      <>
                        <div className="flex-1 space-y-2">
                          <Select
                            value={selectedQuote?.id === quote.id 
                              ? (selectedTradeId || request.tradeId || '__none__')
                              : (quote.assignedTradeId || request.tradeId || '__none__')}
                            onValueChange={(value) => {
                              setSelectedQuote(quote)
                              setSelectedTradeId(value === '__none__' ? '' : value)
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Assign to trade (optional)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">None</SelectItem>
                              {Object.entries(
                                trades.reduce((acc, trade) => {
                                  const category = trade.category || 'other'
                                  const categoryLabel = TRADE_CATEGORIES[category]?.label || category
                                  if (!acc[categoryLabel]) {
                                    acc[categoryLabel] = []
                                  }
                                  acc[categoryLabel].push(trade)
                                  return acc
                                }, {} as Record<string, Trade[]>)
                              ).map(([categoryLabel, categoryTrades]) => (
                                <SelectGroup key={categoryLabel}>
                                  <SelectLabel>{categoryLabel}</SelectLabel>
                                  {categoryTrades.map(trade => (
                                    <SelectItem key={trade.id} value={trade.id}>
                                      {trade.name}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              ))}
                            </SelectContent>
                          </Select>
                          <textarea
                            className="w-full min-h-[80px] px-3 py-2 border border-gray-300 rounded-md text-sm"
                            placeholder="Review notes (optional)"
                            value={selectedQuote?.id === quote.id ? reviewNotes : ''}
                            onChange={(e) => {
                              setSelectedQuote(quote)
                              setReviewNotes(e.target.value)
                            }}
                          />
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Button
                            onClick={() => handleUpdateStatus(quote, 'accepted')}
                            className="bg-green-600 hover:bg-green-700 text-white"
                            size="sm"
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Accept
                          </Button>
                          <Button
                            onClick={() => handleUpdateStatus(quote, 'waiting-for-more')}
                            variant="outline"
                            size="sm"
                          >
                            <Clock className="w-4 h-4 mr-2" />
                            Wait for More
                          </Button>
                          <Button
                            onClick={() => handleUpdateStatus(quote, 'revision-requested')}
                            variant="outline"
                            size="sm"
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Request Revision
                          </Button>
                          <Button
                            onClick={() => handleUpdateStatus(quote, 'rejected')}
                            variant="destructive"
                            size="sm"
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            Reject
                          </Button>
                        </div>
                      </>
                    )}
                    {quote.status !== 'pending' && (
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button
                          onClick={() => handleViewDetails(quote)}
                          variant="outline"
                          size="sm"
                          className="border-[#0E79C9] text-[#0E79C9] hover:bg-[#0E79C9] hover:text-white"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </Button>
                        {!quote.assignedTradeId && (
                          <>
                            <Select
                              value={selectedQuote?.id === quote.id 
                                ? (selectedTradeId || request.tradeId || '__none__')
                                : (quote.assignedTradeId || request.tradeId || '__none__')}
                              onValueChange={(value) => {
                                setSelectedQuote(quote)
                                setSelectedTradeId(value === '__none__' ? '' : value)
                              }}
                            >
                              <SelectTrigger className="w-full sm:w-48">
                                <SelectValue placeholder="Assign to trade" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">None</SelectItem>
                                {Object.entries(
                                  trades.reduce((acc, trade) => {
                                    const category = trade.category || 'other'
                                    const categoryLabel = TRADE_CATEGORIES[category]?.label || category
                                    if (!acc[categoryLabel]) {
                                      acc[categoryLabel] = []
                                    }
                                    acc[categoryLabel].push(trade)
                                    return acc
                                  }, {} as Record<string, Trade[]>)
                                ).map(([categoryLabel, categoryTrades]) => (
                                  <SelectGroup key={categoryLabel}>
                                    <SelectLabel>{categoryLabel}</SelectLabel>
                                    {categoryTrades.map(trade => (
                                      <SelectItem key={trade.id} value={trade.id}>
                                        {trade.name}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
                                ))}
                              </SelectContent>
                            </Select>
                            {selectedQuote?.id === quote.id && selectedTradeId && selectedTradeId !== '__none__' && (
                              <Button
                                onClick={() => {
                                  const input: UpdateQuoteStatusInput = {
                                    quoteId: quote.id,
                                    status: quote.status,
                                    assignedTradeId: selectedTradeId,
                                  }
                                  updateQuoteStatus_Hybrid(input).then(updated => {
                                    if (updated) {
                                      // Refresh quotes
                                      fetchSubmittedQuotesForRequest_Hybrid(quote.quoteRequestId).then(quotes => {
                                        setSubmittedQuotes(prev => {
                                          const newMap = new Map(prev)
                                          newMap.set(quote.quoteRequestId, quotes)
                                          return newMap
                                        })
                                      })
                                      setSelectedQuote(null)
                                      setSelectedTradeId('')
                                      alert('Quote assigned to trade successfully!')
                                    }
                                  })
                                }}
                                size="sm"
                                className="bg-[#0E79C9] hover:bg-[#0A5A96]"
                              >
                                Assign to Trade
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              )
            })}
          </div>
        )}
          </>
        )}
      </main>

      {/* Quote Details Dialog */}
      <Dialog open={showQuoteDetails} onOpenChange={setShowQuoteDetails}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">{quoteDetails?.quote.vendorName}</DialogTitle>
            <DialogDescription>
              Quote submitted on {quoteDetails?.quote.submittedAt ? new Date(quoteDetails.quote.submittedAt).toLocaleDateString() : 'N/A'}
            </DialogDescription>
          </DialogHeader>
          
          {quoteDetails && (
            <div className="space-y-6 mt-4">
              {/* Vendor Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Vendor Email</p>
                  <p className="text-sm text-gray-600">{quoteDetails.quote.vendorEmail}</p>
                </div>
                {quoteDetails.quote.vendorCompany && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Company</p>
                    <p className="text-sm text-gray-600">{quoteDetails.quote.vendorCompany}</p>
                  </div>
                )}
                {quoteDetails.quote.vendorPhone && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Phone</p>
                    <p className="text-sm text-gray-600">{quoteDetails.quote.vendorPhone}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-1">Status</p>
                  {getStatusBadge(quoteDetails.quote.status)}
                </div>
              </div>

              {/* Scope of Work */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Scope of Work</p>
                <p className="text-sm text-gray-600 bg-gray-50 rounded p-3 whitespace-pre-wrap">
                  {quoteDetails.request.scopeOfWork}
                </p>
              </div>

              {/* Line Items */}
              {quoteDetails.quote.lineItems && quoteDetails.quote.lineItems.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Line Items</p>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">Description</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-700">Quantity</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-700">Unit</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-700">Price</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-gray-700">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {quoteDetails.quote.lineItems.map((item, index) => (
                          <tr key={index}>
                            <td className="px-4 py-2 text-sm text-gray-700">{item.description}</td>
                            <td className="px-4 py-2 text-sm text-gray-600 text-right">{item.quantity}</td>
                            <td className="px-4 py-2 text-sm text-gray-600 text-right">{item.unit}</td>
                            <td className="px-4 py-2 text-sm text-gray-600 text-right">{formatCurrency(item.price)}</td>
                            <td className="px-4 py-2 text-sm font-medium text-gray-900 text-right">{formatCurrency(item.price * item.quantity)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr>
                          <td colSpan={4} className="px-4 py-2 text-sm font-medium text-gray-700 text-right">Total:</td>
                          <td className="px-4 py-2 text-sm font-bold text-gray-900 text-right">{formatCurrency(quoteDetails.quote.totalAmount)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Notes */}
              {quoteDetails.quote.notes && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Vendor Notes</p>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded p-3 whitespace-pre-wrap">
                    {quoteDetails.quote.notes}
                  </p>
                </div>
              )}

              {/* Review Notes */}
              {quoteDetails.quote.reviewNotes && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Review Notes</p>
                  <p className="text-sm text-gray-600 bg-gray-50 rounded p-3 whitespace-pre-wrap">
                    {quoteDetails.quote.reviewNotes}
                  </p>
                </div>
              )}

              {/* Assignment */}
              {quoteDetails.quote.assignedTradeId && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Assigned Trade</p>
                  <p className="text-sm text-gray-600 bg-blue-50 rounded p-3">
                    {trades.find(t => t.id === quoteDetails.quote.assignedTradeId)?.name || 'Unknown Trade'}
                  </p>
                </div>
              )}

              {/* Documents */}
              {quoteDetails.quote.quoteDocumentUrl && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Quote Document</p>
                  <a
                    href={quoteDetails.quote.quoteDocumentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0E79C9] hover:underline flex items-center gap-2 text-sm"
                  >
                    <FileText className="w-4 h-4" />
                    View Quote Document
                  </a>
                </div>
              )}

              {quoteDetails.request.drawingsUrl && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Drawings</p>
                  <a
                    href={quoteDetails.request.drawingsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0E79C9] hover:underline flex items-center gap-2 text-sm"
                  >
                    <FileText className="w-4 h-4" />
                    View Drawings
                  </a>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Quote Request</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this quote request? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false)
                setQuoteRequestToDelete(null)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteQuoteRequest}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
