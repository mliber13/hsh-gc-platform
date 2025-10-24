// ============================================================================
// HSH GC Platform - Project Detail View
// ============================================================================
//
// Main view for a selected project with navigation to Estimate and Actuals
//

import React, { useState, useEffect } from 'react'
import { Project, ProjectType, ProjectStatus, Plan } from '@/types'
import { duplicateProject } from '@/services/projectService'
import { getTradesForEstimate_Hybrid, updateProject_Hybrid, deleteProject_Hybrid } from '@/services/hybridService'
import { getActivePlans_Hybrid } from '@/services/planHybridService'
import { getProjectActuals_Hybrid } from '@/services/actualsHybridService'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PROJECT_TYPES, PROJECT_STATUS } from '@/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, BookOpen, ClipboardList, Building2, Calendar, DollarSign, Edit, Trash2, Copy, FileText, FileCheck } from 'lucide-react'
import hshLogo from '/HSH Contractor Logo - Color.png'

interface ProjectDetailViewProps {
  project: Project
  onBack: () => void
  onViewEstimate: () => void
  onViewActuals: () => void
  onViewSchedule?: () => void
  onViewChangeOrders?: () => void
  onViewForms?: () => void
  onProjectDuplicated?: (newProject: Project) => void
}

export function ProjectDetailView({
  project,
  onBack,
  onViewEstimate,
  onViewActuals,
  onViewSchedule,
  onViewChangeOrders,
  onViewForms,
  onProjectDuplicated,
}: ProjectDetailViewProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedProject, setEditedProject] = useState(project)
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([])
  const [estimateTotals, setEstimateTotals] = useState({
    basePriceTotal: 0,
    grossProfitTotal: 0,
    totalEstimated: 0,
    itemCount: 0,
  })
  const [formsCount, setFormsCount] = useState(0)
  const [actualTotals, setActualTotals] = useState({
    laborCost: 0,
    materialCost: 0,
    subcontractorCost: 0,
    totalActual: 0,
  })

  // Load plans when editing mode is enabled
  useEffect(() => {
    if (isEditing) {
      const loadPlans = async () => {
        console.log('🔍 Loading plans for edit form...');
        const plans = await getActivePlans_Hybrid();
        console.log('📋 Plans loaded for edit:', plans.length, plans);
        setAvailablePlans(plans);
      };
      loadPlans();
    }
  }, [isEditing])
  
  // Calculate estimate totals from trades
  useEffect(() => {
    const loadTotals = async () => {
      const trades = await getTradesForEstimate_Hybrid(project.estimate.id)
      const basePriceTotal = trades.reduce((sum, trade) => sum + trade.totalCost, 0)
      const grossProfitTotal = trades.reduce((sum, trade) => {
        const markup = trade.markupPercent || 11.1
        return sum + (trade.totalCost * (markup / 100))
      }, 0)
      const contingency = basePriceTotal * 0.10 // 10% default
      const totalEstimated = basePriceTotal + grossProfitTotal + contingency
      
      setEstimateTotals({
        basePriceTotal,
        grossProfitTotal,
        totalEstimated,
        itemCount: trades.length,
      })
    }
    loadTotals()
  }, [project])

  // Load forms count
  useEffect(() => {
    const loadFormsCount = async () => {
      try {
        const { data, error } = await supabase
          .from('project_forms')
          .select('id')
          .eq('project_id', project.id)
        
        if (error) {
          console.error('Error loading forms count:', error)
          return
        }
        
        setFormsCount(data?.length || 0)
      } catch (error) {
        console.error('Error loading forms count:', error)
      }
    }
    
    if (project) {
      loadFormsCount()
    }
  }, [project])

  // Load actual costs from project actuals
  useEffect(() => {
    const loadActuals = async () => {
      const actuals = await getProjectActuals_Hybrid(project.id)
      if (actuals) {
        setActualTotals({
          laborCost: actuals.totalLaborCost,
          materialCost: actuals.totalMaterialCost,
          subcontractorCost: actuals.totalSubcontractorCost,
          totalActual: actuals.totalActualCost,
        })
      }
    }
    loadActuals()
  }, [project.id])
  
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const getStatusColor = (status: string) => {
    const colors = {
      estimating: 'bg-blue-100 text-blue-800',
      'in-progress': 'bg-orange-100 text-orange-800',
      complete: 'bg-green-100 text-green-800',
    }
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  const handleSaveEdit = async () => {
    console.log('💾 Saving project changes...');
    const updated = await updateProject_Hybrid(project.id, {
      id: project.id,
      name: editedProject.name,
      type: editedProject.type,
      status: editedProject.status,
      address: editedProject.address,
      city: editedProject.city,
      state: editedProject.state,
      zipCode: editedProject.zipCode,
      startDate: editedProject.startDate,
      endDate: editedProject.endDate,
      metadata: editedProject.metadata,
      client: editedProject.client,
    })
    
    console.log('✅ Project update result:', updated);
    
    if (updated) {
      setIsEditing(false)
      // Reload the page to show updated data
      window.location.reload()
    }
  }

  const handleDelete = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${project.name}"?\n\nThis action cannot be undone. All project data including estimates will be permanently deleted.`
    )

    if (confirmed) {
      console.log('🗑️ Deleting project:', project.id)
      const success = await deleteProject_Hybrid(project.id)
      if (success) {
        console.log('✅ Project deleted successfully')
        alert('✅ Project deleted successfully!')
        onBack() // Return to dashboard
      } else {
        console.error('❌ Failed to delete project')
        alert('❌ Failed to delete project. Please try again.')
      }
    }
  }

  const handleDuplicate = () => {
    const newName = prompt(`Enter name for the duplicated project:`, `${project.name} (Copy)`)
    
    if (newName && newName.trim()) {
      const newProject = duplicateProject(project.id, newName.trim())
      if (newProject) {
        alert('✅ Project duplicated successfully!')
        if (onProjectDuplicated) {
          onProjectDuplicated(newProject)
        }
      } else {
        alert('❌ Failed to duplicate project. Please try again.')
      }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 pb-20 sm:pb-0">
      {/* Header */}
      <header className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center space-x-3 sm:space-x-4">
              <img src={hshLogo} alt="HSH Contractor" className="h-16 sm:h-20 lg:h-24 w-auto" />
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-1">
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">{project.name}</h1>
                  <span className={`px-2 sm:px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)} w-fit`}>
                    {project.status.replace('-', ' ').toUpperCase()}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-gray-600">
                  {typeof project.address === 'string' ? project.address : project.address?.street || 'No address'}
                  {project.city && `, ${project.city}`}
                  {project.state && `, ${project.state}`}
                </p>
              </div>
            </div>
            {/* Desktop Buttons */}
            <div className="hidden sm:flex gap-3">
              <Button
                onClick={() => setIsEditing(true)}
                variant="outline"
                className="border-[#0E79C9] text-[#0E79C9] hover:bg-[#0E79C9] hover:text-white"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit Project
              </Button>
              <Button
                onClick={handleDuplicate}
                variant="outline"
                className="border-[#34AB8A] text-[#34AB8A] hover:bg-[#34AB8A] hover:text-white"
              >
                <Copy className="w-4 h-4 mr-2" />
                Duplicate Project
              </Button>
              <Button
                onClick={handleDelete}
                variant="outline"
                className="border-red-600 text-red-600 hover:bg-red-600 hover:text-white"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Project
              </Button>
              <Button
                onClick={onBack}
                variant="outline"
                className="border-gray-300 hover:bg-gray-50"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Projects
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Project Info Cards - Hidden on Mobile */}
        <div className="hidden sm:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <Card className="bg-white shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="text-sm text-gray-600">Plan ID</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-xl font-bold text-gray-900">
                      {project.metadata?.planId || 'N/A'}
                    </p>
                    {project.metadata?.isCustomPlan && (
                      <span className="text-xs bg-[#0E79C9] text-white px-2 py-0.5 rounded">
                        Custom
                      </span>
                    )}
                  </div>
                  {project.metadata?.planOptions && project.metadata.planOptions.length > 0 && (
                    <div className="mt-2">
                      {project.metadata.planOptions.map((option: string) => (
                        <span 
                          key={option}
                          className="inline-block text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded mr-1"
                        >
                          {option}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="bg-purple-100 rounded-full p-3">
                  <Building2 className="w-8 h-8 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Project Type</p>
                  <p className="text-xl font-bold text-gray-900 mt-1 capitalize">
                    {project.type.replace('-', ' ')}
                  </p>
                </div>
                <div className="bg-blue-100 rounded-full p-3">
                  <Building2 className="w-8 h-8 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Start Date</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">
                    {project.startDate ? project.startDate.toLocaleDateString() : 'Not set'}
                  </p>
                </div>
                <div className="bg-orange-100 rounded-full p-3">
                  <Calendar className="w-8 h-8 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-lg">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Estimated Value</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">
                    {formatCurrency(estimateTotals.totalEstimated)}
                  </p>
                </div>
                <div className="bg-green-100 rounded-full p-3">
                  <DollarSign className="w-8 h-8 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Navigation Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Estimate Book Card */}
          <Card className="bg-gradient-to-br from-[#213069] to-[#1a2550] text-white hover:shadow-2xl transition-all cursor-pointer border-none group">
            <button onClick={onViewEstimate} className="w-full text-left">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="bg-white/20 rounded-full p-3 group-hover:bg-white/30 transition-colors">
                    <BookOpen className="w-8 h-8" />
                  </div>
                  <div className="text-right">
                    <p className="text-sm opacity-80">Budget Items</p>
                    <p className="text-3xl font-bold">{estimateTotals.itemCount}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <h3 className="text-2xl font-bold mb-3">Estimate Book</h3>
                <p className="text-white/80 mb-4">
                  Build and manage your project budget, add line items, calculate costs, and set pricing.
                </p>
                <div className="bg-white/10 rounded-lg p-3 mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Base Price</span>
                    <span className="font-semibold">{formatCurrency(estimateTotals.basePriceTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Gross Profit</span>
                    <span className="font-semibold">{formatCurrency(estimateTotals.grossProfitTotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-white/20">
                    <span>Total</span>
                    <span>{formatCurrency(estimateTotals.totalEstimated)}</span>
                  </div>
                </div>
                <div className="flex items-center text-sm text-white/60">
                  <span>Click to view and edit estimate →</span>
                </div>
              </CardContent>
            </button>
          </Card>

          {/* Project Actuals Card */}
          <Card className="bg-gradient-to-br from-[#D95C00] to-[#B34C00] text-white hover:shadow-2xl transition-all cursor-pointer border-none group">
            <button onClick={onViewActuals} className="w-full text-left">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="bg-white/20 rounded-full p-3 group-hover:bg-white/30 transition-colors">
                    <ClipboardList className="w-8 h-8" />
                  </div>
                  <div className="text-right">
                    <p className="text-sm opacity-80">Status</p>
                    <p className="text-2xl font-bold capitalize">{project.status.replace('-', ' ')}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <h3 className="text-2xl font-bold mb-3">Project Actuals</h3>
                <p className="text-white/80 mb-4">
                  Track real costs and revenue as they occur. Compare actual spending against your budget in real-time.
                </p>
                <div className="bg-white/10 rounded-lg p-3 mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Actual Labor</span>
                    <span className="font-semibold">{formatCurrency(actualTotals.laborCost)}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Actual Materials</span>
                    <span className="font-semibold">{formatCurrency(actualTotals.materialCost)}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Actual Subcontractors</span>
                    <span className="font-semibold">{formatCurrency(actualTotals.subcontractorCost)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-white/20">
                    <span>Total Spent</span>
                    <span>{formatCurrency(actualTotals.totalActual)}</span>
                  </div>
                </div>
                <div className="flex items-center text-sm text-white/60">
                  <span>Click to track actuals →</span>
                </div>
              </CardContent>
            </button>
          </Card>

          {/* Project Schedule Card */}
          <Card className="bg-gradient-to-br from-[#34AB8A] to-[#2a8d6f] text-white hover:shadow-2xl transition-all cursor-pointer border-none group">
            <button onClick={onViewSchedule} className="w-full text-left">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="bg-white/20 rounded-full p-3 group-hover:bg-white/30 transition-colors">
                    <Calendar className="w-8 h-8" />
                  </div>
                  <div className="text-right">
                    <p className="text-sm opacity-80">Duration</p>
                    <p className="text-2xl font-bold">
                      {project.schedule?.duration || '--'} days
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <h3 className="text-2xl font-bold mb-3">Project Schedule</h3>
                <p className="text-white/80 mb-4">
                  Manage project timeline, set dates for each task, and track progress against schedule.
                </p>
                <div className="bg-white/10 rounded-lg p-3 mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Schedule Items</span>
                    <span className="font-semibold">{project.schedule?.items?.length || 0}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Progress</span>
                    <span className="font-semibold">{project.schedule?.percentComplete?.toFixed(0) || 0}%</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-white/20">
                    <span>Status</span>
                    <span>{project.schedule?.isOnSchedule ? 'On Track' : 'Needs Review'}</span>
                  </div>
                </div>
                <div className="flex items-center text-sm text-white/60">
                  <span>Click to manage schedule →</span>
                </div>
              </CardContent>
            </button>
          </Card>

          {/* Project Forms Card */}
          <Card className="bg-gradient-to-br from-[#8B5CF6] to-[#7C3AED] text-white hover:shadow-2xl transition-all cursor-pointer border-none group">
            <button onClick={onViewForms} className="w-full text-left">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="bg-white/20 rounded-full p-3 group-hover:bg-white/30 transition-colors">
                    <FileCheck className="w-8 h-8" />
                  </div>
                  <div className="text-right">
                    <p className="text-sm opacity-80">Forms</p>
                    <p className="text-2xl font-bold">{formsCount}</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <h3 className="text-2xl font-bold mb-3">Project Forms</h3>
                <p className="text-white/80 mb-4">
                  Complete project documentation including architect verification, site checklists, due diligence, and selections.
                </p>
                <div className="bg-white/10 rounded-lg p-3 mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Architect Verification</span>
                    <span className="font-semibold">Pending</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Site Checklist</span>
                    <span className="font-semibold">Pending</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Due Diligence</span>
                    <span className="font-semibold">Pending</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-white/20">
                    <span>Selections</span>
                    <span>Pending</span>
                  </div>
                </div>
                <div className="flex items-center text-sm text-white/60">
                  <span>Click to manage forms →</span>
                </div>
              </CardContent>
            </button>
          </Card>
        </div>

        {/* Secondary Action - Change Orders */}
        {onViewChangeOrders && (
          <div className="mb-6 sm:mb-8">
            <Button
              onClick={onViewChangeOrders}
              variant="outline"
              className="w-full border-purple-600 text-purple-600 hover:bg-purple-600 hover:text-white"
            >
              <FileText className="w-4 h-4 mr-2" />
              Manage Change Orders ({project.actuals?.changeOrders?.length || 0})
            </Button>
          </div>
        )}
      </main>
      
      {/* Edit Project Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>Edit Project Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="projectName">Project Name</Label>
                  <Input
                    id="projectName"
                    value={editedProject.name}
                    onChange={(e) => setEditedProject(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="planId">Plan ID</Label>
                    <Select
                      value={editedProject.metadata?.planId || '__none__'}
                      onValueChange={(value) => setEditedProject(prev => ({ 
                        ...prev, 
                        metadata: { ...prev.metadata, planId: value === '__none__' ? '' : value }
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a plan..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        <SelectItem value="custom">Custom Plan</SelectItem>
                        {availablePlans.map(plan => (
                          <SelectItem key={plan.id} value={plan.planId}>
                            {plan.name} - {plan.planId}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="projectType">Project Type</Label>
                    <Select 
                      value={editedProject.type} 
                      onValueChange={(value) => setEditedProject(prev => ({ ...prev, type: value as ProjectType }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PROJECT_TYPES).map(([key, value]) => (
                          <SelectItem key={key} value={key}>
                            {value.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="projectStatus">Status</Label>
                    <Select 
                      value={editedProject.status} 
                      onValueChange={(value) => setEditedProject(prev => ({ ...prev, status: value as ProjectStatus }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PROJECT_STATUS).map(([key, value]) => (
                          <SelectItem key={key} value={key}>
                            {value.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="address">Street Address</Label>
                  <Input
                    id="address"
                    value={editedProject.address?.street || ''}
                    onChange={(e) => setEditedProject(prev => ({ 
                      ...prev, 
                      address: { ...prev.address!, street: e.target.value }
                    }))}
                  />
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={editedProject.city || ''}
                      onChange={(e) => setEditedProject(prev => ({ 
                        ...prev, 
                        city: e.target.value,
                        address: { ...prev.address!, city: e.target.value }
                      }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={editedProject.state || ''}
                      onChange={(e) => setEditedProject(prev => ({ 
                        ...prev, 
                        state: e.target.value,
                        address: { ...prev.address!, state: e.target.value }
                      }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="zipCode">ZIP Code</Label>
                    <Input
                      id="zipCode"
                      value={editedProject.zipCode || ''}
                      onChange={(e) => setEditedProject(prev => ({ 
                        ...prev, 
                        zipCode: e.target.value,
                        address: { ...prev.address!, zip: e.target.value }
                      }))}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={editedProject.startDate ? new Date(editedProject.startDate).toISOString().split('T')[0] : ''}
                      onChange={(e) => setEditedProject(prev => ({ 
                        ...prev, 
                        startDate: e.target.value ? new Date(e.target.value) : undefined
                      }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="endDate">End Date</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={editedProject.endDate ? new Date(editedProject.endDate).toISOString().split('T')[0] : ''}
                      onChange={(e) => setEditedProject(prev => ({ 
                        ...prev, 
                        endDate: e.target.value ? new Date(e.target.value) : undefined
                      }))}
                    />
                  </div>
                </div>
                
                <div className="flex gap-2 pt-4">
                  <Button 
                    onClick={handleSaveEdit}
                    className="flex-1 bg-gradient-to-r from-[#0E79C9] to-[#0A5A96] hover:from-[#0A5A96] hover:to-[#084577]"
                  >
                    Save Changes
                  </Button>
                  <Button 
                    onClick={() => {
                      setIsEditing(false)
                      setEditedProject(project)
                    }}
                    variant="outline"
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Mobile Action Buttons - Fixed at bottom */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 shadow-lg z-40">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => setIsEditing(true)}
              variant="outline"
              className="border-[#0E79C9] text-[#0E79C9] hover:bg-[#0E79C9] hover:text-white"
            >
              <Edit className="w-4 h-4 mr-1" />
              Edit
            </Button>
            <Button
              onClick={handleDuplicate}
              variant="outline"
              className="border-[#34AB8A] text-[#34AB8A] hover:bg-[#34AB8A] hover:text-white"
            >
              <Copy className="w-4 h-4 mr-1" />
              Duplicate
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={handleDelete}
              variant="outline"
              className="border-red-600 text-red-600 hover:bg-red-600 hover:text-white"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </Button>
            <Button
              onClick={onBack}
              variant="outline"
              className="border-gray-300 hover:bg-gray-50"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

