// ============================================================================
// Quote Request Form
// ============================================================================
//
// Form to create quote requests for vendors
//

import React, { useState } from 'react'
import { Project, Trade } from '@/types'
import { CreateQuoteRequestInput } from '@/types/quote'
import { createQuoteRequest_Hybrid } from '@/services/hybridService'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { X, Plus, Upload, FileText, Mail, Calendar } from 'lucide-react'

interface QuoteRequestFormProps {
  project: Project
  trade?: Trade | null
  onClose: () => void
  onSuccess?: (quoteRequests: any[]) => void
}

export function QuoteRequestForm({ project, trade, onClose, onSuccess }: QuoteRequestFormProps) {
  const [vendorEmails, setVendorEmails] = useState<string[]>([''])
  const [vendorNames, setVendorNames] = useState<string[]>([''])
  const [scopeOfWork, setScopeOfWork] = useState(trade ? `${trade.name}${trade.description ? `\n\n${trade.description}` : ''}` : '')
  const [drawingsFile, setDrawingsFile] = useState<File | null>(null)
  const [dueDate, setDueDate] = useState<string>('')
  const [expiresInDays, setExpiresInDays] = useState<number>(30)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAddVendor = () => {
    setVendorEmails([...vendorEmails, ''])
    setVendorNames([...vendorNames, ''])
  }

  const handleRemoveVendor = (index: number) => {
    if (vendorEmails.length > 1) {
      setVendorEmails(vendorEmails.filter((_, i) => i !== index))
      setVendorNames(vendorNames.filter((_, i) => i !== index))
    }
  }

  const handleVendorEmailChange = (index: number, value: string) => {
    const updated = [...vendorEmails]
    updated[index] = value
    setVendorEmails(updated)
  }

  const handleVendorNameChange = (index: number, value: string) => {
    const updated = [...vendorNames]
    updated[index] = value
    setVendorNames(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validation
    const validEmails = vendorEmails.filter(email => email.trim())
    if (validEmails.length === 0) {
      setError('Please enter at least one vendor email')
      return
    }

    if (!scopeOfWork.trim()) {
      setError('Please enter scope of work')
      return
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    for (const email of validEmails) {
      if (!emailRegex.test(email)) {
        setError(`Invalid email format: ${email}`)
        return
      }
    }

    setSubmitting(true)

    try {
      const input: CreateQuoteRequestInput = {
        projectId: project.id,
        tradeId: trade?.id,
        vendorEmails: validEmails,
        vendorNames: vendorNames.filter((_, i) => validEmails.includes(vendorEmails[i])),
        scopeOfWork: scopeOfWork.trim(),
        drawingsFile: drawingsFile || undefined,
        projectInfo: {
          projectName: project.name,
          address: typeof project.address === 'string' 
            ? project.address 
            : project.address?.street 
              ? `${project.address.street}, ${project.address.city}, ${project.address.state} ${project.address.zip}`
              : undefined,
          specs: project.specs ? {
            livingSquareFootage: project.specs.livingSquareFootage,
            bedrooms: project.specs.bedrooms,
            bathrooms: project.specs.bathrooms,
            foundationType: project.specs.foundationType,
            roofType: project.specs.roofType,
          } : undefined,
        },
        dueDate: dueDate ? new Date(dueDate) : undefined,
        expiresInDays,
      }

      const quoteRequests = await createQuoteRequest_Hybrid(input)
      
      if (quoteRequests.length === 0) {
        setError('Failed to create quote requests. Please try again.')
        return
      }

      // Generate email links
      const baseUrl = window.location.origin
      const emailLinks = quoteRequests.map(qr => ({
        ...qr,
        link: `${baseUrl}/vendor-quote/${qr.token}`,
      }))

      // TODO: Send emails with links
      // For now, we'll show the links to copy
      if (onSuccess) {
        onSuccess(emailLinks)
      } else {
        // Show success message with links
        const linksText = emailLinks.map(qr => 
          `${qr.vendorEmail}: ${qr.link}`
        ).join('\n')
        
        alert(`Quote requests created successfully!\n\nEmail links:\n${linksText}\n\n(Email functionality coming soon - copy these links for now)`)
        onClose()
      }
    } catch (err: any) {
      console.error('Error creating quote request:', err)
      setError(err.message || 'Failed to create quote requests. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Request Quote</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Project/Trade Info */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm font-medium text-gray-700 mb-1">Project: {project.name}</p>
              {trade && (
                <p className="text-sm text-gray-600">Trade: {trade.name}</p>
              )}
            </div>

            {/* Vendor Emails */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <Label>Vendor Email(s) *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddVendor}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Vendor
                </Button>
              </div>
              <div className="space-y-3">
                {vendorEmails.map((email, index) => (
                  <div key={index} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      <Label className="text-xs">Email *</Label>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => handleVendorEmailChange(index, e.target.value)}
                        placeholder="vendor@example.com"
                        required={index === 0}
                      />
                    </div>
                    <div className="col-span-5">
                      <Label className="text-xs">Name (Optional)</Label>
                      <Input
                        value={vendorNames[index] || ''}
                        onChange={(e) => handleVendorNameChange(index, e.target.value)}
                        placeholder="Vendor name"
                      />
                    </div>
                    <div className="col-span-2">
                      {vendorEmails.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveVendor(index)}
                        >
                          <X className="w-4 h-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Scope of Work */}
            <div>
              <Label htmlFor="scopeOfWork">Scope of Work *</Label>
              <textarea
                id="scopeOfWork"
                className="w-full min-h-[150px] px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0E79C9]"
                value={scopeOfWork}
                onChange={(e) => setScopeOfWork(e.target.value)}
                placeholder="Describe the work you need quoted..."
                required
              />
            </div>

            {/* Drawings */}
            <div>
              <Label htmlFor="drawings">Drawings & Documents (Single Combined PDF)</Label>
              <div className="mt-2">
                <Input
                  id="drawings"
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setDrawingsFile(e.target.files?.[0] || null)}
                />
                {drawingsFile && (
                  <p className="text-sm text-gray-600 mt-2 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {drawingsFile.name}
                  </p>
                )}
              </div>
            </div>

            {/* Due Date & Expiration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="dueDate">Quote Due Date (Optional)</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="expiresInDays">Link Expires In (Days)</Label>
                <Input
                  id="expiresInDays"
                  type="number"
                  min="1"
                  max="90"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(parseInt(e.target.value) || 30)}
                />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="flex gap-4 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-gradient-to-r from-[#0E79C9] to-[#0A5A96] hover:from-[#0A5A96] hover:to-[#084577]"
              >
                {submitting ? 'Creating...' : 'Create Quote Request'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

