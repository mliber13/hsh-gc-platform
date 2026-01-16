// ============================================================================
// HSH GC Platform - Deal Documents Component
// ============================================================================
//
// Component for managing deal documents (proposals, contracts, plans, etc.)
//

import React, { useState, useEffect } from 'react'
import { DealDocument, DealDocumentType } from '@/types/deal'
import {
  uploadDealDocument,
  fetchDealDocuments,
  deleteDealDocument,
  updateDealDocument,
} from '@/services/supabaseService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  FileText,
  Upload,
  Trash2,
  Download,
  Edit,
  X,
  Save,
  Eye,
} from 'lucide-react'

interface DealDocumentsProps {
  dealId: string
}

const DOCUMENT_TYPE_LABELS: Record<DealDocumentType, string> = {
  proposal: 'Proposal',
  contract: 'Contract',
  plan: 'Plan',
  specification: 'Specification',
  permit: 'Permit',
  'financial-document': 'Financial Document',
  photo: 'Photo',
  other: 'Other',
}

export function DealDocuments({ dealId }: DealDocumentsProps) {
  const [documents, setDocuments] = useState<DealDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [editingDoc, setEditingDoc] = useState<DealDocument | null>(null)
  
  // Upload form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [documentType, setDocumentType] = useState<DealDocumentType>('other')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [tags, setTags] = useState('')

  // Load documents
  useEffect(() => {
    loadDocuments()
  }, [dealId])

  const loadDocuments = async () => {
    setLoading(true)
    try {
      const docs = await fetchDealDocuments(dealId)
      setDocuments(docs)
    } catch (error) {
      console.error('Error loading documents:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      // Auto-set document type based on filename if not already set
      if (documentType === 'other') {
        const name = file.name.toLowerCase()
        if (name.includes('proposal')) {
          setDocumentType('proposal')
        } else if (name.includes('contract') || name.includes('agreement')) {
          setDocumentType('contract')
        } else if (name.includes('plan') || name.includes('drawing')) {
          setDocumentType('plan')
        } else if (name.includes('spec')) {
          setDocumentType('specification')
        } else if (name.includes('permit')) {
          setDocumentType('permit')
        } else if (name.includes('financial') || name.includes('budget') || name.includes('cost')) {
          setDocumentType('financial-document')
        }
      }
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      alert('Please select a file to upload')
      return
    }

    setUploading(true)
    try {
      const tagsArray = tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)

      const doc = await uploadDealDocument(
        selectedFile,
        dealId,
        documentType,
        description || undefined,
        category || undefined,
        tagsArray.length > 0 ? tagsArray : undefined
      )

      if (doc) {
        await loadDocuments()
        // Reset form
        setSelectedFile(null)
        setDocumentType('other')
        setDescription('')
        setCategory('')
        setTags('')
        setShowUploadForm(false)
        alert('Document uploaded successfully!')
      } else {
        alert('Failed to upload document. Please try again.')
      }
    } catch (error) {
      console.error('Error uploading document:', error)
      alert('Error uploading document. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (doc: DealDocument) => {
    if (!confirm(`Are you sure you want to delete "${doc.name}"?`)) {
      return
    }

    try {
      const success = await deleteDealDocument(doc.id)
      if (success) {
        await loadDocuments()
        alert('Document deleted successfully!')
      } else {
        alert('Failed to delete document. Please try again.')
      }
    } catch (error) {
      console.error('Error deleting document:', error)
      alert('Error deleting document. Please try again.')
    }
  }

  const handleEdit = (doc: DealDocument) => {
    setEditingDoc(doc)
    setDocumentType(doc.type)
    setDescription(doc.description || '')
    setCategory(doc.category || '')
    setTags(doc.tags?.join(', ') || '')
  }

  const handleSaveEdit = async () => {
    if (!editingDoc) return

    try {
      const tagsArray = tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0)

      const updated = await updateDealDocument(editingDoc.id, {
        type: documentType,
        description: description || undefined,
        category: category || undefined,
        tags: tagsArray.length > 0 ? tagsArray : undefined,
      })

      if (updated) {
        await loadDocuments()
        setEditingDoc(null)
        setDescription('')
        setCategory('')
        setTags('')
        alert('Document updated successfully!')
      } else {
        alert('Failed to update document. Please try again.')
      }
    } catch (error) {
      console.error('Error updating document:', error)
      alert('Error updating document. Please try again.')
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  // Group documents by type
  const documentsByType = documents.reduce((acc, doc) => {
    if (!acc[doc.type]) {
      acc[doc.type] = []
    }
    acc[doc.type].push(doc)
    return acc
  }, {} as Record<DealDocumentType, DealDocument[]>)

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-gray-500">Loading documents...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header with Upload Button */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Deal Documents</h2>
        <Button
          onClick={() => setShowUploadForm(!showUploadForm)}
          className="flex items-center gap-2"
        >
          <Upload className="h-4 w-4" />
          Upload Document
        </Button>
      </div>

      {/* Upload Form */}
      {showUploadForm && (
        <Card>
          <CardHeader>
            <CardTitle>Upload New Document</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="file">File</Label>
              <Input
                id="file"
                type="file"
                onChange={handleFileSelect}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.zip,.txt,.csv"
              />
              {selectedFile && (
                <p className="text-sm text-gray-500 mt-1">
                  Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="documentType">Document Type</Label>
              <Select
                value={documentType}
                onValueChange={(value) => setDocumentType(value as DealDocumentType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="description">Description (Optional)</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the document"
              />
            </div>

            <div>
              <Label htmlFor="category">Category (Optional)</Label>
              <Input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., Legal, Financial, Technical"
              />
            </div>

            <div>
              <Label htmlFor="tags">Tags (Optional, comma-separated)</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g., urgent, final, draft"
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleUpload}
                disabled={!selectedFile || uploading}
                className="flex-1"
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowUploadForm(false)
                  setSelectedFile(null)
                  setDocumentType('other')
                  setDescription('')
                  setCategory('')
                  setTags('')
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Form */}
      {editingDoc && (
        <Card>
          <CardHeader>
            <CardTitle>Edit Document: {editingDoc.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="editType">Document Type</Label>
              <Select
                value={documentType}
                onValueChange={(value) => setDocumentType(value as DealDocumentType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="editDescription">Description</Label>
              <Input
                id="editDescription"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the document"
              />
            </div>

            <div>
              <Label htmlFor="editCategory">Category</Label>
              <Input
                id="editCategory"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g., Legal, Financial, Technical"
              />
            </div>

            <div>
              <Label htmlFor="editTags">Tags (comma-separated)</Label>
              <Input
                id="editTags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="e.g., urgent, final, draft"
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSaveEdit} className="flex-1">
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setEditingDoc(null)
                  setDescription('')
                  setCategory('')
                  setTags('')
                }}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Documents List */}
      {documents.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <div className="text-center text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>No documents uploaded yet.</p>
              <p className="text-sm mt-2">Click "Upload Document" to get started.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(documentsByType).map(([type, docs]) => (
            <Card key={type}>
              <CardHeader>
                <CardTitle className="text-lg">
                  {DOCUMENT_TYPE_LABELS[type as DealDocumentType]} ({docs.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {docs.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-start justify-between p-3 border rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-900 truncate">
                              {doc.name}
                            </h4>
                            <div className="flex flex-wrap gap-2 mt-1 text-sm text-gray-500">
                              <span>{formatFileSize(doc.fileSize)}</span>
                              <span>•</span>
                              <span>Uploaded {formatDate(doc.uploadedAt)}</span>
                              {doc.category && (
                                <>
                                  <span>•</span>
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                                    {doc.category}
                                  </span>
                                </>
                              )}
                            </div>
                            {doc.description && (
                              <p className="text-sm text-gray-600 mt-1">{doc.description}</p>
                            )}
                            {doc.tags && doc.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {doc.tags.map((tag, idx) => (
                                  <span
                                    key={idx}
                                    className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(doc.fileUrl, '_blank')}
                          title="View Document"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const link = document.createElement('a')
                            link.href = doc.fileUrl
                            link.download = doc.name
                            link.click()
                          }}
                          title="Download Document"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(doc)}
                          title="Edit Document"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(doc)}
                          title="Delete Document"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
