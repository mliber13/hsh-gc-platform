// ============================================================================
// Estimate Builder Component
// ============================================================================
//
// Main component for building estimates, matching the Excel "Estimate Book" structure
//

import React, { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import hshLogo from '/HSH Contractor Logo - Color.png'
import { PrintableReport, ReportDepth } from './PrintableReport'
import {
  Project,
  Estimate,
  Trade,
  TradeInput,
  UnitType,
  TRADE_CATEGORIES,
  UNIT_TYPES,
  DEFAULT_VALUES,
  PROJECT_TYPES,
} from '@/types'
import {
  createProject,
  updateProject,
  addTrade,
  updateTrade,
  deleteTrade,
  recalculateEstimate,
  getTradesForEstimate,
  getItemTemplatesByCategory,
  createEstimateTemplate,
} from '@/services'
import {
  addTrade_Hybrid,
  updateTrade_Hybrid,
  deleteTrade_Hybrid,
  getTradesForEstimate_Hybrid,
} from '@/services/hybridService'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { 
  Edit, 
  Trash2, 
  PlusCircle, 
  Info, 
  Building, 
  MapPin, 
  Calendar, 
  DollarSign, 
  Percent, 
  Calculator, 
  ClipboardList, 
  Users, 
  Tag, 
  Ruler, 
  Hammer, 
  Package, 
  HardHat, 
  FileText, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  ChevronDown, 
  ChevronUp,
  ArrowLeft,
  Printer,
  Save
} from 'lucide-react'

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

interface EstimateBuilderProps {
  project?: Project | null
  onSave?: (project: Project) => void
  onBack?: () => void
}

interface TradeFormData extends TradeInput {
  id?: string
  isEditing?: boolean
}

// ----------------------------------------------------------------------------
// Main Component
// ----------------------------------------------------------------------------

export function EstimateBuilder({ project, onSave, onBack }: EstimateBuilderProps) {
  // State
  const [projectData, setProjectData] = useState<Project | null>(project || null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [editingTrade, setEditingTrade] = useState<TradeFormData | null>(null)
  const [isAddingTrade, setIsAddingTrade] = useState(false)
  const [markupPercent, setMarkupPercent] = useState(11.1)
  const [contingencyPercent, setContingencyPercent] = useState(10)
  const [showPrintReport, setShowPrintReport] = useState(false)
  const [reportDepth, setReportDepth] = useState<ReportDepth>('full')
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateDescription, setTemplateDescription] = useState('')

  // Initialize project if none provided
  useEffect(() => {
    if (!projectData) {
      const newProject = createProject({
        name: 'New Project',
        client: { name: 'New Client' },
        type: 'residential-new-build',
      })
      setProjectData(newProject)
    }
  }, [projectData])

  // Load trades when project changes
  useEffect(() => {
    if (projectData) {
      getTradesForEstimate_Hybrid(projectData.estimate.id).then(loadedTrades => {
        setTrades(loadedTrades)
      })
    }
  }, [projectData])

  // Update estimate totals whenever trades, markup, or contingency change
  useEffect(() => {
    if (!projectData) return
    
    const totals = calculateTotals()
    
    // Check if totals have actually changed
    const currentTotals = projectData.estimate.totals
    const hasChanged = !currentTotals ||
      currentTotals.basePriceTotal !== totals.basePriceTotal ||
      currentTotals.contingency !== totals.contingency ||
      currentTotals.grossProfitTotal !== totals.grossProfitTotal ||
      currentTotals.totalEstimated !== totals.totalEstimated ||
      currentTotals.marginOfProfit !== totals.marginOfProfit
    
    if (hasChanged) {
      // Update the estimate in storage with the new totals
      const updatedEstimate = {
        ...projectData.estimate,
        totals: {
          basePriceTotal: totals.basePriceTotal,
          contingency: totals.contingency,
          grossProfitTotal: totals.grossProfitTotal,
          totalEstimated: totals.totalEstimated,
          marginOfProfit: totals.marginOfProfit,
        },
        subtotal: totals.basePriceTotal,
        overhead: 0,
        profit: totals.grossProfitTotal,
        contingency: totals.contingency,
        totalEstimate: totals.totalEstimated,
        updatedAt: new Date(),
      }
      
      // Update project with new estimate
      updateProject(projectData.id, {
        estimate: updatedEstimate,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, markupPercent, contingencyPercent])

  // ----------------------------------------------------------------------------
  // Event Handlers
  // ----------------------------------------------------------------------------

  const handleProjectUpdate = (updates: Partial<Project>) => {
    if (!projectData) return

    const updated = updateProject(projectData.id, updates)
    if (updated) {
      setProjectData(updated)
      onSave?.(updated)
    }
  }

  const handleAddTrade = () => {
    setEditingTrade({
      category: 'planning' as any,
      name: '',
      quantity: 1,
      unit: 'each',
      laborCost: 0,
      materialCost: 0,
      subcontractorCost: 0,
      isSubcontracted: false,
      wasteFactor: DEFAULT_VALUES.WASTE_FACTOR,
      markupPercent: markupPercent,
      isEditing: true,
    })
    setIsAddingTrade(true)
  }

  const handleEditTrade = (trade: Trade) => {
    setEditingTrade({
      id: trade.id,
      category: trade.category,
      name: trade.name,
      description: trade.description,
      quantity: trade.quantity,
      unit: trade.unit,
      laborCost: trade.laborCost,
      laborRate: trade.laborRate,
      laborHours: trade.laborHours,
      materialCost: trade.materialCost,
      materialRate: trade.materialRate,
      subcontractorCost: trade.subcontractorCost,
      isSubcontracted: trade.isSubcontracted,
      wasteFactor: trade.wasteFactor,
      markupPercent: trade.markupPercent || markupPercent,
      notes: trade.notes,
      isEditing: true,
    })
    setIsAddingTrade(false)
  }

  const handleSaveTrade = async (tradeData: TradeFormData) => {
    if (!projectData) {
      console.error('No project data available')
      return
    }

    console.log('Saving trade:', tradeData)

    try {
      let updatedTrade: Trade

      if (isAddingTrade) {
        // Add new trade
        console.log('Adding new trade to estimate:', projectData.estimate.id)
        updatedTrade = await addTrade_Hybrid(projectData.estimate.id, tradeData)
        console.log('Trade added successfully:', updatedTrade)
        setTrades(prev => [...prev, updatedTrade])
      } else {
        // Update existing trade
        if (!tradeData.id) {
          console.error('No trade ID for update')
          return
        }
        
        console.log('Updating trade:', tradeData.id)
        const result = await updateTrade_Hybrid(tradeData.id, tradeData)
        if (!result) {
          console.error('Failed to update trade')
          return
        }
        updatedTrade = result
        console.log('Trade updated successfully:', updatedTrade)
        setTrades(prev => prev.map(t => t.id === tradeData.id ? updatedTrade! : t))
      }

      // Reload trades from storage to ensure we have the latest
      const reloadedTrades = await getTradesForEstimate_Hybrid(projectData.estimate.id)
      console.log('Reloaded trades from storage:', reloadedTrades)
      setTrades(reloadedTrades)

      // Project data will be updated through trade storage
      // Just refresh the local state
      setProjectData({ ...projectData, updatedAt: new Date() })

      setEditingTrade(null)
      setIsAddingTrade(false)
    } catch (error) {
      console.error('Error saving trade:', error)
    }
  }

  const handleDeleteTrade = async (tradeId: string) => {
    if (!projectData) return

    const deleted = await deleteTrade_Hybrid(tradeId)
    if (deleted) {
      setTrades(prev => prev.filter(t => t.id !== tradeId))
      
      // Update project data
      // Update local state
      setProjectData({ ...projectData, updatedAt: new Date() })
    }
  }

  const handleCancelEdit = () => {
    setEditingTrade(null)
    setIsAddingTrade(false)
  }

  const handleAddDefaultCategories = () => {
    if (!projectData) return

    const defaultCategories = [
      'planning', 'site-prep', 'excavation-foundation', 'utilities', 'water-sewer',
      'rough-framing', 'windows-doors', 'exterior-finishes', 'roofing', 'masonry-paving',
      'porches-decks', 'insulation', 'plumbing', 'electrical', 'hvac', 'drywall',
      'interior-finishes', 'kitchen', 'bath', 'appliances'
    ]

    const newTrades: Trade[] = defaultCategories.map((category, index) => {
      const tradeId = uuidv4()
      return {
        id: tradeId,
        estimateId: projectData.estimate.id,
        category: category as any,
        name: `${TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.label || category} - To Be Determined`,
        description: '',
        quantity: 0,
        unit: 'each',
        laborCost: 0,
        laborRate: 0,
        laborHours: 0,
        materialCost: 0,
        materialRate: 0,
        subcontractorCost: 0,
        isSubcontracted: false,
        wasteFactor: DEFAULT_VALUES.WASTE_FACTOR,
        totalCost: 0,
        sortOrder: index,
        notes: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    })

    const updatedTrades = [...trades, ...newTrades]
    setTrades(updatedTrades)

    // Update local state
    setProjectData({ ...projectData, updatedAt: new Date() })
  }

  // ----------------------------------------------------------------------------
  // Calculations
  // ----------------------------------------------------------------------------

  const calculateTotals = () => {
    const basePriceTotal = trades.reduce((sum, trade) => sum + trade.totalCost, 0)
    const contingency = basePriceTotal * (contingencyPercent / 100)
    const grossProfitTotal = trades.reduce((sum, trade) => {
      // Calculate gross profit for each trade using per-item markup
      const itemMarkup = trade.markupPercent || markupPercent
      const markup = trade.totalCost * (itemMarkup / 100)
      return sum + markup
    }, 0)
    const totalEstimated = basePriceTotal + contingency + grossProfitTotal
    const marginOfProfit = totalEstimated > 0 ? (grossProfitTotal / totalEstimated) * 100 : 0

    return {
      basePriceTotal,
      contingency,
      grossProfitTotal,
      totalEstimated,
      marginOfProfit,
      markupPercent,
      contingencyPercent,
    }
  }

  const totals = calculateTotals()

  // ----------------------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------------------

  if (!projectData) {
    return <div>Loading...</div>
  }

  const handlePrintReport = (selectedDepth: ReportDepth) => {
    setReportDepth(selectedDepth)
    setShowPrintReport(true)
  }

  const handleSaveAsTemplate = () => {
    if (!templateName.trim()) {
      alert('Please enter a template name')
      return
    }

    if (trades.length === 0) {
      alert('Cannot save an empty estimate as a template')
      return
    }

    try {
      const template = createEstimateTemplate({
        name: templateName.trim(),
        description: templateDescription.trim() || undefined,
        trades,
        defaultMarkupPercent: markupPercent,
        defaultContingencyPercent: contingencyPercent,
      })

      alert(`Template "${template.name}" saved successfully!`)
      setShowSaveTemplateDialog(false)
      setTemplateName('')
      setTemplateDescription('')
    } catch (error) {
      console.error('Error saving template:', error)
      alert('Failed to save template')
    }
  }

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-0">
      <div className="p-2 sm:p-4 lg:p-6">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
          {/* Header Section with integrated back button */}
          <ProjectHeader
            project={projectData}
            onUpdate={handleProjectUpdate}
            onBack={onBack}
          />

        {/* Summary Section */}
        <SummarySection 
          totals={totals} 
          onContingencyChange={setContingencyPercent}
          onPrintReport={handlePrintReport}
          onSaveAsTemplate={() => setShowSaveTemplateDialog(true)}
        />

        {/* Main Trade Table */}
        <TradeTable
          trades={trades}
          onEditTrade={handleEditTrade}
          onDeleteTrade={handleDeleteTrade}
          onAddTrade={handleAddTrade}
          onAddDefaultCategories={handleAddDefaultCategories}
          defaultMarkupPercent={markupPercent}
        />

        {/* Trade Form Modal */}
        {editingTrade && (
          <TradeForm
            trade={editingTrade}
            onSave={handleSaveTrade}
            onCancel={handleCancelEdit}
            isAdding={isAddingTrade}
          />
        )}

        {/* Print Report */}
        {showPrintReport && projectData && (
          <PrintableReport
            project={projectData}
            trades={trades}
            reportType="estimate"
            depth={reportDepth}
            onClose={() => setShowPrintReport(false)}
          />
        )}

        {/* Save as Template Dialog */}
        {showSaveTemplateDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle>Save Estimate as Template</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="template-name">Template Name *</Label>
                  <Input
                    id="template-name"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    placeholder="e.g., Standard 3BR Remodel"
                  />
                </div>
                <div>
                  <Label htmlFor="template-description">Description</Label>
                  <Input
                    id="template-description"
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    placeholder="Optional description"
                  />
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm">
                  <p className="font-semibold text-blue-900 mb-1">Template Info:</p>
                  <ul className="text-blue-800 space-y-1">
                    <li>• {trades.length} line items will be saved</li>
                    <li>• Default markup: {markupPercent.toFixed(1)}%</li>
                    <li>• Default contingency: {contingencyPercent.toFixed(1)}%</li>
                  </ul>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveAsTemplate}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Template
                  </Button>
                  <Button
                    onClick={() => {
                      setShowSaveTemplateDialog(false)
                      setTemplateName('')
                      setTemplateDescription('')
                    }}
                    variant="outline"
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        </div>
      </div>
      
      {/* Mobile Back Button - Fixed at bottom */}
      {onBack && (
        <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 shadow-lg z-40">
          <Button
            onClick={onBack}
            variant="outline"
            className="border-gray-300 hover:bg-gray-50 w-full"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {project ? 'Back to Project Detail' : 'Back to Projects'}
          </Button>
        </div>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// Project Header Component
// ----------------------------------------------------------------------------

interface ProjectHeaderProps {
  project: Project
  onUpdate: (updates: Partial<Project>) => void
  onBack?: () => void
}

function ProjectHeader({ project, onUpdate, onBack }: ProjectHeaderProps) {
  const getStatusColor = (status: string) => {
    const colors = {
      estimating: 'bg-blue-100 text-blue-800',
      'in-progress': 'bg-orange-100 text-orange-800',
      complete: 'bg-green-100 text-green-800',
    }
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800'
  }

  return (
    <>
      {/* Mobile Header - Matches Project Detail Style */}
      <header className="sm:hidden bg-white shadow-md border-b border-gray-200">
        <div className="px-4 py-4">
          <div className="flex items-center space-x-3">
            <img src={hshLogo} alt="HSH Contractor" className="h-16 w-auto" />
            <div className="flex-1">
              <div className="flex flex-col gap-2 mb-1">
                <h1 className="text-lg font-bold text-gray-900">{project.name}</h1>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)} w-fit`}>
                  {project.status.replace('-', ' ').toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-gray-600">
                Plan: {project.metadata?.planId || 'N/A'}
                {project.metadata?.isCustomPlan && (
                  <span className="ml-1 text-xs bg-[#0E79C9] text-white px-1.5 py-0.5 rounded">Custom</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Desktop Header - Card Style with Full Details */}
      <Card className="hidden sm:block bg-gradient-to-br from-gray-50 to-white text-gray-900 border border-gray-200 shadow-lg">
        <CardHeader className="pb-3 sm:pb-6">
          <div className="space-y-2 sm:space-y-4">
            <div className="flex items-center justify-center gap-2 sm:gap-4 lg:gap-6">
            {/* HSH Logo */}
            <div className="flex-shrink-0">
              <img 
                src={hshLogo} 
                alt="HSH Contractor Logo" 
                className="h-20 sm:h-32 lg:h-40 w-auto"
              />
            </div>
            
            {/* Estimate Book Title */}
            <div className="flex-shrink-0">
                <h2 className="text-xl sm:text-4xl lg:text-5xl font-bold text-gray-900">Estimate Book</h2>
            </div>
          </div>
          
            {/* Back Button - Desktop Only */}
          {onBack && (
              <div className="hidden sm:flex justify-center">
              <Button
                onClick={onBack}
                variant="outline"
                  size="sm"
                  className="border-gray-300 hover:bg-gray-50 w-full max-w-md text-xs sm:text-sm"
              >
                  <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                {project ? 'Back to Project Detail' : 'Back to Projects'}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
          <div className="space-y-2 sm:space-y-3">
            {/* Row 1: Project Name | Plan ID | Project Type | Project Location */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-x-2 sm:gap-x-4 gap-y-2 sm:gap-y-3">
            <div>
                <Label className="text-[#E65133] text-xs sm:text-sm">Project Name</Label>
                <p className="text-gray-900 font-semibold text-xs sm:text-sm">{project.name}</p>
            </div>
            <div>
                <Label className="text-[#E65133] text-xs sm:text-sm">Plan ID</Label>
                <div className="flex items-center gap-1 sm:gap-2">
                  <p className="text-gray-900 font-semibold text-xs sm:text-sm">{project.metadata?.planId || 'Not set'}</p>
                  {project.metadata?.isCustomPlan && (
                    <span className="text-xs bg-[#0E79C9] text-white px-1 sm:px-2 py-0.5 rounded">
                      Custom
                    </span>
                  )}
            </div>
              {project.metadata?.planOptions && project.metadata.planOptions.length > 0 && (
                <div className="mt-1">
                  {project.metadata.planOptions.map((option: string) => (
                    <span 
                      key={option}
                        className="inline-block text-xs bg-purple-50 text-purple-700 px-1 sm:px-2 py-0.5 sm:py-1 rounded mr-1"
                    >
                      {option}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
                <Label className="text-[#E65133] text-xs sm:text-sm">Type</Label>
                <p className="text-gray-900 font-semibold text-xs sm:text-sm capitalize">{project.type.replace('-', ' ')}</p>
            </div>
            <div>
                <Label className="text-[#E65133] text-xs sm:text-sm">Location</Label>
                <p className="text-gray-900 font-semibold text-xs sm:text-sm">
                {project.address?.street || 'Not set'}
                {project.city && `, ${project.city}`}
                {project.state && `, ${project.state}`}
                {project.zipCode && ` ${project.zipCode}`}
              </p>
            </div>
            </div>
            
            {/* Row 2: Start Date | End Date | Status | Created */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-x-2 sm:gap-x-4 gap-y-2 sm:gap-y-3">
            <div>
                <Label className="text-[#E65133] text-xs sm:text-sm">Start Date</Label>
                <p className="text-gray-900 font-semibold text-xs sm:text-sm">
                {project.startDate ? project.startDate.toLocaleDateString() : 'Not set'}
              </p>
            </div>
            <div>
                <Label className="text-[#E65133] text-xs sm:text-sm">End Date</Label>
                <p className="text-gray-900 font-semibold text-xs sm:text-sm">
                {project.endDate ? project.endDate.toLocaleDateString() : 'Not set'}
              </p>
            </div>
            <div>
                <Label className="text-[#E65133] text-xs sm:text-sm">Status</Label>
                <p className="text-gray-900 font-semibold text-xs sm:text-sm capitalize">{project.status.replace('-', ' ')}</p>
            </div>
            <div>
                <Label className="text-[#E65133] text-xs sm:text-sm">Created</Label>
                <p className="text-gray-900 font-semibold text-xs sm:text-sm">{project.createdAt.toLocaleDateString()}</p>
            </div>
            </div>

          </div>
      </CardContent>
    </Card>
    </>
  )
}

// ----------------------------------------------------------------------------
// Summary Section Component
// ----------------------------------------------------------------------------

interface SummarySectionProps {
  totals: {
    basePriceTotal: number
    contingency: number
    grossProfitTotal: number
    totalEstimated: number
    marginOfProfit: number
    markupPercent: number
    contingencyPercent: number
  }
  onContingencyChange: (value: number) => void
  onPrintReport: (depth: ReportDepth) => void
  onSaveAsTemplate: () => void
}

function SummarySection({ totals, onContingencyChange, onPrintReport, onSaveAsTemplate }: SummarySectionProps) {
  const [isEditingContingency, setIsEditingContingency] = useState(false)
  const [tempContingency, setTempContingency] = useState(totals.contingencyPercent)
  const [showPrintMenu, setShowPrintMenu] = useState(false)
  
  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const formatPercent = (percent: number) => `${percent.toFixed(1)}%`
  
  const handleContingencySave = () => {
    onContingencyChange(tempContingency)
    setIsEditingContingency(false)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Estimate Summary</CardTitle>
          <div className="flex gap-2">
            <Button
              onClick={onSaveAsTemplate}
              variant="outline"
              size="sm"
              className="border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white"
            >
              <Save className="w-4 h-4 mr-2" />
              Save as Template
            </Button>
            <div className="relative">
              <Button
                onClick={() => setShowPrintMenu(!showPrintMenu)}
                variant="outline"
                size="sm"
                className="border-[#34AB8A] text-[#34AB8A] hover:bg-[#34AB8A] hover:text-white"
              >
                <Printer className="w-4 h-4 mr-2" />
                Export PDF
              </Button>
            
            {showPrintMenu && (
              <div className="absolute right-0 top-full mt-2 bg-white border border-gray-300 rounded-lg shadow-lg z-10 min-w-[200px]">
                <div className="p-2">
                  <p className="text-xs font-semibold text-gray-700 mb-2 px-2">Select Detail Level:</p>
                  <button
                    onClick={() => {
                      onPrintReport('summary')
                      setShowPrintMenu(false)
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm"
                  >
                    📊 Summary Only
                    <p className="text-xs text-gray-500">Category totals</p>
                  </button>
                  <button
                    onClick={() => {
                      onPrintReport('category')
                      setShowPrintMenu(false)
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm"
                  >
                    📋 Category Detail
                    <p className="text-xs text-gray-500">Subtotals by category</p>
                  </button>
                  <button
                    onClick={() => {
                      onPrintReport('full')
                      setShowPrintMenu(false)
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 rounded text-sm"
                  >
                    📄 Full Detail
                    <p className="text-xs text-gray-500">Every line item</p>
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-[#213069] text-white p-4 rounded-lg text-center shadow-lg">
            <p className="text-xs sm:text-sm opacity-90">Base Price Total</p>
            <p className="text-xl sm:text-2xl font-bold">{formatCurrency(totals.basePriceTotal)}</p>
          </div>
          <div 
            className="bg-[#D95C00] text-white p-4 rounded-lg text-center shadow-lg cursor-pointer hover:bg-[#C04F00] transition-colors"
            onClick={() => {
              setIsEditingContingency(true)
              setTempContingency(totals.contingencyPercent)
            }}
          >
            <p className="text-xs sm:text-sm opacity-90">
              Contingency ({formatPercent(totals.contingencyPercent)})
              <span className="ml-1">✏️</span>
            </p>
            <p className="text-xl sm:text-2xl font-bold">{formatCurrency(totals.contingency)}</p>
          </div>
          
          {/* Contingency Edit Dialog */}
          {isEditingContingency && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <Card className="w-full max-w-sm">
                <CardHeader>
                  <CardTitle>Edit Contingency %</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="mobile-contingency">Contingency Percentage</Label>
                    <Input
                      id="mobile-contingency"
                      type="number"
                      step="0.1"
                      value={tempContingency}
                      onChange={(e) => setTempContingency(parseFloat(e.target.value) || 0)}
                      className="text-lg"
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={handleContingencySave}
                      className="flex-1 bg-[#D95C00] hover:bg-[#C04F00]"
                    >
                      Save
                    </Button>
                    <Button 
                      onClick={() => setIsEditingContingency(false)}
                      variant="outline"
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          <div className="bg-[#D95C00] text-white p-4 rounded-lg text-center shadow-lg">
            <p className="text-xs sm:text-sm opacity-90">Gross Profit Total</p>
            <p className="text-xl sm:text-2xl font-bold">{formatCurrency(totals.grossProfitTotal)}</p>
          </div>
          <div className="bg-[#D95C00] text-white p-4 rounded-lg text-center shadow-lg">
            <p className="text-xs sm:text-sm opacity-90">Margin of Profit</p>
            <p className="text-xl sm:text-2xl font-bold">{formatPercent(totals.marginOfProfit)}</p>
          </div>
          <div className="bg-[#34AB8A] text-white p-4 rounded-lg text-center shadow-lg sm:col-span-2 lg:col-span-1">
            <p className="text-xs sm:text-sm opacity-90">Total Estimated</p>
            <p className="text-xl sm:text-2xl font-bold">{formatCurrency(totals.totalEstimated)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ----------------------------------------------------------------------------
// Trade Table Component
// ----------------------------------------------------------------------------

interface TradeTableProps {
  trades: Trade[]
  onEditTrade: (trade: Trade) => void
  onDeleteTrade: (tradeId: string) => void
  onAddTrade: () => void
  onAddDefaultCategories: () => void
  defaultMarkupPercent: number
}

function TradeTable({ trades, onEditTrade, onDeleteTrade, onAddTrade, onAddDefaultCategories, defaultMarkupPercent }: TradeTableProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  
  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const formatNumber = (num: number) => num.toFixed(2)

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  // Group trades by category
  const groupedTrades = trades.reduce((acc, trade) => {
    if (!acc[trade.category]) {
      acc[trade.category] = []
    }
    acc[trade.category].push(trade)
    return acc
  }, {} as Record<string, Trade[]>)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle>Estimate Breakdown</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button 
              onClick={onAddDefaultCategories}
              variant="outline"
              size="sm"
              className="border-[#0E79C9] text-[#0E79C9] hover:bg-[#0E79C9] hover:text-white w-full sm:w-auto"
            >
              <Package className="w-4 h-4 mr-2" />
              Add Default Categories
            </Button>
            <Button 
              onClick={onAddTrade}
              size="sm"
              className="bg-gradient-to-r from-[#E65133] to-[#C0392B] hover:from-[#D14520] hover:to-[#A93226] text-white border-none shadow-lg w-full sm:w-auto"
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              Add Cost Item
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Mobile View - Accordion Style */}
        <div className="md:hidden space-y-2">
          {Object.entries(groupedTrades).length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No cost items added yet. Click "Add Cost Item" to get started.
            </div>
          ) : (
            Object.entries(groupedTrades).map(([category, categoryTrades]) => {
              const categoryTotal = categoryTrades.reduce((sum, t) => sum + t.totalCost, 0)
              const categoryMarkup = categoryTrades.reduce((sum, t) => sum + t.totalCost * ((t.markupPercent || defaultMarkupPercent) / 100), 0)
              const categoryEstimated = categoryTotal + categoryMarkup
              const isExpanded = expandedCategories.has(category)

              return (
                <Card key={category} className="border-2 border-gray-200">
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">
                        {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.icon || '📦'}
                      </span>
                      <div className="text-left">
                        <p className="font-bold text-gray-900">
                          {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.label || category}
                        </p>
                        <p className="text-xs text-gray-500">{categoryTrades.length} items</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm text-gray-600">Total</p>
                        <p className="font-bold text-[#34AB8A]">{formatCurrency(categoryEstimated)}</p>
                      </div>
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-200 bg-gray-50 p-3 space-y-3">
                      {categoryTrades.map((trade) => (
                        <div key={trade.id} className="bg-white rounded-lg p-3 border border-gray-200">
                          <div className="flex items-start justify-between mb-2">
                            <h4 className="font-semibold text-gray-900">{trade.name}</h4>
                            <p className="font-bold text-[#34AB8A] text-lg">{formatCurrency(trade.totalCost * 1.111)}</p>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                            <div>
                              <span className="text-gray-500">Qty:</span>
                              <span className="ml-1 font-medium">{trade.quantity} {UNIT_TYPES[trade.unit]?.abbreviation}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Base:</span>
                              <span className="ml-1 font-medium">{formatCurrency(trade.totalCost)}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Material:</span>
                              <span className="ml-1 font-medium">{formatCurrency(trade.materialCost)}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Labor:</span>
                              <span className="ml-1 font-medium">{formatCurrency(trade.laborCost)}</span>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => onEditTrade(trade)}
                              className="flex-1"
                            >
                              <Edit className="w-3 h-3 mr-1" />
                              Edit
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive" 
                              onClick={() => onDeleteTrade(trade.id)}
                              className="flex-1"
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              )
            })
          )}
        </div>

        {/* Desktop View - Table */}
        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[1200px]">
            <thead>
              <tr className="border-b">
                <th className="p-3"></th>
                <th className="p-3"></th>
                <th className="p-3 border-r-2 border-gray-300"></th>
                <th className="text-center p-3 text-[#913E00] text-3xl font-bold border-r-2 border-gray-300" colSpan={2}>Material</th>
                <th className="text-center p-3 text-[#913E00] text-3xl font-bold border-r-2 border-gray-300" colSpan={2}>Labor</th>
                <th className="p-3"></th>
                <th className="p-3"></th>
                <th className="p-3"></th>
                <th className="p-3"></th>
                <th className="p-3"></th>
                <th className="p-3"></th>
                <th className="p-3"></th>
              </tr>
              <tr className="border-b">
                <th className="text-left p-3 bg-[#213069] text-white border-r-2 border-gray-300">Category & Items</th>
                <th className="text-center p-3 bg-[#213069] text-white border-r-2 border-gray-300">Qty</th>
                <th className="text-center p-3 bg-[#213069] text-white border-r-2 border-gray-300">Unit</th>
                <th className="text-center p-3 bg-[#213069] text-white">Unit Cost</th>
                <th className="text-center p-3 bg-[#213069] text-white border-r-2 border-gray-300">Cost</th>
                <th className="text-center p-3 bg-[#213069] text-white">Unit Cost</th>
                <th className="text-center p-3 bg-[#213069] text-white border-r-2 border-gray-300">Cost</th>
                <th className="text-center p-3 bg-[#0E79C9] text-white border-r-2 border-gray-300">Base Price</th>
                <th className="text-center p-3 bg-[#D95C00] text-white border-r-2 border-gray-300">Markup</th>
                <th className="text-center p-3 bg-[#D95C00] text-white border-r-2 border-gray-300">Gross Profit</th>
                <th className="text-center p-3 bg-[#D95C00] text-white border-r-2 border-gray-300">Margin</th>
                <th className="text-center p-3 bg-[#34AB8A] text-white border-r-2 border-gray-300">Total Estimated</th>
                <th className="text-center p-3 bg-[#34AB8A] text-white">Actions</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(groupedTrades).map(([category, categoryTrades]) => {
                const isExpanded = expandedCategories.has(category)
                
                return (
                <React.Fragment key={category}>
                  <tr 
                    className="bg-gray-50 font-semibold cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => toggleCategory(category)}
                  >
                    <td className="p-3 border-b border-r-2 border-gray-300">
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4 rotate-180" />}
                        {TRADE_CATEGORIES[category as keyof typeof TRADE_CATEGORIES]?.label || category}
                      </div>
                    </td>
                    <td className="p-3 text-center border-b border-r-2 border-gray-300"></td>
                    <td className="p-3 text-center border-b border-r-2 border-gray-300"></td>
                    <td className="p-3 text-center border-b"></td>
                    <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(categoryTrades.reduce((sum, t) => sum + t.materialCost, 0))}</td>
                    <td className="p-3 text-center border-b"></td>
                    <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(categoryTrades.reduce((sum, t) => sum + t.laborCost, 0))}</td>
                    <td className="p-3 text-center border-b font-bold border-r-2 border-gray-300">{formatCurrency(categoryTrades.reduce((sum, t) => sum + t.totalCost, 0))}</td>
                    <td className="p-3 text-center border-b border-r-2 border-gray-300 text-gray-500">-</td>
                    <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(categoryTrades.reduce((sum, t) => sum + t.totalCost * ((t.markupPercent || defaultMarkupPercent) / 100), 0))}</td>
                    <td className="p-3 text-center border-b border-r-2 border-gray-300 text-gray-500">-</td>
                    <td className="p-3 text-center border-b font-bold border-r-2 border-gray-300">{formatCurrency(categoryTrades.reduce((sum, t) => sum + t.totalCost * (1 + (t.markupPercent || defaultMarkupPercent) / 100), 0))}</td>
                    <td className="p-3 text-center border-b"></td>
                  </tr>
                  {isExpanded && categoryTrades.map((trade) => (
                    <tr key={trade.id} className="hover:bg-gray-50">
                      <td className="p-3 border-b pl-6 border-r-2 border-gray-300">{trade.name}</td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300">{trade.quantity}</td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300">{UNIT_TYPES[trade.unit]?.abbreviation || trade.unit}</td>
                      <td className="p-3 text-center border-b">{trade.materialRate ? formatCurrency(trade.materialRate) : '-'}</td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(trade.materialCost)}</td>
                      <td className="p-3 text-center border-b">{trade.laborRate ? formatCurrency(trade.laborRate) : '-'}</td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(trade.laborCost)}</td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(trade.totalCost)}</td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300">{(trade.markupPercent || defaultMarkupPercent).toFixed(1)}%</td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(trade.totalCost * ((trade.markupPercent || defaultMarkupPercent) / 100))}</td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300">{(((trade.markupPercent || defaultMarkupPercent) / (100 + (trade.markupPercent || defaultMarkupPercent))) * 100).toFixed(1)}%</td>
                      <td className="p-3 text-center border-b border-r-2 border-gray-300">{formatCurrency(trade.totalCost * (1 + (trade.markupPercent || defaultMarkupPercent) / 100))}</td>
                      <td className="p-3 text-center border-b">
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => onEditTrade(trade)}>Edit</Button>
                          <Button size="sm" variant="destructive" onClick={() => onDeleteTrade(trade.id)}>Delete</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              )})}
              {trades.length === 0 && (
                <tr>
                  <td colSpan={13} className="p-8 text-center text-gray-500">
                    No cost items added yet. Click "Add Cost Item" to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ----------------------------------------------------------------------------
// Trade Form Component
// ----------------------------------------------------------------------------

interface TradeFormProps {
  trade: TradeFormData
  onSave: (data: TradeFormData) => Promise<void>
  onCancel: () => void
  isAdding: boolean
}

function TradeForm({ trade, onSave, onCancel, isAdding }: TradeFormProps) {
  const [formData, setFormData] = useState<TradeFormData>(trade)
  const [subcontractorEntryMode, setSubcontractorEntryMode] = useState<'lump-sum' | 'breakdown'>('lump-sum')
  const [itemTemplates, setItemTemplates] = useState<any[]>([])

  // Load item templates when category changes
  React.useEffect(() => {
    if (formData.category) {
      getItemTemplatesByCategory(formData.category).then(templates => {
        setItemTemplates(templates)
      })
    }
  }, [formData.category])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSave(formData)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">{isAdding ? 'Add Cost Item' : 'Edit Cost Item'}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category">Category</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData(prev => ({ ...prev, category: value as any }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(TRADE_CATEGORIES).map(([key, value]) => (
                      <SelectItem key={key} value={key}>
                        {value.icon} {value.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="name">Item Name *</Label>
                <div className="space-y-2">
                  {itemTemplates.length > 0 && (
                    <Select 
                      value="__template__"
                      onValueChange={(value) => {
                        // Find the selected template
                        const template = itemTemplates.find(t => t.name === value)
                        
                        if (template) {
                          // Use template defaults
                          setFormData(prev => {
                            const qty = prev.quantity || 1
                            return {
                              ...prev,
                              name: template.name,
                              unit: template.defaultUnit,
                              isSubcontracted: template.isSubcontracted,
                              materialRate: template.defaultMaterialRate,
                              laborRate: template.defaultLaborRate,
                              subcontractorCost: template.defaultSubcontractorCost || 0,
                              materialCost: (template.defaultMaterialRate || 0) * qty,
                              laborCost: (template.defaultLaborRate || 0) * qty,
                            }
                          })
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Load from template..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__template__">Load from template...</SelectItem>
                        {itemTemplates.map((template) => (
                          <SelectItem key={template.id} value={template.name}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Input
                    id="name"
                    placeholder="Type item name..."
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={formData.quantity}
                  onChange={(e) => {
                    const qty = parseFloat(e.target.value) || 0
                    setFormData(prev => {
                      // Recalculate costs if rates are already set
                      const newMaterialCost = prev.materialRate ? qty * prev.materialRate : prev.materialCost
                      const newLaborCost = prev.laborRate ? qty * prev.laborRate : prev.laborCost
                      
                      return {
                        ...prev,
                        quantity: qty,
                        materialCost: newMaterialCost,
                        laborCost: newLaborCost,
                      }
                    })
                  }}
                  required
                />
              </div>
              <div>
                <Label htmlFor="unit">Unit</Label>
                <Select value={formData.unit} onValueChange={(value) => setFormData(prev => ({ ...prev, unit: value as any }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(UNIT_TYPES).map(([key, value]) => (
                      <SelectItem key={key} value={key}>
                        {value.abbreviation}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="isSubcontracted">Work Performed By</Label>
                <Select 
                  value={formData.isSubcontracted ? 'yes' : 'no'} 
                  onValueChange={(value) => setFormData(prev => ({ 
                    ...prev, 
                    isSubcontracted: value === 'yes',
                    // Clear subcontractor cost when switching to self-performed
                    subcontractorCost: value === 'yes' ? prev.subcontractorCost : 0
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">Self-Performed</SelectItem>
                    <SelectItem value="yes">Subcontracted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {formData.isSubcontracted && (
                <div>
                  <Label htmlFor="subEntryMode">Subcontractor Entry Type</Label>
                  <Select 
                    value={subcontractorEntryMode} 
                    onValueChange={(value: 'lump-sum' | 'breakdown') => setSubcontractorEntryMode(value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lump-sum">Lump Sum Quote</SelectItem>
                      <SelectItem value="breakdown">Material + Labor Breakdown</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Material fields - hide when subcontracted with lump sum */}
            {(!formData.isSubcontracted || subcontractorEntryMode === 'breakdown') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="materialRate">Material Unit Cost</Label>
                <Input
                  id="materialRate"
                  type="number"
                  step="0.01"
                  value={formData.materialRate || ''}
                  onChange={(e) => {
                    const rate = parseFloat(e.target.value) || 0
                    const cost = rate * formData.quantity
                    setFormData(prev => ({ ...prev, materialRate: rate, materialCost: cost }))
                  }}
                />
              </div>
              <div>
                <Label htmlFor="materialCost">Material Cost</Label>
                <Input
                  id="materialCost"
                  type="number"
                  step="0.01"
                  value={formData.materialCost}
                  onChange={(e) => {
                    const cost = parseFloat(e.target.value) || 0
                    const rate = formData.quantity > 0 ? cost / formData.quantity : 0
                    setFormData(prev => ({ ...prev, materialCost: cost, materialRate: rate }))
                  }}
                />
              </div>
              </div>
            )}

            {formData.isSubcontracted ? (
              subcontractorEntryMode === 'lump-sum' ? (
              <div>
                  <Label htmlFor="subcontractorCost">Subcontractor Lump Sum Cost</Label>
                  <Input
                    id="subcontractorCost"
                    type="number"
                    step="0.01"
                    value={formData.subcontractorCost}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      subcontractorCost: parseFloat(e.target.value) || 0,
                      materialCost: 0,
                      laborCost: 0,
                    }))}
                    placeholder="Enter total quoted price"
                  />
              </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="laborRate">Labor Unit Cost</Label>
                    <Input
                      id="laborRate"
                      type="number"
                      step="0.01"
                      value={formData.laborRate || ''}
                      onChange={(e) => {
                        const rate = parseFloat(e.target.value) || 0
                        const cost = rate * formData.quantity
                        setFormData(prev => ({ ...prev, laborRate: rate, laborCost: cost, subcontractorCost: 0 }))
                      }}
                    />
            </div>
                  <div>
                    <Label htmlFor="laborCost">Labor Cost</Label>
                    <Input
                      id="laborCost"
                      type="number"
                      step="0.01"
                      value={formData.laborCost}
                      onChange={(e) => {
                        const cost = parseFloat(e.target.value) || 0
                        const rate = formData.quantity > 0 ? cost / formData.quantity : 0
                        setFormData(prev => ({ ...prev, laborCost: cost, laborRate: rate, subcontractorCost: 0 }))
                      }}
                    />
                  </div>
                </div>
              )
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="laborRate">Labor Unit Cost</Label>
                <Input
                  id="laborRate"
                  type="number"
                  step="0.01"
                  value={formData.laborRate || ''}
                  onChange={(e) => {
                    const rate = parseFloat(e.target.value) || 0
                    const cost = rate * formData.quantity
                    setFormData(prev => ({ ...prev, laborRate: rate, laborCost: cost }))
                  }}
                />
              </div>
              <div>
                <Label htmlFor="laborCost">Labor Cost</Label>
                <Input
                  id="laborCost"
                  type="number"
                  step="0.01"
                  value={formData.laborCost}
                  onChange={(e) => {
                    const cost = parseFloat(e.target.value) || 0
                    const rate = formData.quantity > 0 ? cost / formData.quantity : 0
                    setFormData(prev => ({ ...prev, laborCost: cost, laborRate: rate }))
                  }}
                />
              </div>
              </div>
            )}

              <div>
              <Label htmlFor="markupPercent">Markup % (for this item)</Label>
                <Input
                id="markupPercent"
                  type="number"
                step="0.1"
                value={formData.markupPercent || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, markupPercent: parseFloat(e.target.value) || 0 }))}
                placeholder="e.g., 11.1"
              />
              <p className="text-xs text-gray-500 mt-1">
                Leave blank to use default markup percentage
              </p>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div>
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={formData.notes || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={onCancel}
                className="border-[#66A3FF] text-[#66A3FF] hover:bg-[#66A3FF] hover:text-white"
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                className="bg-gradient-to-r from-[#E65133] to-[#C0392B] hover:from-[#D14520] hover:to-[#A93226] text-white border-none shadow-lg"
              >
                {isAdding ? 'Add Cost Item' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
