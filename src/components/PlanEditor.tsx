// ============================================================================
// HSH GC Platform - Plan Editor
// ============================================================================
//
// Create and edit construction plans with document uploads
//

import React, { useState, useEffect } from 'react'
import { Plan, PlanDocument, PlanOption, CreatePlanInput, UpdatePlanInput, PlanOptionInput } from '@/types'
import { addPlanOption, deletePlanOption, addPlanDocument, deletePlanDocument, getPlanById } from '@/services/planService'
import { createPlan_Hybrid, updatePlan_Hybrid } from '@/services/planHybridService'
import { getAllEstimateTemplates, linkTemplateToPlan, unlinkTemplateFromPlan } from '@/services'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePageTitle } from '@/contexts/PageTitleContext'
import { ArrowLeft, Upload, FileText, Trash2, Plus, X, Eye } from 'lucide-react'

interface PlanEditorProps {
  plan?: Plan | null
  onBack: () => void
  onSave: (plan: Plan) => void
}

export function PlanEditor({ plan, onBack, onSave }: PlanEditorProps) {
  usePageTitle(plan ? 'Edit Plan' : 'Create Plan')
  const [formData, setFormData] = useState<CreatePlanInput>({
    planId: '',
    name: '',
    description: '',
    squareFootage: undefined,
    bedrooms: undefined,
    bathrooms: undefined,
    stories: undefined,
    garageSpaces: undefined,
    notes: '',
  })

  const [currentPlan, setCurrentPlan] = useState<Plan | null>(plan || null)
  const [estimateTemplates, setEstimateTemplates] = useState<any[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(plan?.estimateTemplateId)
  const [isAddingOption, setIsAddingOption] = useState(false)
  const [newOption, setNewOption] = useState<PlanOptionInput>({
    name: '',
    description: '',
    additionalCost: undefined,
    additionalSquareFootage: undefined,
  })

  const [uploadingFor, setUploadingFor] = useState<{ type: 'base' | 'option', optionId?: string } | null>(null)
  const [uploadForm, setUploadForm] = useState({
    name: '',
    type: 'floor-plan' as PlanDocument['type'],
    file: null as File | null,
    fileUrl: '',
    storageType: 'local-reference' as 'local-reference' | 'external-link',
    notes: '',
  })

  useEffect(() => {
    // Load estimate templates
    const loadTemplates = async () => {
      const templates = await getAllEstimateTemplates()
      setEstimateTemplates(templates)
    }
    loadTemplates()

    if (plan) {
      setFormData({
        planId: plan.planId,
        name: plan.name,
        description: plan.description,
        squareFootage: plan.squareFootage,
        bedrooms: plan.bedrooms,
        bathrooms: plan.bathrooms,
        stories: plan.stories,
        garageSpaces: plan.garageSpaces,
        notes: plan.notes,
      })
      setCurrentPlan(plan)
      setSelectedTemplateId(plan.estimateTemplateId)
    }
  }, [plan])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (currentPlan) {
      // Update existing plan
      const updates: UpdatePlanInput & { estimateTemplateId?: string } = {
        ...formData as UpdatePlanInput,
        estimateTemplateId: selectedTemplateId,
      }
      const updated = await updatePlan_Hybrid(currentPlan.id, updates)
      if (updated) {
        // Update template links
        if (selectedTemplateId && selectedTemplateId !== currentPlan.estimateTemplateId) {
          await linkTemplateToPlan(selectedTemplateId, updated.id)
          if (currentPlan.estimateTemplateId) {
            await unlinkTemplateFromPlan(currentPlan.estimateTemplateId, currentPlan.id)
          }
        } else if (!selectedTemplateId && currentPlan.estimateTemplateId) {
          await unlinkTemplateFromPlan(currentPlan.estimateTemplateId, currentPlan.id)
        }
        
        setCurrentPlan(updated)
        onSave(updated)
      }
    } else {
      // Create new plan
      const newPlan = await createPlan_Hybrid(formData)
      
      // Link template if selected
      if (selectedTemplateId) {
        const planWithTemplate = await updatePlan_Hybrid(newPlan.id, { estimateTemplateId: selectedTemplateId })
        if (planWithTemplate) {
          await linkTemplateToPlan(selectedTemplateId, planWithTemplate.id)
          setCurrentPlan(planWithTemplate)
          onSave(planWithTemplate)
        }
      } else {
        setCurrentPlan(newPlan)
        onSave(newPlan)
      }
    }
  }

  const handleAddOption = () => {
    if (!currentPlan || !newOption.name) return
    
    const option = addPlanOption(currentPlan.id, newOption)
    if (option) {
      setCurrentPlan({ ...currentPlan, options: [...currentPlan.options, option] })
      setNewOption({ name: '', description: '', additionalCost: undefined, additionalSquareFootage: undefined })
      setIsAddingOption(false)
    }
  }

  const handleDeleteOption = (optionId: string) => {
    if (!currentPlan) return
    
    if (deletePlanOption(currentPlan.id, optionId)) {
      setCurrentPlan({
        ...currentPlan,
        options: currentPlan.options.filter(o => o.id !== optionId)
      })
    }
  }

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentPlan || !uploadingFor) return
    if (!uploadForm.fileUrl && !uploadForm.file) {
      alert('Please provide either a file or external link')
      return
    }

    try {
      await addPlanDocument({
        planId: currentPlan.id,
        optionId: uploadingFor.optionId,
        name: uploadForm.name,
        type: uploadForm.type,
        file: uploadForm.file || undefined,
        fileUrl: uploadForm.fileUrl,
        fileName: uploadForm.file?.name,
        notes: uploadForm.notes,
      })

      // Reload the plan from storage to get the updated version
      const refreshedPlan = getPlanById(currentPlan.id)
      if (refreshedPlan) {
        setCurrentPlan(refreshedPlan)
      }
      
      setUploadingFor(null)
      setUploadForm({ name: '', type: 'floor-plan', file: null, fileUrl: '', storageType: 'local-reference', notes: '' })
    } catch (error) {
      console.error('Error uploading file:', error)
      alert('Failed to add document: ' + (error as Error).message)
    }
  }

  const handleDeleteDocument = (documentId: string, optionId?: string) => {
    if (!currentPlan) return
    
    if (deletePlanDocument(currentPlan.id, documentId, optionId)) {
      const updatedPlan = { ...currentPlan }
      if (optionId) {
        const option = updatedPlan.options.find(o => o.id === optionId)
        if (option) {
          option.documents = option.documents.filter(d => d.id !== documentId)
        }
      } else {
        updatedPlan.documents = updatedPlan.documents.filter(d => d.id !== documentId)
      }
      setCurrentPlan(updatedPlan)
    }
  }

  const documentTypeOptions = [
    { value: 'floor-plan', label: 'Floor Plan' },
    { value: 'elevation', label: 'Elevation' },
    { value: 'site-plan', label: 'Site Plan' },
    { value: 'foundation', label: 'Foundation' },
    { value: 'electrical', label: 'Electrical' },
    { value: 'plumbing', label: 'Plumbing' },
    { value: 'other', label: 'Other' },
  ]

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return 'Unknown size'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
      <button
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Library
      </button>

        {/* Basic Information */}
        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="planId">Plan ID *</Label>
                  <Input
                    id="planId"
                    value={formData.planId}
                    onChange={(e) => setFormData(prev => ({ ...prev, planId: e.target.value }))}
                    placeholder="e.g., 1416CN, Gunnison-29547"
                    required
                    disabled={!!currentPlan}
                  />
                </div>
                <div>
                  <Label htmlFor="name">Plan Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Gunnison, Colonial Model"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of the plan"
                />
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="squareFootage">Square Footage</Label>
                  <Input
                    id="squareFootage"
                    type="number"
                    value={formData.squareFootage || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, squareFootage: parseInt(e.target.value) || undefined }))}
                    placeholder="2400"
                  />
                </div>
                <div>
                  <Label htmlFor="bedrooms">Bedrooms</Label>
                  <Input
                    id="bedrooms"
                    type="number"
                    value={formData.bedrooms || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, bedrooms: parseInt(e.target.value) || undefined }))}
                    placeholder="3"
                  />
                </div>
                <div>
                  <Label htmlFor="bathrooms">Bathrooms</Label>
                  <Input
                    id="bathrooms"
                    type="number"
                    step="0.5"
                    value={formData.bathrooms || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, bathrooms: parseFloat(e.target.value) || undefined }))}
                    placeholder="2.5"
                  />
                </div>
                <div>
                  <Label htmlFor="stories">Stories</Label>
                  <Input
                    id="stories"
                    type="number"
                    value={formData.stories || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, stories: parseInt(e.target.value) || undefined }))}
                    placeholder="2"
                  />
                </div>
              </div>

              {/* Estimate Template Selection */}
              <div className="space-y-2">
                <Label htmlFor="estimate-template">Estimate Template</Label>
                <Select
                  value={selectedTemplateId || 'none'}
                  onValueChange={(value) => setSelectedTemplateId(value === 'none' ? undefined : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an estimate template (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Template</SelectItem>
                    {estimateTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {template.name} ({template.trades.length} items)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Link an estimate template to automatically populate costs when creating projects from this plan
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="garageSpaces">Garage Spaces</Label>
                  <Input
                    id="garageSpaces"
                    type="number"
                    value={formData.garageSpaces || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, garageSpaces: parseInt(e.target.value) || undefined }))}
                    placeholder="2"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Notes</Label>
                <textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes about this plan..."
                  className="w-full rounded-md border border-border/60 bg-card px-3 py-2"
                  rows={3}
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit">
                  {currentPlan ? 'Save Changes' : 'Create Plan'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {currentPlan && (
          <>
            {/* Base Plan Documents */}
            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Base Plan Documents</CardTitle>
                  <Button
                    onClick={() => {
                      console.log('Upload button clicked for base plan')
                      setUploadingFor({ type: 'base' })
                    }}
                    size="sm"
                    className=""
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Document
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {currentPlan.documents.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No documents uploaded yet. Click "Upload Document" to add plans.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {currentPlan.documents.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 p-3">
                        <div className="flex items-center space-x-3">
                          <FileText className="w-5 h-5 text-sky-500" />
                          <div>
                            <p className="font-medium">{doc.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {doc.type.replace('-', ' ')} • {formatFileSize(doc.fileSize)} • {doc.uploadedAt.toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(doc.fileUrl, '_blank')}
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDeleteDocument(doc.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Plan Options */}
            <Card className="border-border/60 bg-card/50">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Plan Options</CardTitle>
                  <Button
                    onClick={() => setIsAddingOption(true)}
                    size="sm"
                    className=""
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Option
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isAddingOption && (
                  <div className="mb-4 rounded-lg border border-border/60 bg-muted/20 p-4">
                    <div className="space-y-3">
                      <div>
                        <Label htmlFor="optionName">Option Name *</Label>
                        <Input
                          id="optionName"
                          value={newOption.name}
                          onChange={(e) => setNewOption(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="e.g., Finished Basement"
                        />
                      </div>
                      <div>
                        <Label htmlFor="optionDescription">Description</Label>
                        <Input
                          id="optionDescription"
                          value={newOption.description}
                          onChange={(e) => setNewOption(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="Brief description"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="additionalCost">Estimated Additional Cost</Label>
                          <Input
                            id="additionalCost"
                            type="number"
                            step="0.01"
                            value={newOption.additionalCost || ''}
                            onChange={(e) => setNewOption(prev => ({ ...prev, additionalCost: parseFloat(e.target.value) || undefined }))}
                            placeholder="25000"
                          />
                        </div>
                        <div>
                          <Label htmlFor="additionalSquareFootage">Additional Sq Ft</Label>
                          <Input
                            id="additionalSquareFootage"
                            type="number"
                            value={newOption.additionalSquareFootage || ''}
                            onChange={(e) => setNewOption(prev => ({ ...prev, additionalSquareFootage: parseInt(e.target.value) || undefined }))}
                            placeholder="1200"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setIsAddingOption(false)
                            setNewOption({ name: '', description: '', additionalCost: undefined })
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleAddOption}
                          disabled={!newOption.name}
                        >
                          Add Option
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {currentPlan.options.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    No options yet. Add options like "Finished Basement" or "3-Car Garage".
                  </p>
                ) : (
                  <div className="space-y-4">
                    {currentPlan.options.map((option) => (
                      <Card key={option.id} className="border-border/60 border-l-4 border-l-amber-500 bg-card/50">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-bold">{option.name}</h4>
                              {option.description && (
                                <p className="text-sm text-muted-foreground">{option.description}</p>
                              )}
                              <div className="flex gap-3 mt-1">
                                {option.additionalSquareFootage && (
                                  <p className="text-sm text-sky-600 dark:text-sky-400 font-medium">
                                    +{option.additionalSquareFootage.toLocaleString()} sq ft
                                  </p>
                                )}
                                {option.additionalCost && (
                                  <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                                    +${option.additionalCost.toLocaleString()}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setUploadingFor({ type: 'option', optionId: option.id })}
                              >
                                <Upload className="w-3 h-3 mr-1" />
                                Upload
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-destructive hover:text-destructive"
                                onClick={() => handleDeleteOption(option.id)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          {option.documents.length === 0 ? (
                            <p className="text-muted-foreground text-sm">No documents for this option</p>
                          ) : (
                            <div className="space-y-2">
                              {option.documents.map((doc) => (
                                <div key={doc.id} className="flex items-center justify-between rounded border border-border/60 bg-card p-2">
                                  <div className="flex items-center space-x-2">
                                    <FileText className="w-4 h-4 text-amber-500" />
                                    <div>
                                      <p className="text-sm font-medium">{doc.name}</p>
                                      <p className="text-xs text-muted-foreground">{formatFileSize(doc.fileSize)}</p>
                                    </div>
                                  </div>
                                  <div className="flex gap-1">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => window.open(doc.fileUrl, '_blank')}
                                    >
                                      <Eye className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-destructive hover:text-destructive"
                                      onClick={() => handleDeleteDocument(doc.id, option.id)}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      {/* Upload Modal */}
      {uploadingFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={(e) => {
          if (e.target === e.currentTarget) setUploadingFor(null)
        }}>
          <Card className="w-full max-w-lg border-border/60 bg-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Upload Document</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setUploadingFor(null)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleFileUpload} className="space-y-4">
                <div>
                  <Label htmlFor="docName">Document Name *</Label>
                  <Input
                    id="docName"
                    value={uploadForm.name}
                    onChange={(e) => setUploadForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Floor Plan - First Floor"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="docType">Document Type *</Label>
                  <Select 
                    value={uploadForm.type} 
                    onValueChange={(value) => setUploadForm(prev => ({ ...prev, type: value as any }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {documentTypeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={uploadForm.storageType === 'external-link' ? 'default' : 'outline'}
                      onClick={() => setUploadForm(prev => ({ ...prev, storageType: 'external-link', file: null }))}
                    >
                      External Link
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={uploadForm.storageType === 'local-reference' ? 'default' : 'outline'}
                      onClick={() => setUploadForm(prev => ({ ...prev, storageType: 'local-reference', fileUrl: '' }))}
                    >
                      File Reference
                    </Button>
                  </div>

                  {uploadForm.storageType === 'external-link' ? (
                    <div>
                      <Label htmlFor="fileUrl">Document Link *</Label>
                      <Input
                        id="fileUrl"
                        type="url"
                        value={uploadForm.fileUrl}
                        onChange={(e) => setUploadForm(prev => ({ ...prev, fileUrl: e.target.value }))}
                        placeholder="https://drive.google.com/... or https://dropbox.com/..."
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Paste a link to Google Drive, Dropbox, OneDrive, etc.
                      </p>
                    </div>
                  ) : (
                    <div>
                      <Label htmlFor="file">File Name Reference</Label>
                      <Input
                        id="file"
                        value={uploadForm.file?.name || ''}
                        onChange={(e) => {
                          // Create a fake file object for reference
                          const fileName = e.target.value
                          setUploadForm(prev => ({ 
                            ...prev, 
                            file: { name: fileName } as File 
                          }))
                        }}
                        placeholder="e.g., Gunnison_FloorPlan_v2.pdf"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Enter the file name for your records (file stored locally on your computer)
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="docNotes">Notes</Label>
                  <Input
                    id="docNotes"
                    value={uploadForm.notes}
                    onChange={(e) => setUploadForm(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Optional notes"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setUploadingFor(null)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={!uploadForm.name || (!uploadForm.fileUrl && !uploadForm.file)}
                  >
                    Add Document
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}


