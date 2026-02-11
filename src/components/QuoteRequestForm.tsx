// ============================================================================
// Quote Request Form
// ============================================================================
//
// Form to create quote requests for vendors
//

import React, { useEffect, useState } from 'react'
import {
  Project,
  Trade,
  Subcontractor as DirectorySubcontractor,
  Supplier as DirectorySupplier,
} from '@/types'
import { CreateQuoteRequestInput, QuoteVendorType } from '@/types/quote'
import { createQuoteRequest_Hybrid } from '@/services/hybridService'
import { sendQuoteRequestEmail, generateMailtoLink } from '@/services/emailService'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { X, Plus, FileText, Paperclip } from 'lucide-react'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
} from '@/components/ui/select'
import { fetchSubcontractors, fetchSuppliers } from '@/services/partnerDirectoryService'
import { fetchProjectDocuments } from '@/services/supabaseService'
import { TRADE_CATEGORIES } from '@/types/constants'
import { fetchSOWTemplates, formatSOWForQuoteRequest, incrementSOWTemplateUseCount } from '@/services/sowService'
import { buildVendorPortalLink } from '@/config/appConfig'
import { SOWTemplate } from '@/types/sow'
import type { ProjectDocument } from '@/types/project'

interface QuoteRequestFormProps {
  project: Project
  trade?: Trade | null
  onClose: () => void
  onSuccess?: (quoteRequests: any[]) => void
}

export function QuoteRequestForm({ project, trade, onClose, onSuccess }: QuoteRequestFormProps) {
  const [vendorEmails, setVendorEmails] = useState<string[]>([''])
  const [vendorNames, setVendorNames] = useState<string[]>([''])
  const [selectedDirectoryContacts, setSelectedDirectoryContacts] = useState<(string | null)[]>([null])
  const [vendorTypes, setVendorTypes] = useState<QuoteVendorType[]>(['subcontractor'])
  const [scopeOfWork, setScopeOfWork] = useState(trade ? `${trade.name}${trade.description ? `\n\n${trade.description}` : ''}` : '')
  const [drawingsFile, setDrawingsFile] = useState<File | null>(null)
  const [dueDate, setDueDate] = useState<string>('')
  const [expiresInDays, setExpiresInDays] = useState<number>(30)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [availableSubcontractors, setAvailableSubcontractors] = useState<DirectorySubcontractor[]>([])
  const [availableSuppliers, setAvailableSuppliers] = useState<DirectorySupplier[]>([])
  const [availableSOWTemplates, setAvailableSOWTemplates] = useState<SOWTemplate[]>([])
  const [selectedSOWTemplate, setSelectedSOWTemplate] = useState<string>('none')
  const [projectDocuments, setProjectDocuments] = useState<ProjectDocument[]>([])
  const [loadingProjectDocs, setLoadingProjectDocs] = useState(false)
  const [selectedProjectDocIds, setSelectedProjectDocIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const loadSubcontractors = async () => {
      try {
        const data = await fetchSubcontractors({ includeInactive: false })
        setAvailableSubcontractors(data)
      } catch (err) {
        console.warn('Unable to load subcontractor directory for quote requests:', err)
      }
    }

    const loadSuppliers = async () => {
      try {
        const data = await fetchSuppliers({ includeInactive: false })
        setAvailableSuppliers(data)
      } catch (err) {
        console.warn('Unable to load supplier directory for quote requests:', err)
      }
    }

    const loadSOWTemplates = async () => {
      try {
        // Filter by trade category if trade is selected
        const tradeCategory = trade?.category
        const data = await fetchSOWTemplates(tradeCategory)
        setAvailableSOWTemplates(data)
      } catch (err) {
        console.warn('Unable to load SOW templates for quote requests:', err)
      }
    }

    loadSubcontractors()
    loadSuppliers()
    loadSOWTemplates()
  }, [trade])

  useEffect(() => {
    const loadProjectDocs = async () => {
      setLoadingProjectDocs(true)
      try {
        const docs = await fetchProjectDocuments(project.id)
        setProjectDocuments(docs)
      } catch (err) {
        console.warn('Unable to load project documents for quote request:', err)
      } finally {
        setLoadingProjectDocs(false)
      }
    }
    loadProjectDocs()
  }, [project.id])

  const toggleProjectDoc = (docId: string) => {
    setSelectedProjectDocIds((prev) => {
      const next = new Set(prev)
      if (next.has(docId)) next.delete(docId)
      else next.add(docId)
      return next
    })
  }

  const handleAddVendor = () => {
    setVendorEmails([...vendorEmails, ''])
    setVendorNames([...vendorNames, ''])
    setSelectedDirectoryContacts([...selectedDirectoryContacts, null])
    setVendorTypes([...vendorTypes, 'subcontractor'])
  }

  const handleRemoveVendor = (index: number) => {
    if (vendorEmails.length > 1) {
      setVendorEmails(vendorEmails.filter((_, i) => i !== index))
      setVendorNames(vendorNames.filter((_, i) => i !== index))
      setSelectedDirectoryContacts(selectedDirectoryContacts.filter((_, i) => i !== index))
      setVendorTypes(vendorTypes.filter((_, i) => i !== index))
    }
  }

  const handleVendorEmailChange = (index: number, value: string) => {
    const updated = [...vendorEmails]
    updated[index] = value
    setVendorEmails(updated)
    const updatedSelected = [...selectedDirectoryContacts]
    updatedSelected[index] = null
    setSelectedDirectoryContacts(updatedSelected)
    const updatedTypes = [...vendorTypes]
    updatedTypes[index] = 'subcontractor'
    setVendorTypes(updatedTypes)
  }

  const handleVendorNameChange = (index: number, value: string) => {
    const updated = [...vendorNames]
    updated[index] = value
    setVendorNames(updated)
    const updatedSelected = [...selectedDirectoryContacts]
    updatedSelected[index] = null
    setSelectedDirectoryContacts(updatedSelected)
  }

  const handleVendorTypeChange = (index: number, type: QuoteVendorType) => {
    const updated = [...vendorTypes]
    updated[index] = type
    setVendorTypes(updated)
  }

  const handleSOWTemplateSelect = async (templateId: string) => {
    setSelectedSOWTemplate(templateId)
    
    if (templateId === 'none') {
      // Clear SOW if none selected
      return
    }

    const template = availableSOWTemplates.find(t => t.id === templateId)
    if (template) {
      // Format the SOW template as text and set it to scope of work
      const formattedSOW = formatSOWForQuoteRequest(template)
      setScopeOfWork(formattedSOW)
    }
  }

  const handleDirectoryContactSelect = (index: number, contactKey: string) => {
    const updatedSelected = [...selectedDirectoryContacts]

    if (contactKey === 'manual') {
      updatedSelected[index] = null
      setSelectedDirectoryContacts(updatedSelected)
      const updatedTypes = [...vendorTypes]
      updatedTypes[index] = 'subcontractor'
      setVendorTypes(updatedTypes)
      return
    }

    updatedSelected[index] = contactKey
    setSelectedDirectoryContacts(updatedSelected)

    const [type, id] = contactKey.split(':')
    const derivedType: QuoteVendorType = type === 'supplier' ? 'supplier' : 'subcontractor'
    const updatedTypes = [...vendorTypes]
    updatedTypes[index] = derivedType
    setVendorTypes(updatedTypes)
    const selected =
      type === 'supplier'
        ? availableSuppliers.find((supplier) => supplier.id === id)
        : availableSubcontractors.find((sub) => sub.id === id)

    if (selected) {
      const updatedNames = [...vendorNames]
      updatedNames[index] = selected.contactName?.trim() || selected.name
      setVendorNames(updatedNames)

      const updatedEmails = [...vendorEmails]
      updatedEmails[index] = selected.email || ''
      setVendorEmails(updatedEmails)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validation
    const sanitizedVendors = vendorEmails
      .map((email, index) => ({
        email: email.trim(),
        name: vendorNames[index]?.trim(),
        type: vendorTypes[index] || 'subcontractor',
      }))
      .filter(v => v.email)

    if (sanitizedVendors.length === 0) {
      setError('Please enter at least one vendor email')
      return
    }

    if (!scopeOfWork.trim()) {
      setError('Please enter scope of work')
      return
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    for (const vendor of sanitizedVendors) {
      if (!emailRegex.test(vendor.email)) {
        setError(`Invalid email format: ${vendor.email}`)
        return
      }
    }

    setSubmitting(true)

    try {
      const validEmails = sanitizedVendors.map(v => v.email)
      const alignedVendorNames = sanitizedVendors.map(v => v.name || '')
      const alignedVendorTypes = sanitizedVendors.map(v => v.type)

      // Resolve selected project documents to Files (fetch from signed URL and re-upload to quote-attachments)
      let attachmentFiles: File[] = []
      if (selectedProjectDocIds.size > 0) {
        const selectedDocs = projectDocuments.filter((d) => selectedProjectDocIds.has(d.id))
        for (const doc of selectedDocs) {
          if (!doc.fileUrl || !doc.fileUrl.startsWith('http')) continue
          try {
            const res = await fetch(doc.fileUrl)
            if (!res.ok) continue
            const blob = await res.blob()
            const file = new File([blob], doc.name, { type: doc.mimeType || 'application/octet-stream' })
            attachmentFiles.push(file)
          } catch (e) {
            console.warn('Failed to fetch project document for attachment:', doc.id, e)
          }
        }
      }

      const input: CreateQuoteRequestInput = {
        projectId: project.id,
        tradeId: trade?.id,
        vendorEmails: validEmails,
        vendorNames: alignedVendorNames,
        vendorTypes: alignedVendorTypes,
        scopeOfWork: scopeOfWork.trim(),
        drawingsFile: drawingsFile || undefined,
        attachmentFiles: attachmentFiles.length > 0 ? attachmentFiles : undefined,
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

      // Increment use count if a SOW template was used
      if (selectedSOWTemplate !== 'none') {
        try {
          await incrementSOWTemplateUseCount(selectedSOWTemplate)
        } catch (err) {
          console.warn('Failed to increment SOW template use count:', err)
          // Don't fail the whole operation if this fails
        }
      }

      // Generate email links and send emails
      const safeLinkForRequest = (token: string) => buildVendorPortalLink(token)
      const tradeCategoryLabel = trade?.category ? TRADE_CATEGORIES[trade.category]?.label : undefined
      const emailLinks = quoteRequests.map(qr => ({
        ...qr,
        link: safeLinkForRequest(qr.token),
      }))

      // Send emails to vendors
      const emailResults = await Promise.all(
        quoteRequests.map(async (qr, index) => {
          const vendorEntry = sanitizedVendors[index]
          const link = safeLinkForRequest(qr.token)
          const vendorName = vendorEntry?.name || undefined
          const emailSent = await sendQuoteRequestEmail({
            to: qr.vendorEmail,
            vendorName,
            projectName: project.name,
            tradeName: tradeCategoryLabel,
            quoteLink: link,
            scopeOfWork: scopeOfWork.trim(),
            dueDate: dueDate ? new Date(dueDate) : null,
            expiresAt: qr.expiresAt || null,
            attachmentUrls: qr.attachmentUrls?.length ? qr.attachmentUrls : undefined,
            attachmentNames: qr.attachmentNames?.length ? qr.attachmentNames : undefined,
          })

          return {
            email: qr.vendorEmail,
            name: vendorName,
            link,
            emailSent,
            mailtoLink: generateMailtoLink({
              to: qr.vendorEmail,
              vendorName,
              projectName: project.name,
              tradeName: tradeCategoryLabel,
              quoteLink: link,
              scopeOfWork: scopeOfWork.trim(),
              dueDate: dueDate ? new Date(dueDate) : null,
              expiresAt: qr.expiresAt || null,
            }),
          }
        })
      )

      // Check if any emails were sent successfully
      const emailsSent = emailResults.filter(r => r.emailSent).length
      const emailsFailed = emailResults.filter(r => !r.emailSent).length

      if (onSuccess) {
        onSuccess(emailLinks)
      } else {
        // Show success message with email status
        let message = `Quote requests created successfully!\n\n`
        
        if (emailsSent > 0) {
          message += `✅ ${emailsSent} email(s) sent successfully.\n\n`
        }
        
        if (emailsFailed > 0) {
          message += `⚠️ ${emailsFailed} email(s) could not be sent automatically.\n\n`
          message += `You can send them manually using these links:\n\n`
          emailResults
            .filter(r => !r.emailSent)
            .forEach(r => {
              message += `${r.name || r.email}: ${r.link}\n`
            })
        } else {
          message += `All quote request emails have been sent to vendors.`
        }
        
        alert(message)
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
                <p className="text-sm text-gray-600">Trade: {TRADE_CATEGORIES[trade.category]?.label || trade.category}</p>
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
                    <div className="col-span-4">
                      <Label className="text-xs">Email *</Label>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => handleVendorEmailChange(index, e.target.value)}
                        placeholder="vendor@example.com"
                        required={index === 0}
                      />
                    </div>
                    <div className="col-span-4">
                      <Label className="text-xs">Name (Optional)</Label>
                      {(availableSubcontractors.length > 0 || availableSuppliers.length > 0) && (
                        <div className="mb-1">
                          <Select
                            value={selectedDirectoryContacts[index] ?? 'manual'}
                            onValueChange={(value) => handleDirectoryContactSelect(index, value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select from directory..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="manual">Manual entry...</SelectItem>
                              {availableSubcontractors.length > 0 && (
                                <SelectGroup>
                                  <SelectLabel>Subcontractors</SelectLabel>
                                  {availableSubcontractors.map((sub) => (
                                    <SelectItem key={`sub-${sub.id}`} value={`sub:${sub.id}`}>
                                      {sub.name}
                                      {sub.trade ? ` • ${sub.trade}` : ''}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )}
                              {availableSuppliers.length > 0 && (
                                <SelectGroup>
                                  <SelectLabel>Suppliers</SelectLabel>
                                  {availableSuppliers.map((supplier) => (
                                    <SelectItem key={`supplier-${supplier.id}`} value={`supplier:${supplier.id}`}>
                                      {supplier.name}
                                      {supplier.category ? ` • ${supplier.category}` : ''}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <Input
                        value={vendorNames[index] || ''}
                        onChange={(e) => handleVendorNameChange(index, e.target.value)}
                        placeholder="Vendor name"
                      />
                      {selectedDirectoryContacts[index] && !vendorEmails[index] && (
                        <p className="text-[11px] text-orange-600 mt-1">
                          This contact does not have an email saved yet—please add one above.
                        </p>
                      )}
                    </div>
                    <div className="col-span-3">
                      <Label className="text-xs">Vendor Type</Label>
                      <Select
                        value={vendorTypes[index]}
                        onValueChange={(value) => handleVendorTypeChange(index, value as QuoteVendorType)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="subcontractor">Subcontractor</SelectItem>
                          <SelectItem value="supplier">Supplier</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-1">
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

            {/* SOW Template Selection */}
            {availableSOWTemplates.length > 0 && (
              <div>
                <Label htmlFor="sowTemplate">Use SOW Template (Optional)</Label>
                <Select value={selectedSOWTemplate} onValueChange={handleSOWTemplateSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a SOW template or build from scratch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Build from scratch</SelectItem>
                    {availableSOWTemplates.map(template => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name}
                        {template.tradeCategory && ` (${TRADE_CATEGORIES[template.tradeCategory]?.label || template.tradeCategory})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  Select a template to populate the scope of work, or build from scratch
                </p>
              </div>
            )}

            {/* Scope of Work */}
            <div>
              <Label htmlFor="scopeOfWork">Scope of Work *</Label>
              <textarea
                id="scopeOfWork"
                className="w-full min-h-[150px] px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#0E79C9]"
                value={scopeOfWork}
                onChange={(e) => {
                  setScopeOfWork(e.target.value)
                  // Clear selected template if user manually edits
                  if (selectedSOWTemplate !== 'none') {
                    setSelectedSOWTemplate('none')
                  }
                }}
                placeholder="Describe the work you need quoted... You can use a SOW template above or type from scratch."
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

            {/* Attach from project documents */}
            <div>
              <Label className="flex items-center gap-2">
                <Paperclip className="w-4 h-4" />
                Attach from project documents
              </Label>
              {loadingProjectDocs ? (
                <p className="text-sm text-gray-500 mt-2">Loading project documents...</p>
              ) : projectDocuments.length === 0 ? (
                <p className="text-sm text-gray-500 mt-2">No documents in this project yet. Upload docs in Project → Documents.</p>
              ) : (
                <div className="mt-2 border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2 bg-gray-50">
                  {projectDocuments.map((doc) => (
                    <label key={doc.id} className="flex items-center gap-3 cursor-pointer hover:bg-gray-100 rounded p-2 -m-2">
                      <input
                        type="checkbox"
                        checked={selectedProjectDocIds.has(doc.id)}
                        onChange={() => toggleProjectDoc(doc.id)}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm font-medium truncate flex-1">{doc.name}</span>
                      <span className="text-xs text-gray-500 capitalize">{doc.type.replace(/-/g, ' ')}</span>
                    </label>
                  ))}
                </div>
              )}
              {selectedProjectDocIds.size > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {selectedProjectDocIds.size} document(s) will be attached for vendors to download.
                </p>
              )}
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

