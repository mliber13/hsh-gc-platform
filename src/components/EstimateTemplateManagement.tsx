// ============================================================================
// Estimate Template Management Component
// ============================================================================
//
// Component for managing estimate templates
//

import React, { useEffect, useState } from 'react'
import {
  PlanEstimateTemplate,
  UpdatePlanEstimateTemplateInput,
} from '@/types/estimateTemplate'
import {
  getAllEstimateTemplates,
  updateEstimateTemplate,
  deleteEstimateTemplate,
} from '@/services/estimateTemplateService'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Edit, Trash2, ArrowLeft, FileText, TrendingUp, Link2, Settings } from 'lucide-react'
import hshLogo from '/HSH Contractor Logo - Color.png'
import { EstimateTemplateEditor } from './EstimateTemplateEditor'

interface EstimateTemplateManagementProps {
  onBack: () => void
}

export function EstimateTemplateManagement({ onBack }: EstimateTemplateManagementProps) {
  const [templates, setTemplates] = useState<PlanEstimateTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<PlanEstimateTemplate | null>(null)
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')

  // Load templates
  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    setLoading(true)
    try {
      const data = await getAllEstimateTemplates()
      setTemplates(data)
    } catch (error) {
      console.error('Error loading estimate templates:', error)
      alert('Failed to load estimate templates')
    } finally {
      setLoading(false)
    }
  }

  const handleEditTemplate = (template: PlanEstimateTemplate) => {
    setEditingTemplate(template)
    setFormName(template.name)
    setFormDescription(template.description || '')
    setShowEditDialog(true)
  }

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return
    if (!formName.trim()) {
      alert('Template name is required')
      return
    }

    setSaving(true)
    try {
      const updates: UpdatePlanEstimateTemplateInput = {
        name: formName.trim(),
        description: formDescription.trim() || undefined,
      }

      const updated = await updateEstimateTemplate(editingTemplate.id, updates)
      if (updated) {
        await loadTemplates()
        setShowEditDialog(false)
        setEditingTemplate(null)
      } else {
        alert('Failed to update template')
      }
    } catch (error) {
      console.error('Error updating template:', error)
      alert('Failed to update template')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template? This action cannot be undone.')) {
      return
    }

    setDeleting(templateId)
    try {
      const success = await deleteEstimateTemplate(templateId)
      if (success) {
        await loadTemplates()
      } else {
        alert('Failed to delete template')
      }
    } catch (error) {
      console.error('Error deleting template:', error)
      alert('Failed to delete template')
    } finally {
      setDeleting(null)
    }
  }

  const handleEditItems = (templateId: string) => {
    setEditingTemplateId(templateId)
  }

  const handleTemplateEditorBack = () => {
    setEditingTemplateId(null)
    loadTemplates() // Reload to get updated template
  }

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  // If editing template items, show editor instead
  if (editingTemplateId) {
    return (
      <EstimateTemplateEditor
        templateId={editingTemplateId}
        onBack={handleTemplateEditorBack}
        onSave={handleTemplateEditorBack}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <img src={hshLogo} alt="HSH Contractor" className="h-16 w-auto" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Estimate Templates</h1>
                <p className="text-sm text-gray-600">Manage your estimate templates</p>
              </div>
            </div>
            <Button onClick={onBack} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#0E79C9]"></div>
            <p className="mt-4 text-gray-500">Loading templates...</p>
          </div>
        ) : templates.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 text-lg mb-2">No estimate templates yet</p>
                <p className="text-gray-500 mb-6">
                  Create templates by saving estimates in the Estimate Builder
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => (
              <Card key={template.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg mb-1">{template.name}</CardTitle>
                      {template.description && (
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                          {template.description}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 ml-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditItems(template.id)}
                        className="h-8 px-2"
                        title="Edit Items"
                      >
                        <Settings className="w-4 h-4 mr-1" />
                        Edit Items
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditTemplate(template)}
                        className="h-8 w-8 p-0"
                        title="Edit Name/Description"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteTemplate(template.id)}
                        disabled={deleting === template.id}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        title="Delete Template"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <FileText className="w-4 h-4" />
                      <span>{template.trades.length} {template.trades.length === 1 ? 'trade' : 'trades'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <TrendingUp className="w-4 h-4" />
                      <span>Used {template.usageCount} {template.usageCount === 1 ? 'time' : 'times'}</span>
                    </div>
                    {template.linkedPlanIds.length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Link2 className="w-4 h-4" />
                        <span>Linked to {template.linkedPlanIds.length} {template.linkedPlanIds.length === 1 ? 'plan' : 'plans'}</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-gray-200">
                      <p className="text-xs text-gray-500">
                        Created: {formatDate(template.createdAt)}
                      </p>
                      {template.updatedAt.getTime() !== template.createdAt.getTime() && (
                        <p className="text-xs text-gray-500">
                          Updated: {formatDate(template.updatedAt)}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Template</DialogTitle>
            <DialogDescription>
              Update the template name and description
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="template-name">Template Name</Label>
              <Input
                id="template-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Enter template name"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="template-description">Description</Label>
              <Textarea
                id="template-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Enter template description (optional)"
                className="mt-1"
                rows={3}
              />
            </div>
            {editingTemplate && (
              <div className="text-sm text-gray-600 space-y-1 pt-2 border-t">
                <p>Trades: {editingTemplate.trades.length}</p>
                <p>Usage Count: {editingTemplate.usageCount}</p>
                {editingTemplate.linkedPlanIds.length > 0 && (
                  <p>Linked Plans: {editingTemplate.linkedPlanIds.length}</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveTemplate} disabled={saving || !formName.trim()}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
