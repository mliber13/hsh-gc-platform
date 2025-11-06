// ============================================================================
// Quote Review Dashboard
// ============================================================================
//
// Dashboard for reviewing and managing submitted quotes
//

import React, { useState, useEffect } from 'react'
import { Project, Trade } from '@/types'
import { QuoteRequest, SubmittedQuote, UpdateQuoteStatusInput } from '@/types/quote'
import {
  fetchQuoteRequestsForProject_Hybrid,
  fetchSubmittedQuotesForRequest_Hybrid,
  updateQuoteStatus_Hybrid,
  getTradesForEstimate_Hybrid,
} from '@/services/hybridService'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
  Link as LinkIcon
} from 'lucide-react'

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

  const handleUpdateStatus = async (quote: SubmittedQuote, status: SubmittedQuote['status']) => {
    // Use the selected quote's values if this is the selected quote, otherwise use quote's existing values
    const tradeId = selectedQuote?.id === quote.id ? selectedTradeId : (quote.assignedTradeId || '')
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
        alert(`Quote ${status === 'accepted' ? 'accepted' : status === 'rejected' ? 'rejected' : 'status updated'} successfully!`)
      }
    } catch (error) {
      console.error('Error updating quote status:', error)
      alert('Failed to update quote status')
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

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
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{project.name}</h1>
              <p className="text-sm text-gray-600 mt-1">Quote Review Dashboard</p>
            </div>
            <Button onClick={onBack} variant="outline">
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
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-600">Total Requests</p>
                <p className="text-2xl font-bold text-gray-900">{quoteRequests.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-600">Submitted Quotes</p>
                <p className="text-2xl font-bold text-gray-900">{allQuotes.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-600">Pending Review</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {allQuotes.filter(({ quote }) => quote.status === 'pending').length}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-600">Accepted</p>
                <p className="text-2xl font-bold text-green-600">
                  {allQuotes.filter(({ quote }) => quote.status === 'accepted').length}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

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
            {filteredQuotes.map(({ quote, request }) => (
              <Card key={quote.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <CardTitle className="text-lg">{quote.vendorName}</CardTitle>
                        {getStatusBadge(quote.status)}
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
                        {request.tradeId && (
                          <div className="flex items-center gap-1">
                            <LinkIcon className="w-4 h-4" />
                            Trade: {trades.find(t => t.id === request.tradeId)?.name || 'Unknown'}
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
                      <p className="text-sm font-medium text-blue-900">
                        Assigned to: {trades.find(t => t.id === quote.assignedTradeId)?.name || 'Unknown Trade'}
                      </p>
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
                            value={selectedQuote?.id === quote.id ? (selectedTradeId || '__none__') : (quote.assignedTradeId || '__none__')}
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
                              {trades.map(trade => (
                                <SelectItem key={trade.id} value={trade.id}>
                                  {trade.name}
                                </SelectItem>
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
                          onClick={() => {
                            setSelectedQuote(quote)
                            setSelectedTradeId(quote.assignedTradeId || '')
                            setReviewNotes(quote.reviewNotes || '')
                          }}
                          variant="outline"
                          size="sm"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          View Details
                        </Button>
                        {!quote.assignedTradeId && (
                          <>
                            <Select
                              value={selectedQuote?.id === quote.id ? (selectedTradeId || '__none__') : '__none__'}
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
                                {trades.map(trade => (
                                  <SelectItem key={trade.id} value={trade.id}>
                                    {trade.name}
                                  </SelectItem>
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
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

