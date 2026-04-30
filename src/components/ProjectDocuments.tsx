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
} from 'lucide-react'
import { usePageTitle } from '@/contexts/PageTitleContext'

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
  usePageTitle('Documents')
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
      <div className="flex items-center justify-between">
        {onBack ? (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Back to Project
          </button>
        ) : (
          <span />
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold whitespace-nowrap">Project Documents</h2>
        <Button
          onClick={() => setShowUploadForm(!showUploadForm)}
          className="flex items-center justify-center gap-2 w-auto"
        >
          <Upload className="h-4 w-4 shrink-0" />
          <span>Upload Document</span>
        </Button>
      </div>

      {/* Upload Form */}
      {showUploadForm && (
        <Card className="border-border/60 bg-card/50">
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
                <p className="text-sm text-muted-foreground mt-1">
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
        <Card className="border-border/60 bg-card/50">
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
        <Card className="border-border/60 bg-card/50">
          <CardContent className="p-6">
            <div className="text-center py-12">
              <FileText className="h-14 w-14 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-foreground font-medium mb-1">No documents uploaded yet.</p>
              <p className="text-muted-foreground text-sm mb-6">Click "Upload Document" to get started.</p>
              <Button onClick={() => setShowUploadForm(true)} size="sm">
                <Upload className="h-4 w-4 mr-2" />
                Upload Document
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(documentsByType).map(([type, docs]) => (
            <Card key={type} className="border-border/60 bg-card/50">
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
                      className="flex flex-col gap-3 p-3 border border-border/60 rounded-lg hover:bg-muted/20 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="flex-1 min-w-0 flex items-start gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <h4
                            className="text-sm font-medium text-foreground truncate"
                            title={doc.name}
                          >
                            {doc.name}
                          </h4>
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
                            <span>{formatFileSize(doc.fileSize)}</span>
                            <span>•</span>
                            <span>Uploaded {formatDate(doc.uploadedAt)}</span>
                            {doc.category && (
                              <>
                                <span>•</span>
                                <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded">
                                  {doc.category}
                                </span>
                              </>
                            )}
                          </div>
                          {doc.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{doc.description}</p>
                          )}
                          {doc.tags && doc.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {doc.tags.map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="text-[11px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2 flex-shrink-0 border-t border-border/60 pt-3 sm:border-t-0 sm:pt-0 sm:ml-4">
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
                          className="h-10 w-10 sm:h-8 sm:w-8 text-destructive hover:text-destructive"
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
    return (
      <Card className="border-border/60 bg-card/50">
        <CardContent className="py-12 text-center">
          <div className="mx-auto inline-block size-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Loading documents...</p>
        </CardContent>
      </Card>
    )
  }

  return <div className="flex flex-col gap-6 p-6">{content}</div>
}

