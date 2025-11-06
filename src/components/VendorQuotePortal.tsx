// ============================================================================
// Vendor Quote Portal
// ============================================================================
//
// Token-based portal for vendors to submit quotes
// No authentication required - access via secure token
//

import React, { useState, useEffect } from 'react'
// Token will be passed via props or extracted from URL
import { QuoteRequest, SubmitQuoteInput, QuoteLineItem } from '@/types/quote'
import { fetchQuoteRequestByToken_Hybrid, submitQuote_Hybrid } from '@/services/hybridService'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Upload, FileText, Building2, MapPin, Calendar, CheckCircle, AlertCircle } from 'lucide-react'
import hshLogo from '/HSH Contractor Logo - Color.png'

interface VendorQuotePortalProps {
  token?: string
}

export function VendorQuotePortal({ token: tokenProp }: VendorQuotePortalProps = {}) {
  // Extract token from URL if not provided as prop
  const getTokenFromUrl = () => {
    if (tokenProp) return tokenProp
    const path = window.location.pathname
    const match = path.match(/\/vendor-quote\/([^/]+)/)
    return match ? match[1] : null
  }
  
  const token = getTokenFromUrl()
  const [quoteRequest, setQuoteRequest] = useState<QuoteRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Form state
  const [vendorName, setVendorName] = useState('')
  const [vendorEmail, setVendorEmail] = useState('')
  const [vendorCompany, setVendorCompany] = useState('')
  const [vendorPhone, setVendorPhone] = useState('')
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>([
    { description: '', quantity: 1, unit: 'each', price: 0 }
  ])
  const [validUntil, setValidUntil] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [quoteDocument, setQuoteDocument] = useState<File | null>(null)

  // Load quote request
  useEffect(() => {
    if (!token) {
      setError('Invalid quote request link')
      setLoading(false)
      return
    }

    const loadQuoteRequest = async () => {
      try {
        const request = await fetchQuoteRequestByToken_Hybrid(token)
        if (!request) {
          setError('Quote request not found or has expired')
          setLoading(false)
          return
        }

        // Check if expired
        if (request.expiresAt && new Date(request.expiresAt) < new Date()) {
          setError('This quote request has expired')
          setLoading(false)
          return
        }

        // Check if already submitted
        if (request.status === 'submitted') {
          setSubmitted(true)
        }

        setQuoteRequest(request)
        setVendorEmail(request.vendorEmail)
        setVendorName(request.vendorName || '')
        setLoading(false)
      } catch (err) {
        console.error('Error loading quote request:', err)
        setError('Failed to load quote request')
        setLoading(false)
      }
    }

    loadQuoteRequest()
  }, [token])

  const handleAddLineItem = () => {
    setLineItems([...lineItems, { description: '', quantity: 1, unit: 'each', price: 0 }])
  }

  const handleRemoveLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index))
    }
  }

  const handleLineItemChange = (index: number, field: keyof QuoteLineItem, value: any) => {
    const updated = [...lineItems]
    updated[index] = { ...updated[index], [field]: value }
    setLineItems(updated)
  }

  const calculateTotal = () => {
    return lineItems.reduce((sum, item) => sum + (item.quantity * item.price), 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!quoteRequest || !token) return

    // Validation
    if (!vendorName.trim() || !vendorEmail.trim()) {
      alert('Please enter your name and email')
      return
    }

    if (lineItems.some(item => !item.description.trim() || item.price <= 0)) {
      alert('Please complete all line items with descriptions and prices')
      return
    }

    setSubmitting(true)

    try {
      const input: SubmitQuoteInput = {
        token,
        vendorName: vendorName.trim(),
        vendorEmail: vendorEmail.trim(),
        vendorCompany: vendorCompany.trim() || undefined,
        vendorPhone: vendorPhone.trim() || undefined,
        lineItems,
        totalAmount: calculateTotal(),
        validUntil: validUntil ? new Date(validUntil) : undefined,
        notes: notes.trim() || undefined,
        quoteDocument: quoteDocument || undefined,
      }

      const submitted = await submitQuote_Hybrid(input)
      if (submitted) {
        setSubmitted(true)
      } else {
        alert('Failed to submit quote. Please try again.')
      }
    } catch (err) {
      console.error('Error submitting quote:', err)
      alert('Failed to submit quote. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0E79C9] mx-auto mb-4"></div>
          <p className="text-gray-600">Loading quote request...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900 mb-2">Error</h2>
              <p className="text-gray-600">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="text-center">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900 mb-2">Quote Submitted Successfully</h2>
              <p className="text-gray-600 mb-4">
                Thank you for submitting your quote. We will review it and get back to you soon.
              </p>
              {quoteRequest?.projectInfo && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg text-left">
                  <p className="text-sm font-medium text-gray-700">Project: {quoteRequest.projectInfo.projectName}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!quoteRequest) return null

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <img src={hshLogo} alt="HSH Contractor" className="h-16 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Quote Submission</h1>
          <p className="text-gray-600">Please provide your quote for the requested work</p>
        </div>

        {/* Project Information */}
        {quoteRequest.projectInfo && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Project Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="font-medium text-gray-900">{quoteRequest.projectInfo.projectName}</p>
              {quoteRequest.projectInfo.address && (
                <p className="text-sm text-gray-600 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  {quoteRequest.projectInfo.address}
                </p>
              )}
              {quoteRequest.projectInfo.specs && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-sm font-medium text-gray-700 mb-2">Project Specifications:</p>
                  <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                    {quoteRequest.projectInfo.specs.livingSquareFootage && (
                      <p>Living Square Footage: {quoteRequest.projectInfo.specs.livingSquareFootage.toLocaleString()} sqft</p>
                    )}
                    {quoteRequest.projectInfo.specs.bedrooms && (
                      <p>Bedrooms: {quoteRequest.projectInfo.specs.bedrooms}</p>
                    )}
                    {quoteRequest.projectInfo.specs.bathrooms && (
                      <p>Bathrooms: {quoteRequest.projectInfo.specs.bathrooms}</p>
                    )}
                    {quoteRequest.projectInfo.specs.foundationType && (
                      <p>Foundation: {quoteRequest.projectInfo.specs.foundationType}</p>
                    )}
                    {quoteRequest.projectInfo.specs.roofType && (
                      <p>Roof Type: {quoteRequest.projectInfo.specs.roofType}</p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Scope of Work */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Scope of Work
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 whitespace-pre-wrap">{quoteRequest.scopeOfWork}</p>
            {quoteRequest.dueDate && (
              <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="w-4 h-4" />
                <span>Quote Due: {new Date(quoteRequest.dueDate).toLocaleDateString()}</span>
              </div>
            )}
            {quoteRequest.drawingsUrl && (
              <div className="mt-4">
                <a
                  href={quoteRequest.drawingsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#0E79C9] hover:underline flex items-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  View Drawings & Documents
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quote Submission Form */}
        <Card>
          <CardHeader>
            <CardTitle>Submit Your Quote</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Vendor Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="vendorName">Your Name *</Label>
                  <Input
                    id="vendorName"
                    value={vendorName}
                    onChange={(e) => setVendorName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="vendorEmail">Email *</Label>
                  <Input
                    id="vendorEmail"
                    type="email"
                    value={vendorEmail}
                    onChange={(e) => setVendorEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="vendorCompany">Company Name</Label>
                  <Input
                    id="vendorCompany"
                    value={vendorCompany}
                    onChange={(e) => setVendorCompany(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="vendorPhone">Phone</Label>
                  <Input
                    id="vendorPhone"
                    type="tel"
                    value={vendorPhone}
                    onChange={(e) => setVendorPhone(e.target.value)}
                  />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <Label>Line Items *</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddLineItem}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Item
                  </Button>
                </div>
                <div className="space-y-3">
                  {lineItems.map((item, index) => (
                    <div key={index} className="grid grid-cols-12 gap-2 items-end p-3 border border-gray-200 rounded-lg">
                      <div className="col-span-5">
                        <Label className="text-xs">Description</Label>
                        <Input
                          value={item.description}
                          onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                          placeholder="Item description"
                          required
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Quantity</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.quantity}
                          onChange={(e) => handleLineItemChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                          required
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Unit</Label>
                        <Input
                          value={item.unit}
                          onChange={(e) => handleLineItemChange(index, 'unit', e.target.value)}
                          placeholder="each"
                          required
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Price</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.price}
                          onChange={(e) => handleLineItemChange(index, 'price', parseFloat(e.target.value) || 0)}
                          required
                        />
                      </div>
                      <div className="col-span-1">
                        {lineItems.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveLineItem(index)}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-900">Total Amount:</span>
                    <span className="text-xl font-bold text-[#0E79C9]">
                      ${calculateTotal().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Additional Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="validUntil">Quote Valid Until (Optional)</Label>
                  <Input
                    id="validUntil"
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="quoteDocument">Upload Your Quote Document (Optional)</Label>
                  <Input
                    id="quoteDocument"
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={(e) => setQuoteDocument(e.target.files?.[0] || null)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Additional Notes (Optional)</Label>
                <textarea
                  id="notes"
                  className="w-full min-h-[100px] px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0E79C9]"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional information about your quote..."
                />
              </div>

              <div className="flex gap-4 pt-4">
                <Button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-gradient-to-r from-[#0E79C9] to-[#0A5A96] hover:from-[#0A5A96] hover:to-[#084577]"
                >
                  {submitting ? 'Submitting...' : 'Submit Quote'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

