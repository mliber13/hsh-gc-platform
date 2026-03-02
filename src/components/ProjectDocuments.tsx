// ============================================================================
// HSH GC Platform - Project Documents Component
// ============================================================================
//
// Component for managing project documents (contracts, SOWs, agreements, etc.)
//

import React, { useState, useEffect } from 'react'
import { ProjectDocument, DocumentType } from '@/types'
import {
  uploadProjectDocument,
  fetchProjectDocuments,
  deleteProjectDocument,
  updateProjectDocument,
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
  ArrowLeft,
  ChevronDown,
} from 'lucide-react'
import hshLogo from '/HSH Contractor Logo - Color.png'

interface ProjectDocumentsProps {
  projectId: string
  /** When provided, renders full-page dashboard-style layout with header and back */
  onBack?: () => void
  projectName?: string
}

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  contract: 'Contract',
  plan: 'Plan',
  specification: 'Specification',
  permit: 'Permit',
  invoice: 'Invoice',
  'change-order': 'Change Order',
  rfi: 'RFI',
  submittal: 'Submittal',
  inspection: 'Inspection',
  warranty: 'Warranty',
  photo: 'Photo',
  'subcontractor-agreement': 'Subcontractor Agreement',
  'scope-of-work-signoff': 'Scope of Work Sign-off',
  other: 'Other',
}

export function ProjectDocuments({ projectId, onBack, projectName }: ProjectDocumentsProps) {
  const [documents, setDocuments] = useState<ProjectDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [editingDoc, setEditingDoc] = useState<ProjectDocument | null>(null)
  
  // Upload form state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [documentType, setDocumentType] = useState<DocumentType>('other')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [tags, setTags] = useState('')
  const [showMobileActions, setShowMobileActions] = useState(false)

  // Load documents
  useEffect(() => {
    loadDocuments()
  }, [projectId])

  const loadDocuments = async () => {
    setLoading(true)
    try {
      const docs = await fetchProjectDocuments(projectId)
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
        if (name.includes('contract') || name.includes('agreement')) {
          setDocumentType('subcontractor-agreement')
        } else if (name.includes('sow') || name.includes('scope') || name.includes('sign')) {
          setDocumentType('scope-of-work-signoff')
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

      const doc = await uploadProjectDocument(
        selectedFile,
        projectId,
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

  const handleDelete = async (doc: ProjectDocument) => {
    if (!confirm(`Are you sure you want to delete "${doc.name}"?`)) {
      return
    }

    try {
      const success = await deleteProjectDocument(doc.id)
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

  const handleEdit = (doc: ProjectDocument) => {
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

      const updated = await updateProjectDocument(editingDoc.id, {
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
  }, {} as Record<DocumentType, ProjectDocument[]>)

  const content = (
    <>
      {/* Header with Upload Button - hidden on mobile (use Actions menu at bottom) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-gray-900 sm:text-2xl whitespace-nowrap">Project Documents</h2>
        <Button
          onClick={() => setShowUploadForm(!showUploadForm)}
          className="hidden sm:flex items-center justify-center gap-2 w-auto"
        >
          <Upload className="h-4 w-4 shrink-0" />
          <span>Upload Document</span>
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
                onValueChange={(value) => setDocumentType(value as DocumentType)}
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
                onValueChange={(value) => setDocumentType(value as DocumentType)}
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
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-6">
            <div className="text-center py-12">
              <FileText className="h-14 w-14 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-700 font-medium mb-1">No documents uploaded yet.</p>
              <p className="text-gray-500 text-sm mb-6">Click "Upload Document" to get started.</p>
              <Button onClick={() => setShowUploadForm(true)} size="sm" className="bg-[#0E79C9] hover:bg-[#0A5A96]">
                <Upload className="h-4 w-4 mr-2" />
                Upload Document
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(documentsByType).map(([type, docs]) => (
            <Card key={type} className="border-gray-200 shadow-sm">
              <CardHeader className="py-3 sm:py-4">
                <CardTitle className="text-base font-semibold">
                  {DOCUMENT_TYPE_LABELS[type as DocumentType]} ({docs.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm">
                <div className="space-y-3">
                  {docs.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex flex-col gap-3 p-3 border rounded-lg hover:bg-gray-50 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="flex-1 min-w-0 flex items-start gap-2">
                        <FileText className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <h4
                            className="text-sm font-medium text-gray-900 truncate"
                            title={doc.name}
                          >
                            {doc.name}
                          </h4>
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-xs text-gray-500">
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
                            <p className="text-xs text-gray-600 mt-0.5">{doc.description}</p>
                          )}
                          {doc.tags && doc.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {doc.tags.map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="text-[11px] px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2 flex-shrink-0 border-t border-gray-100 pt-3 sm:border-t-0 sm:pt-0 sm:ml-4">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 sm:h-8 sm:w-8"
                          onClick={() => window.open(doc.fileUrl, '_blank')}
                          title="View Document"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 sm:h-8 sm:w-8"
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
                          size="icon"
                          className="h-10 w-10 sm:h-8 sm:w-8"
                          onClick={() => handleEdit(doc)}
                          title="Edit Document"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 sm:h-8 sm:w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDelete(doc)}
                          title="Delete Document"
                        >
                          <Trash2 className="h-4 w-4" />
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
    </>
  )

  if (loading) {
    const loadingBlock = (
      <Card className="border-gray-200 shadow-sm">
        <CardContent className="py-12">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-[#0E79C9]"></div>
            <p className="mt-4 text-gray-500 text-sm">Loading documents...</p>
          </div>
        </CardContent>
      </Card>
    )
    if (onBack) {
      return (
        <div className="min-h-screen bg-gray-50">
          <header className="bg-white border-b border-gray-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <img src={hshLogo} alt="HSH Contractor" className="h-16 sm:h-20 lg:h-24 w-auto shrink-0" />
                  <div className="min-w-0">
                    <h1 className="text-xl font-semibold text-gray-900 truncate">Project Documents</h1>
                    {projectName && <p className="text-xs text-gray-500 hidden sm:block truncate">{projectName}</p>}
                  </div>
                </div>
                <Button variant="outline" onClick={onBack} size="sm">
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  Back
                </Button>
              </div>
            </div>
          </header>
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 sm:pb-8">
            {loadingBlock}
          </main>
        </div>
      )
    }
    return loadingBlock
  }

  if (onBack) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <img src={hshLogo} alt="HSH Contractor" className="h-16 sm:h-20 lg:h-24 w-auto shrink-0" />
                <div className="min-w-0">
                  <h1 className="text-xl font-semibold text-gray-900 truncate">Project Documents</h1>
                  {projectName && <p className="text-xs text-gray-500 hidden sm:block truncate">{projectName}</p>}
                </div>
              </div>
              <nav className="hidden sm:flex items-center gap-1 shrink-0">
                <Button variant="outline" onClick={onBack} size="sm">
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  Back
                </Button>
              </nav>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 sm:pb-8 space-y-4">
          {content}
        </main>
        {/* Mobile: bottom action bar - match Projects Dashboard */}
        <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40 safe-area-pb">
          {showMobileActions && (
            <div className="border-b border-gray-100 px-3 py-2 bg-gray-50 max-h-72 overflow-y-auto">
              <button
                onClick={() => { onBack(); setShowMobileActions(false) }}
                className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 hover:bg-white text-gray-700"
              >
                <ArrowLeft className="w-5 h-5 text-gray-400" />
                <span className="font-medium">Back to Project</span>
              </button>
              <button
                onClick={() => { setShowUploadForm(true); setShowMobileActions(false) }}
                className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 hover:bg-white border border-[#0E79C9]/20 bg-[#0E79C9]/5"
              >
                <Upload className="w-5 h-5 text-[#0E79C9]" />
                <div>
                  <p className="font-medium text-gray-900">Upload Document</p>
                  <p className="text-xs text-gray-500">Add a document to this project</p>
                </div>
              </button>
            </div>
          )}
          <div className="p-2">
            <Button
              onClick={() => setShowMobileActions(!showMobileActions)}
              variant="outline"
              className="w-full h-11 border-gray-200 bg-white hover:bg-gray-50"
            >
              <span className="flex items-center justify-center gap-2 text-gray-700">
                Actions
                <ChevronDown className={`w-4 h-4 transition-transform ${showMobileActions ? 'rotate-180' : ''}`} />
              </span>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return <div className="space-y-4">{content}</div>
}

